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
  findReauthorizationDraft,
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
import { requirePracticeRole, requireSession } from "~/server/auth-guard";
import {
  normalizeSchedule,
  normalizeServiceLines,
  normalizeTitrationPhases,
  totalHoursPerWeek,
} from "~/lib/treatment-plan-authz";
import {
  ensureGoalIds,
  normalizeGoalProgress,
} from "~/lib/reauthorization";
import type { GoalProgress } from "~/lib/reauthorization";

/**
 * Plans written before the authorization fields existed hold the legacy jsonb
 * shapes for services and schedule. Normalizing on write means every save
 * migrates a plan to the current shape, so old and new rows converge without a
 * data migration.
 */
function normalizeAuthorizationFields(
  data: Partial<Omit<TreatmentPlan, "id" | "created_at" | "updated_at">>,
): Partial<Omit<TreatmentPlan, "id" | "created_at" | "updated_at">> {
  const next = { ...data };
  if ("requested_services" in next) {
    next.requested_services = normalizeServiceLines(next.requested_services);
  }
  if ("therapy_schedule" in next) {
    next.therapy_schedule = normalizeSchedule(next.therapy_schedule);
  }
  if ("titration_phases" in next) {
    // Store exactly the shape the reader expects, so a hand-built payload can
    // never write a phase the editor and PDF cannot render.
    next.titration_phases = normalizeTitrationPhases(next.titration_phases);
  }
  // Every goal written from here on carries a stable id, and an existing id is
  // never replaced — that id is what links the goal to the prior period.
  if ("skill_acquisition_goals" in next) {
    next.skill_acquisition_goals = ensureGoalIds(
      next.skill_acquisition_goals,
    ).goals;
  }
  if ("maladaptive_behaviors" in next) {
    next.maladaptive_behaviors = ensureGoalIds(next.maladaptive_behaviors).goals;
  }
  if ("goal_progress" in next) {
    next.goal_progress = normalizeGoalProgress(next.goal_progress);
  }
  for (const key of ["authorization_start_date", "authorization_end_date"] as const) {
    if (key in next) {
      const value = next[key];
      next[key] = typeof value === "string" && value.trim() ? value.slice(0, 10) : null;
    }
  }
  return next;
}

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
    const { practiceId, user } = await requirePracticeRole([
      "owner",
      "admin",
      "clinician",
    ]);
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
        clinical_justification: null,
        authorization_start_date: null,
        authorization_end_date: null,
        authorization_number: null,
        titration_rationale: null,
        titration_phases: [],
        prior_plan_id: null,
        goal_progress: [],
        hours_increase_justification: null,
        status: "draft",
      },
      user.email,
    );
    return plan;
  });

// ---------------------------------------------------------------------------
// Start a reauthorization from an existing plan
// ---------------------------------------------------------------------------
// A reauthorization is a treatment plan created from a prior plan: the goals
// (each with its stable id), the service lines, the schedule and the titration
// plan carry forward, and a progress record is opened for every goal. What does
// NOT carry forward is the signature set (a new authorization needs a fresh
// signature), the status (a reauthorization starts as a draft) and the prior
// authorization period / number (the new one is assigned to the new plan; the
// prior one stays visible through `prior_plan_id`).
export const createReauthorizationFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { planId: string })
  .handler(async ({ data }) => {
    const { practiceId, user } = await requirePracticeRole([
      "owner",
      "admin",
      "clinician",
    ]);

    const prior = await getTreatmentPlan(practiceId, data.planId);
    if (!prior) throw new Error("Treatment plan not found.");

    if (prior.status !== "approved" && prior.status !== "active") {
      throw new Error(
        "A reauthorization starts from an approved or active plan.",
      );
    }
    if (!prior.authorization_number?.trim()) {
      throw new Error(
        "This plan has no authorization number yet, so there is nothing to reauthorize.",
      );
    }

    // Opening the reauthorization twice lands on the same draft instead of
    // minting a second copy of the same goals.
    const existing = await findReauthorizationDraft(practiceId, prior.id);
    if (existing) return existing;

    // The prior plan's goals are the link to this period, so they need their
    // ids before the progress records can point at them. Ids minted here are
    // written back to the prior plan, so the same goal keeps the same id on
    // every future read.
    const priorSkillGoals = ensureGoalIds(prior.skill_acquisition_goals);
    const priorBehaviorGoals = ensureGoalIds(prior.maladaptive_behaviors);
    if (priorSkillGoals.minted > 0 || priorBehaviorGoals.minted > 0) {
      await updateTreatmentPlan(
        practiceId,
        prior.id,
        {
          skill_acquisition_goals: priorSkillGoals.goals,
          maladaptive_behaviors: priorBehaviorGoals.goals,
        },
        user.email,
      );
    }

    // Progress opens as "progressing" with the goal's own baseline carried in.
    // The mastery criterion is the goal's own `measurement` and is never
    // invented here — it is read from the goal wherever progress is shown.
    const goalProgress: GoalProgress[] = priorSkillGoals.goals.map((goal) => ({
      goal_id: goal.id,
      baseline: goal.baseline,
      current: "",
      status: "progressing",
      note: "",
      dropped: false,
      drop_reason: "",
    }));

    // Client and diagnosis come from the client record, not frozen from the old
    // plan — a diagnosis corrected since the last authorization carries.
    const client = await getClient(practiceId, prior.client_id);
    const diagnoses = Array.isArray(client?.diagnoses)
      ? (client.diagnoses as string[]).filter((d) => typeof d === "string" && d.trim())
      : [];
    const diagnosis = diagnoses.length > 0 ? diagnoses.join(", ") : prior.diagnosis;

    const plan = await createTreatmentPlan(
      practiceId,
      {
        client_id: prior.client_id,
        assessment_id: prior.assessment_id,
        prior_plan_id: prior.id,
        reason_for_referral: prior.reason_for_referral,
        diagnosis,
        treatment_history: prior.treatment_history,
        concurrent_services: prior.concurrent_services,
        family_history: prior.family_history,
        school_info: prior.school_info,
        maladaptive_behaviors: priorBehaviorGoals.goals,
        behavior_intervention_plan: prior.behavior_intervention_plan,
        skill_acquisition_goals: priorSkillGoals.goals,
        assessment_outcomes: prior.assessment_outcomes,
        parent_training_goals: prior.parent_training_goals,
        service_coordination_goals: prior.service_coordination_goals,
        discharge_criteria: prior.discharge_criteria,
        // Requested hours default to the prior request; the BCBA adjusts them
        // and, if the hours rise, has to say why.
        requested_services: normalizeServiceLines(prior.requested_services),
        therapy_schedule: normalizeSchedule(prior.therapy_schedule),
        clinical_justification: prior.clinical_justification,
        // The new period's dates are the BCBA's to set, so they start empty.
        authorization_start_date: null,
        authorization_end_date: null,
        authorization_number: null,
        // Titration carries forward as the starting point for the new period.
        // Its phases are week-indexed, so they re-date themselves against the
        // new authorization start date.
        titration_rationale: prior.titration_rationale,
        titration_phases: normalizeTitrationPhases(prior.titration_phases),
        goal_progress: goalProgress,
        hours_increase_justification: null,
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
    const { practiceId, user } = await requirePracticeRole([
      "owner",
      "admin",
      "clinician",
    ]);
    const next = normalizeAuthorizationFields(data.data);

    // A reauthorization that asks for more hours than the plan it extends needs
    // a reason on file — an increase without one is what gets a request kicked
    // back. Checked here, on the write, so the rule holds for any caller.
    if (next.requested_services !== undefined ||
        next.hours_increase_justification !== undefined) {
      const existing = await getTreatmentPlan(practiceId, data.id);
      if (existing?.prior_plan_id) {
        const prior = await getTreatmentPlan(practiceId, existing.prior_plan_id);
        const priorHours = totalHoursPerWeek(
          normalizeServiceLines(prior?.requested_services),
        );
        const requestedHours = totalHoursPerWeek(
          normalizeServiceLines(
            next.requested_services ?? existing.requested_services,
          ),
        );
        const justification = (
          next.hours_increase_justification !== undefined
            ? next.hours_increase_justification
            : existing.hours_increase_justification
        )?.trim();
        if (requestedHours > priorHours + 0.001 && !justification) {
          throw new Error(
            "Requested hours are higher than the prior authorization — a justification for the increase is required before saving.",
          );
        }
      }
    }

    return updateTreatmentPlan(
      practiceId,
      data.id,
      next,
      user.email,
    );
  });

// ---------------------------------------------------------------------------
// Delete a treatment plan
// ---------------------------------------------------------------------------
export const deleteTreatmentPlanFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    const { practiceId, user } = await requirePracticeRole([
      "owner",
      "admin",
      "clinician",
    ]);
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
// Get full context for a plan (client + linked assessment + signatures + the
// prior plan when this plan is a reauthorization)
// ---------------------------------------------------------------------------
export const getTreatmentPlanContextFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { planId: string })
  .handler(async ({ data }) => {
    const { practiceId, practiceRole } = await requireSession();
    const plan = await getTreatmentPlan(practiceId, data.planId);
    if (!plan) {
      return {
        plan: null,
        client: null,
        assessment: null,
        signatures: [],
        priorPlan: null,
        practiceRole,
      };
    }

    const client = await getClient(practiceId, plan.client_id);
    let assessment: Assessment | null = null;
    if (plan.assessment_id) {
      assessment = await getAssessment(practiceId, plan.assessment_id);
    }
    // Loaded here so a signed plan renders as signed on first paint.
    const signatures = await getSignatures(practiceId, "treatment_plan", plan.id);
    // The plan this one extends, for "Reauthorization of …" and the prior
    // authorization number. Practice-scoped like every other read.
    const priorPlan = plan.prior_plan_id
      ? await getTreatmentPlan(practiceId, plan.prior_plan_id)
      : null;

    return { plan, client, assessment, signatures, priorPlan, practiceRole };
  });
