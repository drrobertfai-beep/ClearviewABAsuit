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
import { computeVBMAPPScoring } from "~/lib/vbmapp-scoring";

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
