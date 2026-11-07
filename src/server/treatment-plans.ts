// ClearView ABA Suite — Treatment Plan server functions
// All data mutations happen server-side via createServerFn.
//
// Every handler resolves the caller's practice from the session and passes it to
// the db layer, so a plan / client / assessment id from another practice reads
// as "not found".

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
} from "~/db/types";
import { requireSession } from "~/server/auth-guard";

// ---------------------------------------------------------------------------
// List treatment plans (with optional filters)
// ---------------------------------------------------------------------------
export const listTreatmentPlansFn = createServerFn({ method: "GET" })
  .validator(
    (d: unknown) =>
      d as { search?: string; status?: string; clientId?: string } | undefined,
  )
  .handler(async ({ data }) => {
    const { practiceId } = await requireSession();
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
    return listTreatmentPlans(practiceId, opts);
  });

// ---------------------------------------------------------------------------
// Get a single treatment plan by ID (null when it belongs to another practice)
// ---------------------------------------------------------------------------
export const getTreatmentPlanFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    const { practiceId } = await requireSession();
    return getTreatmentPlan(practiceId, data.id);
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
    const { practiceId, user } = await requireSession();
    const plan = await createTreatmentPlan(
      practiceId,
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
      user.email,
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
    const { practiceId, user } = await requireSession();
    return updateTreatmentPlan(practiceId, data.id, data.data, user.email);
  });

// ---------------------------------------------------------------------------
// Delete a treatment plan
// ---------------------------------------------------------------------------
export const deleteTreatmentPlanFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    const { practiceId, user } = await requireSession();
    return deleteTreatmentPlan(practiceId, data.id, user.email);
  });

// ---------------------------------------------------------------------------
// Get client with their completed assessments (for new plan flow)
// ---------------------------------------------------------------------------
export const getClientWithCompletedAssessmentsFn = createServerFn({
  method: "GET",
})
  .validator((d: unknown) => d as { clientId: string })
  .handler(async ({ data }) => {
    const { practiceId } = await requireSession();
    const client = await getClient(practiceId, data.clientId);
    const assessments = client
      ? await listAssessments(practiceId, {
          clientId: data.clientId,
          status: "completed",
        })
      : [];
    return { client, assessments };
  });

// ---------------------------------------------------------------------------
// Get full context for a plan (client + linked assessment + signatures)
// ---------------------------------------------------------------------------
export const getTreatmentPlanContextFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { planId: string })
  .handler(async ({ data }) => {
    const { practiceId } = await requireSession();
    const plan = await getTreatmentPlan(practiceId, data.planId);
    if (!plan) {
      return { plan: null, client: null, assessment: null, signatures: [] };
    }

    const client = await getClient(practiceId, plan.client_id);
    let assessment: Assessment | null = null;
    if (plan.assessment_id) {
      assessment = await getAssessment(practiceId, plan.assessment_id);
    }
    // Loaded here so a signed plan renders as signed on first paint.
    const signatures = await getSignatures(practiceId, "treatment_plan", plan.id);

    return { plan, client, assessment, signatures };
  });
