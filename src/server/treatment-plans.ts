// ClearView ABA Suite — Treatment Plan server functions
// All data mutations happen server-side via createServerFn.
// Wraps the db.ts CRUD helpers with audit logging (changedBy = "system" for MVP).

import { createServerFn } from "@tanstack/react-start";
import {
  getTreatmentPlan,
  listTreatmentPlans,
  createTreatmentPlan,
  updateTreatmentPlan,
  deleteTreatmentPlan,
  getClient,
  listAssessments,
  getAssessment,
  getSignatures,
} from "~/db";
import type {
  TreatmentPlan,
  TreatmentPlanStatus,
  Assessment,
  Client,
} from "~/db/types";

// ---------------------------------------------------------------------------
// List treatment plans (with optional filters)
// ---------------------------------------------------------------------------
export const listTreatmentPlansFn = createServerFn({ method: "GET" })
  .validator(
    (d: unknown) =>
      d as { search?: string; status?: string; clientId?: string } | undefined,
  )
  .handler(async ({ data }) => {
    const opts: {
      status?: TreatmentPlanStatus;
      clientId?: string;
      limit?: number;
    } = { limit: 100 };

    if (
      data?.status &&
      ["draft", "review", "approved", "active", "completed"].includes(
        data.status,
      )
    ) {
      opts.status = data.status as TreatmentPlanStatus;
    }
    if (data?.clientId) {
      opts.clientId = data.clientId;
    }
    return listTreatmentPlans(opts);
  });

// ---------------------------------------------------------------------------
// Get a single treatment plan by ID
// ---------------------------------------------------------------------------
export const getTreatmentPlanFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    return getTreatmentPlan(data.id);
  });

// ---------------------------------------------------------------------------
// Create a new treatment plan (draft)
// ---------------------------------------------------------------------------
export const createTreatmentPlanFn = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        clientId: string;
        assessmentId?: string;
      },
  )
  .handler(async ({ data }) => {
    const plan = await createTreatmentPlan(
      {
        client_id: data.clientId,
        assessment_id: data.assessmentId ?? null,
        reason_for_referral: null,
        diagnosis: null,
        treatment_history: null,
        concurrent_services: [],
        family_history: null,
        school_info: null,
        maladaptive_behaviors: [],
        behavior_intervention_plan: null,
        skill_acquisition_goals: [],
        assessment_outcomes: null,
        parent_training_goals: [],
        service_coordination_goals: [],
        discharge_criteria: null,
        requested_services: [],
        therapy_schedule: [],
        status: "draft",
      },
      "system",
    );
    return plan;
  });

// ---------------------------------------------------------------------------
// Update an existing treatment plan — with audit logging
// ---------------------------------------------------------------------------
export const updateTreatmentPlanFn = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        id: string;
        data: Partial<Omit<TreatmentPlan, "id" | "created_at" | "updated_at">>;
      },
  )
  .handler(async ({ data }) => {
    return updateTreatmentPlan(data.id, data.data, "system");
  });

// ---------------------------------------------------------------------------
// Delete a treatment plan
// ---------------------------------------------------------------------------
export const deleteTreatmentPlanFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    return deleteTreatmentPlan(data.id, "system");
  });

// ---------------------------------------------------------------------------
// Get client with their completed assessments (for new plan flow)
// ---------------------------------------------------------------------------
export const getClientWithCompletedAssessmentsFn = createServerFn({
  method: "GET",
})
  .validator((d: unknown) => d as { clientId: string })
  .handler(async ({ data }) => {
    const client = await getClient(data.clientId);
    const assessments = await listAssessments({
      clientId: data.clientId,
      status: "completed",
    });
    return { client, assessments };
  });

// ---------------------------------------------------------------------------
// Get full context for a plan (client + linked assessment + signatures)
// ---------------------------------------------------------------------------
export const getTreatmentPlanContextFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { planId: string })
  .handler(async ({ data }) => {
    const plan = await getTreatmentPlan(data.planId);
    if (!plan) {
      return { plan: null, client: null, assessment: null, signatures: [] };
    }

    const client = await getClient(plan.client_id);
    let assessment: Assessment | null = null;
    if (plan.assessment_id) {
      assessment = await getAssessment(plan.assessment_id);
    }
    // Loaded here so a signed plan renders as signed on first paint.
    const signatures = await getSignatures("treatment_plan", plan.id);

    return { plan, client, assessment, signatures };
  });
