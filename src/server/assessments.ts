// ClearView ABA Suite — Assessment server functions
// All data mutations happen server-side via createServerFn.
// Wraps the db.ts CRUD helpers with audit logging (changedBy = "system" for MVP).

import { createServerFn } from "@tanstack/react-start";
import {
  getAssessment,
  listAssessments,
  createAssessment,
  updateAssessment,
  deleteAssessment,
} from "~/db";
import type { Assessment, AssessmentStatus } from "~/db/types";

// ---------------------------------------------------------------------------
// List assessments (with optional filters)
// ---------------------------------------------------------------------------
export const listAssessmentsFn = createServerFn({ method: "GET" })
  .validator(
    (d: unknown) =>
      d as
        | { search?: string; status?: string; tool?: string; clientId?: string }
        | undefined,
  )
  .handler(async ({ data }) => {
    const opts: {
      status?: AssessmentStatus;
      clientId?: string;
      limit?: number;
    } = { limit: 100 };

    if (
      data?.status &&
      ["draft", "in_progress", "completed"].includes(data.status)
    ) {
      opts.status = data.status as AssessmentStatus;
    }
    if (data?.clientId) {
      opts.clientId = data.clientId;
    }
    return listAssessments(opts);
  });

// ---------------------------------------------------------------------------
// Get a single assessment by ID
// ---------------------------------------------------------------------------
export const getAssessmentFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    return getAssessment(data.id);
  });

// ---------------------------------------------------------------------------
// Create a new assessment
// ---------------------------------------------------------------------------
export const createAssessmentFn = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        clientId: string;
        toolName: string;
        toolVersion?: string;
      },
  )
  .handler(async ({ data }) => {
    const assessment = await createAssessment(
      {
        client_id: data.clientId,
        tool_name: data.toolName as Assessment["tool_name"],
        tool_version: data.toolVersion ?? null,
        assessment_date: new Date().toISOString().split("T")[0],
        assessor_name: "system",
        status: "draft",
        raw_scores: {},
        summary_notes: null,
      },
      "system",
    );
    return assessment;
  });

// ---------------------------------------------------------------------------
// Update an existing assessment (save raw_scores + status)
// ---------------------------------------------------------------------------
export const updateAssessmentFn = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        id: string;
        data: {
          raw_scores?: Record<string, unknown>;
          status?: AssessmentStatus;
          summary_notes?: string;
          assessor_name?: string;
        };
      },
  )
  .handler(async ({ data }) => {
    const patch: Record<string, unknown> = {};

    if (data.data.raw_scores !== undefined) {
      // Compute summary scoring server-side if raw_scores is provided
      const computed = computeVBMAPPScoring(data.data.raw_scores);
      // Store the original raw_scores (with individual items) — computed summary is merged in
      patch.raw_scores = { ...data.data.raw_scores, _computed: computed };
    }
    if (data.data.status !== undefined) {
      patch.status = data.data.status;
    }
    if (data.data.summary_notes !== undefined) {
      patch.summary_notes = data.data.summary_notes;
    }
    if (data.data.assessor_name !== undefined) {
      patch.assessor_name = data.data.assessor_name;
    }

    return updateAssessment(
      data.id,
      patch as Partial<Omit<Assessment, "id" | "created_at" | "updated_at">>,
      "system",
    );
  });

// ---------------------------------------------------------------------------
// Delete an assessment
// ---------------------------------------------------------------------------
export const deleteAssessmentFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    return deleteAssessment(data.id, "system");
  });

// ---------------------------------------------------------------------------
// Server-side scoring computation for VB-MAPP
// ---------------------------------------------------------------------------
function computeVBMAPPScoring(rawScores: Record<string, unknown>): Record<string, unknown> {
  const computed: Record<string, unknown> = {};

  // Milestones: sum item arrays per domain per level
  if (rawScores.milestones && typeof rawScores.milestones === "object") {
    const ms = rawScores.milestones as Record<string, unknown>;
    const totals: Record<string, Record<string, number>> = {};
    const grandTotals: Record<string, number> = {};
    let overallMilestones = 0;

    for (const [level, domains] of Object.entries(ms)) {
      if (!domains || typeof domains !== "object") continue;
      totals[level] = {};
      let levelTotal = 0;

      for (const [domain, items] of Object.entries(domains as Record<string, unknown>)) {
        if (Array.isArray(items)) {
          const sum = items.reduce((a: number, v: unknown) => a + (typeof v === "number" ? v : 0), 0);
          totals[level][domain] = Math.round(sum * 10) / 10;
          levelTotal += sum;
        }
      }
      grandTotals[level] = Math.round(levelTotal * 10) / 10;
      overallMilestones += levelTotal;
    }

    computed.milestones = {
      domainTotals: totals,
      levelTotals: grandTotals,
      overallTotal: Math.round(overallMilestones * 10) / 10,
      maxOverall: 170,
    };
  }

  // Barriers: sum individual scores (0-4 each, 24 items → max 96)
  if (rawScores.barriers && typeof rawScores.barriers === "object") {
    const barriers = rawScores.barriers as Record<string, unknown>;
    let barrierTotal = 0;
    let barrierCount = 0;
    for (const [, score] of Object.entries(barriers)) {
      if (typeof score === "number") {
        barrierTotal += score;
        barrierCount++;
      }
    }
    computed.barriers = {
      total: barrierTotal,
      count: barrierCount,
      max: barrierCount * 4,
    };
  }

  // Transition: sum scores (0-2 each, 18 items → max 36)
  if (rawScores.transition && typeof rawScores.transition === "object") {
    const trans = rawScores.transition as Record<string, unknown>;
    let transTotal = 0;
    let transCount = 0;
    for (const [, score] of Object.entries(trans)) {
      if (typeof score === "number") {
        transTotal += score;
        transCount++;
      }
    }
    computed.transition = {
      total: transTotal,
      count: transCount,
      max: transCount * 2,
    };
  }

  // EESA: sum each group array
  if (rawScores.eesa && typeof rawScores.eesa === "object") {
    const eesa = rawScores.eesa as Record<string, unknown>;
    const groupTotals: Record<string, number> = {};
    let eesaTotal = 0;
    for (const [group, items] of Object.entries(eesa)) {
      if (Array.isArray(items)) {
        const sum = items.reduce((a: number, v: unknown) => a + (typeof v === "number" ? v : 0), 0);
        groupTotals[group] = Math.round(sum * 10) / 10;
        eesaTotal += sum;
      }
    }
    computed.eesa = {
      groupTotals,
      overallTotal: Math.round(eesaTotal * 10) / 10,
    };
  }

  // Task Analysis: per-domain percentages
  if (rawScores.task_analysis && typeof rawScores.task_analysis === "object") {
    const ta = rawScores.task_analysis as Record<string, unknown>;
    const domainPcts: Record<string, number> = {};
    let taTotalCompleted = 0;
    let taTotalItems = 0;

    for (const [domain, items] of Object.entries(ta)) {
      if (Array.isArray(items)) {
        const completed = items.filter((v) => v === 1).length;
        const total = items.length;
        domainPcts[domain] = total > 0 ? Math.round((completed / total) * 100) : 0;
        taTotalCompleted += completed;
        taTotalItems += total;
      }
    }
    computed.task_analysis = {
      domainPercentages: domainPcts,
      overallPercentage: taTotalItems > 0 ? Math.round((taTotalCompleted / taTotalItems) * 100) : 0,
      totalCompleted: taTotalCompleted,
      totalItems: taTotalItems,
    };
  }

  return computed;
}
