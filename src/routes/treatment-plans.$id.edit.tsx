// Treatment Plan Editor — /treatment-plans/$id/edit
// Multi-tab form that auto-populates from client + assessment data.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTreatmentPlanContextFn,
  updateTreatmentPlanFn,
} from "~/server/treatment-plans";
import { getClientFn } from "~/server/clients";
import { getAssessmentFn } from "~/server/assessments";
import type { TreatmentPlan, Client, Assessment } from "~/db/types";
import {
  CPT_CODES,
  PROVIDER_TYPES,
  SERVICE_SETTINGS,
  WEEK_DAYS,
  authorizationWeeks,
  cptLabel,
  formatDateOnly,
  formatDuration,
  formatHours,
  isKnownCpt,
  normalizeSchedule,
  normalizeServiceLines,
  scheduleDurationMinutes,
  scheduledHoursPerWeek,
  totalHoursPerWeek,
} from "~/lib/treatment-plan-authz";
import type {
  ProviderType,
  ScheduleEntry,
  ServiceLine,
  ServiceSetting,
} from "~/lib/treatment-plan-authz";

/** Display labels for the settings stored in the jsonb payload. */
const SETTING_LABELS: Record<ServiceSetting, string> = {
  home: "Home",
  school: "School",
  clinic: "Clinic",
  community: "Community",
  telehealth: "Telehealth",
};

// ---- Helpers ----
function parseJsonField<T>(val: unknown, fallback: T): T {
  if (val == null) return fallback;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  if (Array.isArray(val)) return val as T;
  if (typeof val === "object") return val as T;
  return fallback;
}

const DOMAINS = [
  "Communication",
  "Social Skills",
  "Adaptive/Daily Living",
  "Academics",
  "Play/Leisure",
  "Motor Skills",
  "Community Safety",
  "Other",
] as const;
const MEASUREMENTS = [
  "frequency",
  "duration",
  "latency",
  "percent correct",
  "trials to criterion",
] as const;
const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
const PLAN_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Ready for Review" },
  { value: "approved", label: "Approved" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
] as const;

type TabId =
  | "client"
  | "family"
  | "behavior"
  | "goals"
  | "outcomes"
  | "parent"
  | "services"
  | "authorization"
  | "review";
const TABS: { id: TabId; label: string }[] = [
  { id: "client", label: "Client & Background" },
  { id: "family", label: "Family & School" },
  { id: "behavior", label: "Behaviors & BIP" },
  { id: "goals", label: "Skill Goals" },
  { id: "outcomes", label: "Assessment Outcomes" },
  { id: "parent", label: "Parent & Coordination" },
  { id: "services", label: "Services & Schedule" },
  { id: "authorization", label: "Authorization Request" },
  { id: "review", label: "Review & Submit" },
];

// ---- Local form data ----
type LocalConcurrentService = {
  service: string;
  provider: string;
  frequency?: string;
};
type LocalMaladaptiveBehavior = {
  behavior: string;
  topography: string;
  frequency: string;
  intensity: string;
  duration: string;
};
type LocalSkillGoal = {
  domain: string;
  description: string;
  measurement: string;
  baseline: string;
  target: string;
  target_date: string;
};
type LocalParentGoal = { goal: string; method: string; frequency: string };
type LocalCoordGoal = { provider: string; goal: string; method: string };

interface LocalForm {
  reason_for_referral: string;
  diagnosis: string;
  client_background: string;
  treatment_history: string;
  concurrent_services: LocalConcurrentService[];
  family_history: string;
  school_info: string;
  maladaptive_behaviors: LocalMaladaptiveBehavior[];
  behavior_intervention_plan: string;
  skill_acquisition_goals: LocalSkillGoal[];
  assessment_outcomes: string;
  parent_training_goals: LocalParentGoal[];
  service_coordination_goals: LocalCoordGoal[];
  discharge_criteria: string;
  requested_services: ServiceLine[];
  therapy_schedule: ScheduleEntry[];
  clinical_justification: string;
  authorization_start_date: string;
  authorization_end_date: string;
  authorization_number: string;
  status: string;
}

function emptyForm(): LocalForm {
  return {
    reason_for_referral: "",
    diagnosis: "",
    client_background: "",
    treatment_history: "",
    concurrent_services: [],
    family_history: "",
    school_info: "",
    maladaptive_behaviors: [],
    behavior_intervention_plan: "",
    skill_acquisition_goals: [],
    assessment_outcomes: "",
    parent_training_goals: [],
    service_coordination_goals: [],
    discharge_criteria: "",
    requested_services: [],
    therapy_schedule: [],
    clinical_justification: "",
    authorization_start_date: "",
    authorization_end_date: "",
    authorization_number: "",
    status: "draft",
  };
}

function planToLocal(plan: TreatmentPlan): LocalForm {
  return {
    reason_for_referral: plan.reason_for_referral ?? "",
    diagnosis: plan.diagnosis ?? "",
    client_background: "",
    treatment_history: plan.treatment_history ?? "",
    concurrent_services: parseJsonField<LocalConcurrentService[]>(
      plan.concurrent_services,
      [],
    ),
    family_history: plan.family_history ?? "",
    school_info: plan.school_info ?? "",
    maladaptive_behaviors: parseJsonField<LocalMaladaptiveBehavior[]>(
      plan.maladaptive_behaviors,
      [],
    ),
    behavior_intervention_plan: plan.behavior_intervention_plan ?? "",
    skill_acquisition_goals: parseJsonField<LocalSkillGoal[]>(
      plan.skill_acquisition_goals,
      [],
    ),
    assessment_outcomes: plan.assessment_outcomes ?? "",
    parent_training_goals: parseJsonField<LocalParentGoal[]>(
      plan.parent_training_goals,
      [],
    ),
    service_coordination_goals: parseJsonField<LocalCoordGoal[]>(
      plan.service_coordination_goals,
      [],
    ),
    discharge_criteria: plan.discharge_criteria ?? "",
    // Normalized on read: plans written before the authorization fields
    // existed still hold the legacy jsonb shapes (and `therapy_schedule` may
    // even be the `{}` column default). Both shapes load here.
    requested_services: normalizeServiceLines(plan.requested_services),
    therapy_schedule: normalizeSchedule(plan.therapy_schedule),
    clinical_justification: plan.clinical_justification ?? "",
    authorization_start_date: plan.authorization_start_date?.slice(0, 10) ?? "",
    authorization_end_date: plan.authorization_end_date?.slice(0, 10) ?? "",
    authorization_number: plan.authorization_number ?? "",
    status: plan.status,
  };
}

export const Route = createFileRoute("/treatment-plans/$id/edit")({
  component: TreatmentPlanEditPage,
  loader: async ({ params }) => {
    try {
      return await getTreatmentPlanContextFn({ data: { planId: params.id } });
    } catch {
      return { plan: null, client: null, assessment: null };
    }
  },
});

function TreatmentPlanEditPage() {
  const initial = Route.useLoaderData() as {
    plan: TreatmentPlan | null;
    client: Client | null;
    assessment: Assessment | null;
  };
  const navigate = useNavigate();
  const params = Route.useParams();

  const [plan, setPlan] = useState<TreatmentPlan | null>(initial.plan);
  const [client, setClient] = useState<Client | null>(initial.client);
  const [assessment, setAssessment] = useState<Assessment | null>(
    initial.assessment,
  );
  const [form, setForm] = useState<LocalForm>(emptyForm());
  const [activeTab, setActiveTab] = useState<TabId>("client");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Load on mount
  useEffect(() => {
    if (!initial.plan) {
      getTreatmentPlanContextFn({ data: { planId: params.id } })
        .then((r) => {
          setPlan(r.plan);
          setClient(r.client);
          setAssessment(r.assessment);
        })
        .catch(() => {});
    }
  }, [initial.plan, params.id]);

  // Initialize form from plan
  useEffect(() => {
    if (plan) setForm(planToLocal(plan));
  }, [plan]);

  // Auto-populate from client
  useEffect(() => {
    if (client && plan) {
      // Auto-populate diagnosis
      if (!form.diagnosis && client.diagnoses) {
        const diags = parseJsonField<string[]>(client.diagnoses, []);
        if (diags.length > 0) {
          setForm((f) => ({ ...f, diagnosis: diags.join(", ") }));
        }
      }
    }
  }, [client, plan]);

  // Auto-populate assessment outcomes
  useEffect(() => {
    if (
      assessment &&
      plan &&
      !form.assessment_outcomes &&
      assessment.raw_scores
    ) {
      const rs = assessment.raw_scores as Record<string, unknown>;
      if (rs._computed && typeof rs._computed === "object") {
        const c = rs._computed as Record<string, unknown>;
        let summary = `Assessment: ${assessment.tool_name}`;
        if (assessment.tool_version) summary += ` v${assessment.tool_version}`;
        summary += `\nDate: ${assessment.assessment_date ?? "—"}`;
        summary += `\nAssessor: ${assessment.assessor_name ?? "—"}\n\n`;

        if (c.milestones && typeof c.milestones === "object") {
          const ms = c.milestones as Record<string, unknown>;
          summary += `Milestones Overall: ${ms.overallTotal ?? "—"} / ${ms.maxOverall ?? 170}\n`;
        }
        if (c.barriers && typeof c.barriers === "object") {
          const b = c.barriers as Record<string, unknown>;
          summary += `Barriers Total: ${b.total ?? "—"} / ${b.max ?? 96}\n`;
        }
        if (c.transition && typeof c.transition === "object") {
          const t = c.transition as Record<string, unknown>;
          summary += `Transition Total: ${t.total ?? "—"} / ${t.max ?? 36}\n`;
        }
        if (c.eesa && typeof c.eesa === "object") {
          const e = c.eesa as Record<string, unknown>;
          summary += `EESA Total: ${e.overallTotal ?? "—"}\n`;
        }
        setForm((f) => ({ ...f, assessment_outcomes: summary }));
      }
    }
  }, [assessment, plan]);

  const update = (patch: Partial<LocalForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const handleSave = useCallback(async () => {
    if (!plan) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await updateTreatmentPlanFn({
        data: {
          id: plan.id,
          data: {
            reason_for_referral: form.reason_for_referral || null,
            diagnosis: form.diagnosis || null,
            treatment_history:
              (
                form.client_background +
                "\n\n" +
                form.treatment_history
              ).trim() || null,
            concurrent_services: form.concurrent_services,
            family_history: form.family_history || null,
            school_info: form.school_info || null,
            maladaptive_behaviors: form.maladaptive_behaviors,
            behavior_intervention_plan: form.behavior_intervention_plan || null,
            skill_acquisition_goals: form.skill_acquisition_goals,
            assessment_outcomes: form.assessment_outcomes || null,
            parent_training_goals: form.parent_training_goals,
            service_coordination_goals: form.service_coordination_goals,
            discharge_criteria: form.discharge_criteria || null,
            requested_services: form.requested_services,
            therapy_schedule: form.therapy_schedule,
            clinical_justification: form.clinical_justification || null,
            authorization_start_date: form.authorization_start_date || null,
            authorization_end_date: form.authorization_end_date || null,
            authorization_number: form.authorization_number || null,
            status: form.status as TreatmentPlan["status"],
          },
        },
      });
      if (updated) {
        setPlan(updated);
        setDirty(false);
        setSaveMsg("Saved!");
        setTimeout(() => setSaveMsg(""), 2000);
      }
    } catch (err) {
      setSaveMsg("Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [form, plan]);

  // Loading
  if (!plan) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 py-12 text-gray-500 justify-center">
          <svg
            className="h-5 w-5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading&hellip;
        </div>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-600",
      review: "bg-yellow-100 text-yellow-800",
      approved: "bg-blue-100 text-blue-800",
      active: "bg-green-100 text-green-800",
      completed: "bg-emerald-100 text-emerald-800",
    };
    const labels: Record<string, string> = {
      draft: "Draft",
      review: "In Review",
      approved: "Approved",
      active: "Active",
      completed: "Completed",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}
      >
        {labels[status] ?? status}
      </span>
    );
  };

  // ---- Tab content renderers ----
  const renderClientTab = () => (
    <div className="space-y-5">
      {/* Client info card (read-only) */}
      <div className="rounded-md bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Client Information
        </h3>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-gray-500">Name</dt>
            <dd className="font-medium text-gray-900">{client?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">DOB</dt>
            <dd className="font-medium text-gray-900">
              {client?.date_of_birth
                ? new Date(client.date_of_birth).toLocaleDateString()
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Setting</dt>
            <dd className="font-medium text-gray-900">
              {client?.setting ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Contact</dt>
            <dd className="font-medium text-gray-900">
              {client?.contact_email || client?.contact_phone || "—"}
            </dd>
          </div>
          {plan.assessment_id && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-gray-500">Linked Assessment</dt>
              <dd className="font-medium text-gray-900">
                {assessment?.tool_name ?? "—"}{" "}
                {assessment
                  ? `(${new Date(assessment.assessment_date).toLocaleDateString()})`
                  : ""}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <Field label="Reason for Referral">
        <textarea
          value={form.reason_for_referral}
          onChange={(e) => update({ reason_for_referral: e.target.value })}
          className="input"
          rows={3}
          placeholder="Describe the reason for referral and clinical concerns..."
        />
      </Field>

      <Field label="Client Background Information">
        <textarea
          value={form.client_background}
          onChange={(e) => update({ client_background: e.target.value })}
          className="input"
          rows={3}
          placeholder="Family context, environment, relevant history..."
        />
      </Field>

      <Field label="Diagnosis">
        <input
          type="text"
          value={form.diagnosis}
          onChange={(e) => update({ diagnosis: e.target.value })}
          className="input"
          placeholder="e.g. Autism Spectrum Disorder (F84.0)"
        />
      </Field>

      <Field label="Treatment History">
        <textarea
          value={form.treatment_history}
          onChange={(e) => update({ treatment_history: e.target.value })}
          className="input"
          rows={2}
          placeholder="Previous ABA, speech, OT interventions and outcomes..."
        />
      </Field>

      {/* Concurrent Services */}
      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">
          Concurrent Services
        </legend>
        <div className="space-y-2">
          {form.concurrent_services.map((s, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input
                value={s.service}
                onChange={(e) => {
                  const n = [...form.concurrent_services];
                  n[i] = { ...n[i], service: e.target.value };
                  update({ concurrent_services: n });
                }}
                className="input flex-1"
                placeholder="Service name"
              />
              <input
                value={s.provider}
                onChange={(e) => {
                  const n = [...form.concurrent_services];
                  n[i] = { ...n[i], provider: e.target.value };
                  update({ concurrent_services: n });
                }}
                className="input flex-1"
                placeholder="Provider"
              />
              <input
                value={s.frequency ?? ""}
                onChange={(e) => {
                  const n = [...form.concurrent_services];
                  n[i] = { ...n[i], frequency: e.target.value };
                  update({ concurrent_services: n });
                }}
                className="input w-28"
                placeholder="Freq."
              />
              <button
                type="button"
                onClick={() =>
                  update({
                    concurrent_services: form.concurrent_services.filter(
                      (_, j) => j !== i,
                    ),
                  })
                }
                className="p-2 text-red-400 hover:text-red-600 text-lg"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              update({
                concurrent_services: [
                  ...form.concurrent_services,
                  { service: "", provider: "", frequency: "" },
                ],
              })
            }
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Add Service
          </button>
        </div>
      </fieldset>
    </div>
  );

  const renderFamilyTab = () => (
    <div className="space-y-5">
      <Field label="Family History">
        <textarea
          value={form.family_history}
          onChange={(e) => update({ family_history: e.target.value })}
          className="input"
          rows={4}
          placeholder="Family composition, dynamics, relevant medical/developmental history of siblings and parents..."
        />
      </Field>
      <Field label="School Information">
        <textarea
          value={form.school_info}
          onChange={(e) => update({ school_info: e.target.value })}
          className="input"
          rows={4}
          placeholder="Current school setting, grade level, classroom type (general ed, special ed, inclusion), IEP/504 status, current supports and accommodations..."
        />
      </Field>
    </div>
  );

  const renderBehaviorTab = () => (
    <div className="space-y-5">
      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">
          Maladaptive Behaviors
        </legend>
        <div className="space-y-3">
          {form.maladaptive_behaviors.map((b, i) => (
            <div
              key={i}
              className="rounded border border-gray-200 p-3 space-y-2"
            >
              <div className="flex justify-between items-start">
                <span className="text-xs font-medium text-gray-500">
                  Behavior #{i + 1}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    update({
                      maladaptive_behaviors: form.maladaptive_behaviors.filter(
                        (_, j) => j !== i,
                      ),
                    })
                  }
                  className="text-red-400 hover:text-red-600 text-sm"
                >
                  Remove
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={b.behavior}
                  onChange={(e) => {
                    const n = [...form.maladaptive_behaviors];
                    n[i] = { ...n[i], behavior: e.target.value };
                    update({ maladaptive_behaviors: n });
                  }}
                  className="input"
                  placeholder="Behavior name (e.g. Aggression)"
                />
                <input
                  value={b.topography}
                  onChange={(e) => {
                    const n = [...form.maladaptive_behaviors];
                    n[i] = { ...n[i], topography: e.target.value };
                    update({ maladaptive_behaviors: n });
                  }}
                  className="input"
                  placeholder="Topography (e.g. Hitting, kicking)"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={b.frequency}
                  onChange={(e) => {
                    const n = [...form.maladaptive_behaviors];
                    n[i] = { ...n[i], frequency: e.target.value };
                    update({ maladaptive_behaviors: n });
                  }}
                  className="input"
                  placeholder="Frequency"
                />
                <input
                  value={b.intensity}
                  onChange={(e) => {
                    const n = [...form.maladaptive_behaviors];
                    n[i] = { ...n[i], intensity: e.target.value };
                    update({ maladaptive_behaviors: n });
                  }}
                  className="input"
                  placeholder="Intensity"
                />
                <input
                  value={b.duration}
                  onChange={(e) => {
                    const n = [...form.maladaptive_behaviors];
                    n[i] = { ...n[i], duration: e.target.value };
                    update({ maladaptive_behaviors: n });
                  }}
                  className="input"
                  placeholder="Duration"
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              update({
                maladaptive_behaviors: [
                  ...form.maladaptive_behaviors,
                  {
                    behavior: "",
                    topography: "",
                    frequency: "",
                    intensity: "",
                    duration: "",
                  },
                ],
              })
            }
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Add Behavior
          </button>
        </div>
      </fieldset>

      <Field label="Behavior Intervention Plan (BIP)">
        <textarea
          value={form.behavior_intervention_plan}
          onChange={(e) =>
            update({ behavior_intervention_plan: e.target.value })
          }
          className="input"
          rows={6}
          placeholder="Antecedent interventions, consequence strategies, replacement behaviors, reinforcement procedures, crisis plan..."
        />
      </Field>
    </div>
  );

  const renderGoalsTab = () => (
    <div className="space-y-3">
      {form.skill_acquisition_goals.map((g, i) => (
        <div key={i} className="rounded border border-gray-200 p-3 space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-xs font-medium text-gray-500">
              Goal #{i + 1}
            </span>
            <button
              type="button"
              onClick={() =>
                update({
                  skill_acquisition_goals: form.skill_acquisition_goals.filter(
                    (_, j) => j !== i,
                  ),
                })
              }
              className="text-red-400 hover:text-red-600 text-sm"
            >
              Remove
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={g.domain}
              onChange={(e) => {
                const n = [...form.skill_acquisition_goals];
                n[i] = { ...n[i], domain: e.target.value };
                update({ skill_acquisition_goals: n });
              }}
              className="input"
            >
              <option value="">— Select Domain —</option>
              {DOMAINS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              value={g.measurement}
              onChange={(e) => {
                const n = [...form.skill_acquisition_goals];
                n[i] = { ...n[i], measurement: e.target.value };
                update({ skill_acquisition_goals: n });
              }}
              className="input"
            >
              <option value="">— Measurement —</option>
              {MEASUREMENTS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={g.description}
            onChange={(e) => {
              const n = [...form.skill_acquisition_goals];
              n[i] = { ...n[i], description: e.target.value };
              update({ skill_acquisition_goals: n });
            }}
            className="input"
            rows={2}
            placeholder="Goal description (use SMART framework)"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <input
              value={g.baseline}
              onChange={(e) => {
                const n = [...form.skill_acquisition_goals];
                n[i] = { ...n[i], baseline: e.target.value };
                update({ skill_acquisition_goals: n });
              }}
              className="input"
              placeholder="Baseline"
            />
            <input
              value={g.target}
              onChange={(e) => {
                const n = [...form.skill_acquisition_goals];
                n[i] = { ...n[i], target: e.target.value };
                update({ skill_acquisition_goals: n });
              }}
              className="input"
              placeholder="Target"
            />
            <input
              type="date"
              value={g.target_date}
              onChange={(e) => {
                const n = [...form.skill_acquisition_goals];
                n[i] = { ...n[i], target_date: e.target.value };
                update({ skill_acquisition_goals: n });
              }}
              className="input"
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          update({
            skill_acquisition_goals: [
              ...form.skill_acquisition_goals,
              {
                domain: "",
                description: "",
                measurement: "",
                baseline: "",
                target: "",
                target_date: "",
              },
            ],
          })
        }
        className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
      >
        + Add Skill Goal
      </button>
    </div>
  );

  const renderOutcomesTab = () => (
    <div className="space-y-5">
      {/* Assessment scores summary (read-only) */}
      {assessment && assessment.raw_scores && (
        <div className="rounded-md bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Assessment Scores — {assessment.tool_name}
          </h3>
          {(() => {
            const rs = assessment.raw_scores as Record<string, unknown>;
            const c = (rs._computed as Record<string, unknown>) ?? null;
            if (!c)
              return (
                <p className="text-sm text-gray-500">
                  No computed scores available.
                </p>
              );
            return (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {c.milestones && typeof c.milestones === "object" && (
                  <div>
                    <dt className="text-xs text-gray-500">Milestones</dt>
                    <dd className="font-medium">
                      {(c.milestones as Record<string, unknown>).overallTotal ??
                        "—"}{" "}
                      /{" "}
                      {(c.milestones as Record<string, unknown>).maxOverall ??
                        170}
                    </dd>
                  </div>
                )}
                {c.barriers && typeof c.barriers === "object" && (
                  <div>
                    <dt className="text-xs text-gray-500">Barriers</dt>
                    <dd className="font-medium">
                      {(c.barriers as Record<string, unknown>).total ?? "—"} /{" "}
                      {(c.barriers as Record<string, unknown>).max ?? 96}
                    </dd>
                  </div>
                )}
                {c.transition && typeof c.transition === "object" && (
                  <div>
                    <dt className="text-xs text-gray-500">Transition</dt>
                    <dd className="font-medium">
                      {(c.transition as Record<string, unknown>).total ?? "—"} /{" "}
                      {(c.transition as Record<string, unknown>).max ?? 36}
                    </dd>
                  </div>
                )}
                {c.eesa && typeof c.eesa === "object" && (
                  <div>
                    <dt className="text-xs text-gray-500">EESA</dt>
                    <dd className="font-medium">
                      {(c.eesa as Record<string, unknown>).overallTotal ?? "—"}
                    </dd>
                  </div>
                )}
                {c.task_analysis && typeof c.task_analysis === "object" && (
                  <div>
                    <dt className="text-xs text-gray-500">Task Analysis</dt>
                    <dd className="font-medium">
                      {(c.task_analysis as Record<string, unknown>)
                        .overallPercentage ?? "—"}
                      % (
                      {(c.task_analysis as Record<string, unknown>)
                        .totalCompleted ?? 0}
                      /
                      {(c.task_analysis as Record<string, unknown>)
                        .totalItems ?? 0}
                      )
                    </dd>
                  </div>
                )}
              </dl>
            );
          })()}
        </div>
      )}

      {!assessment && (
        <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-500">
          No assessment linked to this treatment plan.
        </div>
      )}

      <Field label="Assessment Outcomes Interpretation">
        <textarea
          value={form.assessment_outcomes}
          onChange={(e) => update({ assessment_outcomes: e.target.value })}
          className="input"
          rows={6}
          placeholder="Clinical interpretation of assessment results and how they inform this treatment plan. Describe patterns, strengths, and areas of need..."
        />
      </Field>
    </div>
  );

  const renderParentTab = () => (
    <div className="space-y-5">
      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">
          Parent Training Goals
        </legend>
        <div className="space-y-2">
          {form.parent_training_goals.map((g, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input
                value={g.goal}
                onChange={(e) => {
                  const n = [...form.parent_training_goals];
                  n[i] = { ...n[i], goal: e.target.value };
                  update({ parent_training_goals: n });
                }}
                className="input flex-1"
                placeholder="Goal description"
              />
              <input
                value={g.method}
                onChange={(e) => {
                  const n = [...form.parent_training_goals];
                  n[i] = { ...n[i], method: e.target.value };
                  update({ parent_training_goals: n });
                }}
                className="input w-36"
                placeholder="Method"
              />
              <input
                value={g.frequency}
                onChange={(e) => {
                  const n = [...form.parent_training_goals];
                  n[i] = { ...n[i], frequency: e.target.value };
                  update({ parent_training_goals: n });
                }}
                className="input w-28"
                placeholder="Freq."
              />
              <button
                type="button"
                onClick={() =>
                  update({
                    parent_training_goals: form.parent_training_goals.filter(
                      (_, j) => j !== i,
                    ),
                  })
                }
                className="p-2 text-red-400 hover:text-red-600 text-lg"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              update({
                parent_training_goals: [
                  ...form.parent_training_goals,
                  { goal: "", method: "", frequency: "" },
                ],
              })
            }
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Add Goal
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-2">
          Service Coordination Goals
        </legend>
        <div className="space-y-2">
          {form.service_coordination_goals.map((g, i) => (
            <div key={i} className="flex gap-2 items-start">
              <input
                value={g.provider}
                onChange={(e) => {
                  const n = [...form.service_coordination_goals];
                  n[i] = { ...n[i], provider: e.target.value };
                  update({ service_coordination_goals: n });
                }}
                className="input flex-1"
                placeholder="Provider/Service"
              />
              <input
                value={g.goal}
                onChange={(e) => {
                  const n = [...form.service_coordination_goals];
                  n[i] = { ...n[i], goal: e.target.value };
                  update({ service_coordination_goals: n });
                }}
                className="input flex-1"
                placeholder="Coordination goal"
              />
              <input
                value={g.method}
                onChange={(e) => {
                  const n = [...form.service_coordination_goals];
                  n[i] = { ...n[i], method: e.target.value };
                  update({ service_coordination_goals: n });
                }}
                className="input w-36"
                placeholder="Method"
              />
              <button
                type="button"
                onClick={() =>
                  update({
                    service_coordination_goals:
                      form.service_coordination_goals.filter((_, j) => j !== i),
                  })
                }
                className="p-2 text-red-400 hover:text-red-600 text-lg"
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              update({
                service_coordination_goals: [
                  ...form.service_coordination_goals,
                  { provider: "", goal: "", method: "" },
                ],
              })
            }
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Add Coordination Goal
          </button>
        </div>
      </fieldset>

      <Field label="Discharge Criteria">
        <textarea
          value={form.discharge_criteria}
          onChange={(e) => update({ discharge_criteria: e.target.value })}
          className="input"
          rows={3}
          placeholder="Criteria for discharge from ABA services (e.g., mastery of treatment goals, reduction of maladaptive behaviors to acceptable levels, transition to less intensive services)..."
        />
      </Field>
    </div>
  );

  // ---- Derived authorization totals ----
  const totalRequestedHours = totalHoursPerWeek(form.requested_services);
  const totalScheduledHours = scheduledHoursPerWeek(form.therapy_schedule);
  const authWeeks = authorizationWeeks(
    form.authorization_start_date,
    form.authorization_end_date,
  );


  // ---- Requested services (structured service lines) ----
  const setServiceLine = (index: number, patch: Partial<ServiceLine>) => {
    const next = [...form.requested_services];
    next[index] = { ...next[index], ...patch };
    update({ requested_services: next });
  };

  const addServiceLine = () => {
    update({
      requested_services: [
        ...form.requested_services,
        {
          cpt_code: "",
          service_name: "",
          hours_per_week: null,
          session_duration_minutes: null,
          setting: "",
          provider_type: "",
        },
      ],
    });
  };

  // ---- Weekly therapy schedule ----
  const setScheduleEntry = (index: number, patch: Partial<ScheduleEntry>) => {
    const next = [...form.therapy_schedule];
    next[index] = { ...next[index], ...patch };
    update({ therapy_schedule: next });
  };

  const addScheduleEntry = () => {
    update({
      therapy_schedule: [
        ...form.therapy_schedule,
        {
          day: "Monday",
          start_time: "",
          end_time: "",
          service: "",
          setting: "",
          provider: "",
        },
      ],
    });
  };

  const renderServicesTab = () => (
    <div className="space-y-8">
      {/* The number an authorization request turns on. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4">
        <div>
          <p className="text-sm font-medium text-indigo-900">
            Total requested hours per week
          </p>
          <p className="text-xs text-indigo-700">
            Sum of every service line below — this is what the payer authorizes.
          </p>
        </div>
        <p className="text-3xl font-bold text-indigo-700 tabular-nums">
          {formatHours(totalRequestedHours)}
        </p>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1">
          Requested Services &amp; CPT Codes
        </legend>
        <p className="text-xs text-gray-500 mb-3">
          One line per service requested for the authorization period. Pick a
          CPT code or type one under “Other”.
        </p>
        <div className="space-y-3">
          {form.requested_services.map((line, i) => (
            <div
              key={i}
              className="rounded-md border border-gray-200 bg-gray-50/60 p-3"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                <div className="sm:col-span-4">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    CPT code
                  </label>
                  <select
                    value={isKnownCpt(line.cpt_code) ? line.cpt_code : ""}
                    onChange={(e) => {
                      const code = e.target.value;
                      if (code === "other") {
                        setServiceLine(i, { cpt_code: "" });
                        return;
                      }
                      setServiceLine(i, {
                        cpt_code: code,
                        service_name:
                          line.service_name || cptLabel(code) || line.service_name,
                      });
                    }}
                    className="input"
                    aria-label={`CPT code for service line ${i + 1}`}
                  >
                    <option value="">— Select a code —</option>
                    {CPT_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} — {c.label}
                      </option>
                    ))}
                    <option value="other">Other (type a code)</option>
                  </select>
                  <input
                    value={line.cpt_code}
                    onChange={(e) =>
                      setServiceLine(i, { cpt_code: e.target.value })
                    }
                    className="input mt-1"
                    placeholder="Or type a CPT code"
                    aria-label={`Typed CPT code for service line ${i + 1}`}
                  />
                </div>
                <div className="sm:col-span-8">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Service description
                  </label>
                  <input
                    value={line.service_name}
                    onChange={(e) =>
                      setServiceLine(i, { service_name: e.target.value })
                    }
                    className="input"
                    placeholder="e.g. Adaptive behavior treatment by protocol"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Hours / week
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={line.hours_per_week ?? ""}
                    onChange={(e) =>
                      setServiceLine(i, {
                        hours_per_week:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="input"
                    placeholder="0.0"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Session (min)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={line.session_duration_minutes ?? ""}
                    onChange={(e) =>
                      setServiceLine(i, {
                        session_duration_minutes:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    className="input"
                    placeholder="60"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Setting
                  </label>
                  <select
                    value={line.setting}
                    onChange={(e) =>
                      setServiceLine(i, {
                        setting: e.target.value as ServiceSetting | "",
                      })
                    }
                    className="input"
                  >
                    <option value="">—</option>
                    {SERVICE_SETTINGS.map((s) => (
                      <option key={s} value={s}>
                        {SETTING_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Provider
                  </label>
                  <select
                    value={line.provider_type}
                    onChange={(e) =>
                      setServiceLine(i, {
                        provider_type: e.target.value as ProviderType | "",
                      })
                    }
                    className="input"
                  >
                    <option value="">—</option>
                    {PROVIDER_TYPES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-3 flex items-end justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        requested_services: form.requested_services.filter(
                          (_, j) => j !== i,
                        ),
                      })
                    }
                    className="rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove line
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addServiceLine}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Add Service Line
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1">
          Weekly Therapy Schedule
        </legend>
        <p className="text-xs text-gray-500 mb-3">
          Total scheduled:{" "}
          <span className="font-semibold text-gray-700">
            {formatHours(totalScheduledHours)}
          </span>{" "}
          across {form.therapy_schedule.length}{" "}
          {form.therapy_schedule.length === 1 ? "block" : "blocks"}.
        </p>
        <div className="space-y-2">
          {form.therapy_schedule.map((entry, i) => {
            const minutes = scheduleDurationMinutes(entry);
            return (
              <div
                key={i}
                className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 bg-gray-50/60 p-3 sm:grid-cols-12"
              >
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Day
                  </label>
                  <select
                    value={entry.day}
                    onChange={(e) =>
                      setScheduleEntry(i, { day: e.target.value })
                    }
                    className="input"
                  >
                    {entry.day === "" && <option value="">—</option>}
                    {WEEK_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Start
                  </label>
                  <input
                    type="time"
                    value={entry.start_time}
                    onChange={(e) =>
                      setScheduleEntry(i, { start_time: e.target.value })
                    }
                    className="input"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    End
                  </label>
                  <input
                    type="time"
                    value={entry.end_time}
                    onChange={(e) =>
                      setScheduleEntry(i, { end_time: e.target.value })
                    }
                    className="input"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Duration
                  </label>
                  <p className="input flex items-center bg-gray-100 text-gray-700">
                    {formatDuration(minutes)}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Service / CPT
                  </label>
                  <input
                    value={entry.service}
                    onChange={(e) =>
                      setScheduleEntry(i, { service: e.target.value })
                    }
                    className="input"
                    placeholder="97153"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Setting
                  </label>
                  <select
                    value={entry.setting}
                    onChange={(e) =>
                      setScheduleEntry(i, {
                        setting: e.target.value as ServiceSetting | "",
                      })
                    }
                    className="input"
                  >
                    <option value="">—</option>
                    {SERVICE_SETTINGS.map((s) => (
                      <option key={s} value={s}>
                        {SETTING_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Provider
                  </label>
                  <select
                    value={entry.provider}
                    onChange={(e) =>
                      setScheduleEntry(i, { provider: e.target.value })
                    }
                    className="input"
                  >
                    <option value="">—</option>
                    {PROVIDER_TYPES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 flex items-end justify-end sm:col-span-12">
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        therapy_schedule: form.therapy_schedule.filter(
                          (_, j) => j !== i,
                        ),
                      })
                    }
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove block
                  </button>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={addScheduleEntry}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            + Add Schedule Block
          </button>
        </div>
      </fieldset>
    </div>
  );

  // ---- Authorization request: period, totals, medical necessity ----
  const renderAuthorizationTab = () => (
    <div className="space-y-8">
      <fieldset>
        <legend className="block text-sm font-medium text-gray-700 mb-1">
          Authorization Period
        </legend>
        <p className="text-xs text-gray-500 mb-3">
          The dates the payer is being asked to authorize services for.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Start date">
            <input
              type="date"
              value={form.authorization_start_date}
              onChange={(e) =>
                update({ authorization_start_date: e.target.value })
              }
              className="input"
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={form.authorization_end_date}
              onChange={(e) =>
                update({ authorization_end_date: e.target.value })
              }
              className="input"
            />
          </Field>
          <Field label="Authorization number (optional)">
            <input
              value={form.authorization_number}
              onChange={(e) =>
                update({ authorization_number: e.target.value })
              }
              className="input"
              placeholder="Payer reference, if assigned"
            />
          </Field>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          {authWeeks != null
            ? `Authorization period covers ${authWeeks} week${authWeeks === 1 ? "" : "s"} (${formatDateOnly(form.authorization_start_date)} – ${formatDateOnly(form.authorization_end_date)}).`
            : "Enter both dates to see the length of the authorization period."}
        </p>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">
            Requested hours / week
          </p>
          <p className="mt-1 text-2xl font-bold text-indigo-800 tabular-nums">
            {formatHours(totalRequestedHours)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
            Scheduled hours / week
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-800 tabular-nums">
            {formatHours(totalScheduledHours)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-600">
            Service lines
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-800 tabular-nums">
            {form.requested_services.length}
          </p>
        </div>
      </div>

      <Field label="Clinical Justification / Medical Necessity">
        <p className="text-xs text-gray-500 mb-2">
          The narrative a reviewer reads first: why these services, at this
          intensity, for this period. Reference the assessment results and the
          risks of withholding treatment.
        </p>
        <textarea
          value={form.clinical_justification}
          onChange={(e) => update({ clinical_justification: e.target.value })}
          rows={14}
          className="input"
          placeholder="This client presents with… The VB-MAPP assessment dated … indicates … Without the requested intensity of service, the client is at risk of …"
        />
      </Field>
    </div>
  );
  const renderReviewTab = () => (
    <div className="space-y-5">
      <div className="rounded-md bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Plan Summary
        </h3>
        <div className="text-sm text-gray-600 space-y-1">
          <p>
            <strong>Client:</strong> {client?.name ?? "—"}
          </p>
          <p>
            <strong>Status:</strong> {form.status}
          </p>
          <p>
            <strong>Diagnosis:</strong> {form.diagnosis || "—"}
          </p>
          <p>
            <strong>Goals:</strong> {form.skill_acquisition_goals.length} skill
            acquisition, {form.parent_training_goals.length} parent training
          </p>
          <p>
            <strong>Behaviors:</strong> {form.maladaptive_behaviors.length}{" "}
            identified
          </p>
          <p>
            <strong>Services:</strong> {form.requested_services.length}{" "}
            requested, {formatHours(totalRequestedHours)} total
          </p>
          <p>
            <strong>Schedule:</strong> {form.therapy_schedule.length} blocks,{" "}
            {formatHours(totalScheduledHours)} scheduled
          </p>
          <p>
            <strong>Authorization period:</strong>{" "}
            {form.authorization_start_date || form.authorization_end_date
              ? `${formatDateOnly(form.authorization_start_date)} – ${formatDateOnly(form.authorization_end_date)}`
              : "—"}
          </p>
        </div>
      </div>

      <Field label="Status">
        <select
          value={form.status}
          onChange={(e) => update({ status: e.target.value })}
          className="input max-w-xs"
        >
          {PLAN_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="rounded-md bg-indigo-50 p-4 text-sm text-indigo-700">
        <strong>Note:</strong> Changing status to &quot;Ready for Review&quot;
        sends the plan for clinical review. After signatures are collected, it
        can be marked &quot;Approved&quot; and then &quot;Active&quot;.
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              to="/treatment-plans"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              &larr; Plans
            </Link>
            <h1 className="text-xl font-bold text-gray-900">
              Edit Plan: {client?.name ?? "Loading..."}
            </h1>
            {statusBadge(plan.status)}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Created {new Date(plan.created_at).toLocaleDateString()} · Updated{" "}
            {new Date(plan.updated_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/treatment-plans/$id"
            params={{ id: plan.id }}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
          >
            View
          </Link>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60 transition-colors"
          >
            {saving ? (
              <>
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>{" "}
                Saving&hellip;
              </>
            ) : (
              "Save Plan"
            )}
          </button>
        </div>
      </div>

      {saveMsg && (
        <div
          className={`mb-4 rounded-md px-4 py-2 text-sm ${saveMsg === "Saved!" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
        >
          {saveMsg}
        </div>
      )}

      {dirty && !saving && (
        <div className="mb-4 rounded-md bg-yellow-50 px-4 py-2 text-sm text-yellow-700 flex items-center gap-2">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
          You have unsaved changes
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <nav
          className="-mb-px flex space-x-2 overflow-x-auto"
          aria-label="Form sections"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5 sm:p-8">
        {activeTab === "client" && renderClientTab()}
        {activeTab === "family" && renderFamilyTab()}
        {activeTab === "behavior" && renderBehaviorTab()}
        {activeTab === "goals" && renderGoalsTab()}
        {activeTab === "outcomes" && renderOutcomesTab()}
        {activeTab === "parent" && renderParentTab()}
        {activeTab === "services" && renderServicesTab()}
        {activeTab === "authorization" && renderAuthorizationTab()}
        {activeTab === "review" && renderReviewTab()}
      </div>

      {/* Bottom save */}
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60 transition-colors"
        >
          {saving ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>{" "}
              Saving&hellip;
            </>
          ) : (
            "Save Plan"
          )}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
