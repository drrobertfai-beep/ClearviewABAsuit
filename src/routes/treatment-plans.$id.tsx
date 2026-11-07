// Treatment Plan detail/view — /treatment-plans/$id
// Read-only clinical document view of the full treatment plan.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { getTreatmentPlanContextFn } from "~/server/treatment-plans";
import type { TreatmentPlan, Client, Assessment, Signature } from "~/db/types";
import { generateTreatmentPlanPDF } from "~/routes/api/-pdf";
import {
  addSignatureFn,
  getSignaturesFn,
  hasAllSignaturesFn,
} from "~/server/signatures";
import { SignaturePad } from "~/components/SignaturePad";
import { SignatureSection } from "~/components/SignatureSection";
import {
  formatDateOnly,
  formatDuration,
  formatHours,
  normalizeSchedule,
  normalizeServiceLines,
  scheduleDurationMinutes,
  scheduledHoursPerWeek,
  sortSchedule,
  totalHoursPerWeek,
} from "~/lib/treatment-plan-authz";
import type { ServiceSetting } from "~/lib/treatment-plan-authz";

/** Display labels for the settings stored in the jsonb payload. */
const SETTING_LABELS: Record<ServiceSetting, string> = {
  home: "Home",
  school: "School",
  clinic: "Clinic",
  community: "Community",
  telehealth: "Telehealth",
};

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

export const Route = createFileRoute("/treatment-plans/$id")({
  component: TreatmentPlanDetailPage,
  loader: async ({ params }) => {
    try {
      return await getTreatmentPlanContextFn({ data: { planId: params.id } });
    } catch {
      return { plan: null, client: null, assessment: null };
    }
  },
});

function TreatmentPlanDetailPage() {
  const initial = Route.useLoaderData() as {
    plan: TreatmentPlan | null;
    client: Client | null;
    assessment: Assessment | null;
    signatures?: Signature[];
  };
  const navigate = useNavigate();
  const params = Route.useParams();

  const [plan, setPlan] = useState<TreatmentPlan | null>(initial.plan);
  const [client, setClient] = useState<Client | null>(initial.client);
  const [assessment, setAssessment] = useState<Assessment | null>(
    initial.assessment,
  );
  const [loading, setLoading] = useState(!initial.plan);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!initial.plan) {
      setLoading(true);
      getTreatmentPlanContextFn({ data: { planId: params.id } })
        .then((r) => {
          setPlan(r.plan);
          setClient(r.client);
          setAssessment(r.assessment);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [initial.plan, params.id]);

  const handleExportPDF = async () => {
    setPdfLoading(true);
    try {
      const result = await generateTreatmentPlanPDF({ data: { id: plan.id } });
      const byteChars = atob(result.base64);
      const byteNums = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i);
      }
      const byteArr = new Uint8Array(byteNums);
      const blob = new Blob([byteArr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

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

  if (loading) {
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
          Loading treatment plan&hellip;
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border-2 border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm font-medium text-gray-900">
            Treatment plan not found
          </p>
          <Link
            to="/treatment-plans"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            ← Back to Plans
          </Link>
        </div>
      </div>
    );
  }

  const concurrent = parseJsonField<
    { service: string; provider: string; frequency?: string }[]
  >(plan.concurrent_services, []);
  const behaviors = parseJsonField<
    {
      behavior: string;
      topography: string;
      frequency: string;
      intensity: string;
      duration: string;
    }[]
  >(plan.maladaptive_behaviors, []);
  const goals = parseJsonField<
    {
      domain: string;
      description: string;
      measurement: string;
      baseline: string;
      target: string;
      target_date: string;
    }[]
  >(plan.skill_acquisition_goals, []);
  const parentGoals = parseJsonField<
    { goal: string; method: string; frequency: string }[]
  >(plan.parent_training_goals, []);
  const coordGoals = parseJsonField<
    { provider: string; goal: string; method: string }[]
  >(plan.service_coordination_goals, []);
  // Both jsonb columns are read through the normalizers so a plan saved
  // before the authorization fields existed renders exactly like a new one.
  const services = normalizeServiceLines(plan.requested_services);
  const schedule = sortSchedule(normalizeSchedule(plan.therapy_schedule));
  const totalRequestedHours = totalHoursPerWeek(services);
  const totalScheduledHours = scheduledHoursPerWeek(schedule);

  const canEdit = plan.status === "draft" || plan.status === "review";

  // Signature state
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [sigStatus, setSigStatus] = useState<{
    bcba: boolean;
    parentGuardian: boolean;
    allSigned: boolean;
    bcbaSignature: Signature | null;
    parentSignature: Signature | null;
  } | null>(null);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signRole, setSignRole] = useState<string>("bcba");
  const [signName, setSignName] = useState("");
  const [signDataUrl, setSignDataUrl] = useState<string | null>(null);
  const [signingLoading, setSigningLoading] = useState(false);

  const fetchSignatures = useCallback(async () => {
    try {
      const [sigs, status] = await Promise.all([
        getSignaturesFn({
          data: { documentType: "treatment_plan", documentId: params.id },
        }),
        hasAllSignaturesFn({
          data: { documentType: "treatment_plan", documentId: params.id },
        }),
      ]);
      setSignatures(sigs);
      setSigStatus(status);
      if (status.allSigned && plan && plan.status !== "approved") {
        setPlan((prev) => (prev ? { ...prev, status: "approved" } : prev));
      }
    } catch {
      /* ignore */
    }
  }, [plan?.id]);

  useEffect(() => {
    if (plan) fetchSignatures();
  }, [plan?.id, fetchSignatures]);

  const handleSignSubmit = async () => {
    if (!signDataUrl || !signName.trim()) return;
    setSigningLoading(true);
    try {
      await addSignatureFn({
        data: {
          documentType: "treatment_plan",
          documentId: params.id,
          signerName: signName.trim(),
          signerRole: signRole,
          signatureData: signDataUrl,
        },
      });
      setShowSignModal(false);
      setSignDataUrl(null);
      setSignName("");
      await fetchSignatures();
    } catch (err) {
      console.error("Signing failed:", err);
    } finally {
      setSigningLoading(false);
    }
  };
  const hasAssessment = !!(
    assessment?.raw_scores &&
    typeof assessment.raw_scores === "object" &&
    (assessment.raw_scores as Record<string, unknown>)._computed
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
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
            <h1 className="text-xl font-bold text-gray-900">Treatment Plan</h1>
            {statusBadge(plan.status)}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Created {new Date(plan.created_at).toLocaleDateString()} · Updated{" "}
            {new Date(plan.updated_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Link
              to="/treatment-plans/$id/edit"
              params={{ id: plan.id }}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
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
                  d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                />
              </svg>
              Edit
            </Link>
          )}
          <button
            type="button"
            onClick={handleExportPDF}
            disabled={pdfLoading}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pdfLoading ? (
              <svg
                className="h-4 w-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
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
            ) : (
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
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            )}
            {pdfLoading ? "Generating PDF…" : "Export PDF"}
          </button>
        </div>
      </div>

      {/* Document */}
      <div className="space-y-6">
        {/* Section 1: Client & Background */}
        <Section title="1. Client & Background">
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <KV label="Client" value={client?.name ?? "—"} />
            <KV
              label="DOB"
              value={
                client?.date_of_birth
                  ? new Date(client.date_of_birth).toLocaleDateString()
                  : "—"
              }
            />
            <KV label="Diagnosis" value={plan.diagnosis ?? "—"} />
            <KV
              label="Contact"
              value={client?.contact_email || client?.contact_phone || "—"}
            />
            <KV label="Setting" value={client?.setting ?? "—"} />
            <KV
              label="Linked Assessment"
              value={
                assessment
                  ? `${assessment.tool_name} (${new Date(assessment.assessment_date).toLocaleDateString()})`
                  : "None"
              }
            />
          </dl>
          {plan.reason_for_referral && (
            <KV
              label="Reason for Referral"
              value={plan.reason_for_referral}
              block
            />
          )}
          {plan.treatment_history && (
            <KV
              label="Client Background"
              value={plan.treatment_history}
              block
            />
          )}
          {concurrent.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                Concurrent Services
              </h4>
              <ul className="space-y-1">
                {concurrent.map((s, i) => (
                  <li key={i} className="text-sm text-gray-700">
                    • {s.service} — {s.provider}
                    {s.frequency ? ` (${s.frequency})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        {/* Section 2: Family & School */}
        {(plan.family_history || plan.school_info) && (
          <Section title="2. Family & School">
            {plan.family_history && (
              <KV label="Family History" value={plan.family_history} block />
            )}
            {plan.school_info && (
              <KV label="School Information" value={plan.school_info} block />
            )}
          </Section>
        )}

        {/* Section 3: Maladaptive Behaviors & BIP */}
        {(behaviors.length > 0 || plan.behavior_intervention_plan) && (
          <Section title="3. Maladaptive Behaviors & BIP">
            {behaviors.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Behavior
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Topography
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Frequency
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Intensity
                      </th>
                      <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">
                        Duration
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {behaviors.map((b, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-3 text-gray-900">
                          {b.behavior || "—"}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {b.topography || "—"}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {b.frequency || "—"}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {b.intensity || "—"}
                        </td>
                        <td className="py-2 text-gray-600">
                          {b.duration || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {plan.behavior_intervention_plan && (
              <KV
                label="Behavior Intervention Plan"
                value={plan.behavior_intervention_plan}
                block
              />
            )}
          </Section>
        )}

        {/* Section 4: Skill Acquisition Goals */}
        {goals.length > 0 && (
          <Section title="4. Skill Acquisition Goals">
            <div className="space-y-3">
              {goals.map((g, i) => (
                <div key={i} className="rounded border border-gray-200 p-3">
                  <p className="text-sm font-medium text-gray-900">
                    {g.domain || "Unspecified Domain"}: {g.description || "—"}
                  </p>
                  <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-500">
                    <span>Method: {g.measurement || "—"}</span>
                    <span>Baseline: {g.baseline || "—"}</span>
                    <span>Target: {g.target || "—"}</span>
                    <span>Target Date: {g.target_date || "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Section 5: Assessment Outcomes */}
        {(hasAssessment || plan.assessment_outcomes) && (
          <Section title="5. Assessment Outcomes">
            {hasAssessment && assessment && (
              <div className="rounded-md bg-gray-50 p-3 mb-3">
                {(() => {
                  const c =
                    ((assessment.raw_scores as Record<string, unknown>)
                      ._computed as Record<string, unknown>) ?? {};
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                      {c.milestones && (
                        <KV
                          label="Milestones"
                          value={`${(c.milestones as Record<string, unknown>).overallTotal ?? "—"} / ${(c.milestones as Record<string, unknown>).maxOverall ?? 170}`}
                        />
                      )}
                      {c.barriers && (
                        <KV
                          label="Barriers"
                          value={`${(c.barriers as Record<string, unknown>).total ?? "—"} / ${(c.barriers as Record<string, unknown>).max ?? 96}`}
                        />
                      )}
                      {c.transition && (
                        <KV
                          label="Transition"
                          value={`${(c.transition as Record<string, unknown>).total ?? "—"} / ${(c.transition as Record<string, unknown>).max ?? 36}`}
                        />
                      )}
                      {c.eesa && (
                        <KV
                          label="EESA"
                          value={`${(c.eesa as Record<string, unknown>).overallTotal ?? "—"}`}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
            {plan.assessment_outcomes && (
              <KV
                label="Clinical Interpretation"
                value={plan.assessment_outcomes}
                block
              />
            )}
          </Section>
        )}

        {/* Section 6: Parent Training & Coordination */}
        {(parentGoals.length > 0 ||
          coordGoals.length > 0 ||
          plan.discharge_criteria) && (
          <Section title="6. Parent Training & Service Coordination">
            {parentGoals.length > 0 && (
              <div className="mb-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                  Parent Training Goals
                </h4>
                <ul className="space-y-1">
                  {parentGoals.map((g, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      • {g.goal} — {g.method} ({g.frequency})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {coordGoals.length > 0 && (
              <div className="mb-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">
                  Service Coordination
                </h4>
                <ul className="space-y-1">
                  {coordGoals.map((g, i) => (
                    <li key={i} className="text-sm text-gray-700">
                      • {g.provider}: {g.goal} via {g.method}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {plan.discharge_criteria && (
              <KV
                label="Discharge Criteria"
                value={plan.discharge_criteria}
                block
              />
            )}
          </Section>
        )}

        {/* Section 7: Services & Schedule */}
        {(services.length > 0 || schedule.length > 0) && (
          <Section title="7. Services & Schedule">
            {services.length > 0 && (
              <div className="mb-4 overflow-x-auto">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase">
                    Requested Services
                  </h4>
                  <p className="text-sm font-semibold text-indigo-700">
                    Total requested: {formatHours(totalRequestedHours)}
                  </p>
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        CPT
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Service
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Hrs/Wk
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Session
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Setting
                      </th>
                      <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">
                        Provider
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium text-gray-800">
                          {s.cpt_code || "—"}
                        </td>
                        <td className="py-2 pr-3">{s.service_name || "—"}</td>
                        <td className="py-2 pr-3 text-gray-600 tabular-nums">
                          {s.hours_per_week ?? "—"}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {s.session_duration_minutes
                            ? formatDuration(s.session_duration_minutes)
                            : "—"}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {s.setting ? SETTING_LABELS[s.setting] : "—"}
                        </td>
                        <td className="py-2 text-gray-600">
                          {s.provider_type || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {schedule.length > 0 && (
              <div className="overflow-x-auto">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase">
                    Therapy Schedule
                  </h4>
                  <p className="text-sm text-gray-600">
                    Total scheduled:{" "}
                    <span className="font-semibold text-gray-800">
                      {formatHours(totalScheduledHours)}
                    </span>
                  </p>
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Day
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Start
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        End
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Duration
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Service
                      </th>
                      <th className="text-left py-2 pr-3 text-xs font-semibold text-gray-500 uppercase">
                        Setting
                      </th>
                      <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">
                        Provider
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((s, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 pr-3">{s.day || "—"}</td>
                        <td className="py-2 pr-3 text-gray-600 tabular-nums">
                          {s.start_time || "—"}
                        </td>
                        <td className="py-2 pr-3 text-gray-600 tabular-nums">
                          {s.end_time || "—"}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {formatDuration(scheduleDurationMinutes(s))}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {s.service || "—"}
                        </td>
                        <td className="py-2 pr-3 text-gray-600">
                          {s.setting ? SETTING_LABELS[s.setting] : "—"}
                        </td>
                        <td className="py-2 text-gray-600">
                          {s.provider || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {/* Section 8: Authorization Request */}
        {(plan.authorization_start_date ||
          plan.authorization_end_date ||
          plan.authorization_number ||
          plan.clinical_justification) && (
          <Section title="8. Authorization Request">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Authorization period
                </p>
                <p className="text-sm text-gray-800">
                  {formatDateOnly(plan.authorization_start_date)} –{" "}
                  {formatDateOnly(plan.authorization_end_date)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Authorization number
                </p>
                <p className="text-sm text-gray-800">
                  {plan.authorization_number || "Not yet assigned"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">
                  Requested hours / week
                </p>
                <p className="text-sm font-semibold text-indigo-700">
                  {formatHours(totalRequestedHours)}
                </p>
              </div>
            </div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">
              Clinical Justification / Medical Necessity
            </h4>
            {plan.clinical_justification ? (
              <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                {plan.clinical_justification}
              </p>
            ) : (
              <p className="text-sm text-gray-400">
                No clinical justification recorded yet.
              </p>
            )}
          </Section>
        )}

        {/* Signatures — rendered from the loader so a signed plan shows as
            signed on first paint; the panel refreshes itself after signing. */}
        <SignatureSection
          documentType="treatment_plan"
          documentId={plan.id}
          initialSignatures={initial.signatures ?? []}
        />

        {/* Empty state */}
        {!plan.reason_for_referral &&
          !plan.diagnosis &&
          !plan.behavior_intervention_plan &&
          goals.length === 0 &&
          behaviors.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-gray-300 py-12 text-center">
              <p className="text-sm text-gray-500">
                This plan is empty. Edit it to add content.
              </p>
              {canEdit && (
                <Link
                  to="/treatment-plans/$id/edit"
                  params={{ id: plan.id }}
                  className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  Edit Plan
                </Link>
              )}
            </div>
          )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5 print:shadow-none print:ring-0 print:border print:border-gray-200">
      <h3 className="text-base font-semibold text-gray-900 mb-3 border-b pb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function KV({
  label,
  value,
  block,
}: {
  label: string;
  value: string;
  block?: boolean;
}) {
  return block ? (
    <div>
      <dt className="text-xs font-semibold text-gray-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
        {value}
      </dd>
    </div>
  ) : (
    <div>
      <dt className="text-xs font-semibold text-gray-500 uppercase">{label}</dt>
      <dd className="text-sm font-medium text-gray-900">{value}</dd>
    </div>
  );
}
