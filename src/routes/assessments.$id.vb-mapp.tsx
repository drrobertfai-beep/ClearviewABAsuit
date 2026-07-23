// VB-MAPP Assessment Form — /assessments/$id/vb-mapp
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { getAssessmentFn, updateAssessmentFn } from "~/server/assessments";
import { getClientFn } from "~/server/clients";
import {
  VBMAPPForm,
  initVBMAPPScores,
  type VBMAPPScores,
} from "~/components/VBMAPPForm";
import type { Assessment, Client } from "~/db/types";

export const Route = createFileRoute("/assessments/$id/vb-mapp")({
  component: VBMAPPFormPage,
  loader: async ({ params }) => {
    try {
      const assessment = await getAssessmentFn({ id: params.id });
      let client: Client | null = null;
      if (assessment?.client_id) {
        client = await getClientFn({ id: assessment.client_id });
      }
      return { assessment, client };
    } catch {
      return { assessment: null, client: null };
    }
  },
});

function VBMAPPFormPage() {
  const { assessment: initialAssessment, client: initialClient } =
    Route.useLoaderData() as {
      assessment: Assessment | null;
      client: Client | null;
    };
  const navigate = useNavigate();
  const params = Route.useParams();

  const [assessment, setAssessment] = useState<Assessment | null>(initialAssessment);
  const [client, setClient] = useState<Client | null>(initialClient);
  const [loading, setLoading] = useState(!initialAssessment);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [scores, setScores] = useState<VBMAPPScores>(() => {
    if (initialAssessment?.raw_scores && typeof initialAssessment.raw_scores === "object") {
      const rs = initialAssessment.raw_scores as Record<string, unknown>;
      const defaults = initVBMAPPScores();
      if (rs.milestones && typeof rs.milestones === "object") {
        defaults.milestones = { ...defaults.milestones, ...(rs.milestones as any) };
      }
      if (rs.barriers && typeof rs.barriers === "object") {
        defaults.barriers = { ...defaults.barriers, ...(rs.barriers as any) };
      }
      if (rs.transition && typeof rs.transition === "object") {
        defaults.transition = { ...defaults.transition, ...(rs.transition as any) };
      }
      if (rs.eesa && typeof rs.eesa === "object") {
        defaults.eesa = { ...defaults.eesa, ...(rs.eesa as any) };
      }
      if (rs.task_analysis && typeof rs.task_analysis === "object") {
        defaults.task_analysis = { ...defaults.task_analysis, ...(rs.task_analysis as any) };
      }
      return defaults;
    }
    return initVBMAPPScores();
  });

  useEffect(() => {
    if (!initialAssessment) {
      setLoading(true);
      getAssessmentFn({ id: params.id })
        .then(async (a) => {
          setAssessment(a);
          if (a?.client_id) {
            const c = await getClientFn({ id: a.client_id });
            setClient(c);
          }
          if (a?.raw_scores && typeof a.raw_scores === "object" && !("_computed" in (a.raw_scores as Record<string, unknown>))) {
            const rs = a.raw_scores as Record<string, unknown>;
            const defaults = initVBMAPPScores();
            if (rs.milestones) defaults.milestones = { ...defaults.milestones, ...(rs.milestones as any) };
            if (rs.barriers) defaults.barriers = { ...defaults.barriers, ...(rs.barriers as any) };
            if (rs.transition) defaults.transition = { ...defaults.transition, ...(rs.transition as any) };
            if (rs.eesa) defaults.eesa = { ...defaults.eesa, ...(rs.eesa as any) };
            if (rs.task_analysis) defaults.task_analysis = { ...defaults.task_analysis, ...(rs.task_analysis as any) };
            setScores(defaults);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [initialAssessment, params.id]);

  const progress = useMemo(() => {
    let scored = 0;
    let total = 0;
    for (const domains of Object.values(scores.milestones)) {
      for (const items of Object.values(domains)) {
        for (const item of items) { if (item > 0) scored++; total++; }
      }
    }
    for (const v of Object.values(scores.barriers)) { if (v > 0) scored++; total++; }
    for (const v of Object.values(scores.transition)) { if (v > 0) scored++; total++; }
    for (const items of Object.values(scores.eesa)) {
      for (const item of items) { if (item > 0) scored++; total++; }
    }
    for (const items of Object.values(scores.task_analysis)) {
      for (const item of items) { if (item === 1) scored++; total++; }
    }
    return { scored, total, pct: total > 0 ? Math.round((scored / total) * 100) : 0 };
  }, [scores]);

  const handleSaveDraft = useCallback(async () => {
    if (!assessment) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const rawScores: Record<string, unknown> = {
        milestones: scores.milestones,
        barriers: scores.barriers,
        transition: scores.transition,
        eesa: scores.eesa,
        task_analysis: scores.task_analysis,
      };
      await updateAssessmentFn({ id: assessment.id, data: { raw_scores: rawScores, status: "in_progress" } });
      setAssessment((prev) => prev ? { ...prev, status: "in_progress" as const } : prev);
      setStatusMessage({ type: "success", text: "Draft saved successfully." });
    } catch (err) {
      setStatusMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to save draft." });
    } finally { setSaving(false); }
  }, [assessment, scores]);

  const handleSubmit = useCallback(async () => {
    if (!assessment) return;
    if (progress.scored === 0) {
      setStatusMessage({ type: "error", text: "Please score at least some items before submitting." });
      return;
    }
    setSaving(true);
    setStatusMessage(null);
    try {
      const rawScores: Record<string, unknown> = {
        milestones: scores.milestones,
        barriers: scores.barriers,
        transition: scores.transition,
        eesa: scores.eesa,
        task_analysis: scores.task_analysis,
      };
      await updateAssessmentFn({ id: assessment.id, data: { raw_scores: rawScores, status: "completed" } });
      setAssessment((prev) => prev ? { ...prev, status: "completed" as const } : prev);
      setStatusMessage({ type: "success", text: "Assessment completed successfully!" });
      setTimeout(() => { navigate({ to: "/assessments/$id", params: { id: assessment.id } }); }, 1500);
    } catch (err) {
      setStatusMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to submit assessment." });
    } finally { setSaving(false); }
  }, [assessment, scores, progress.scored, navigate]);

  const readOnly = assessment?.status === "completed";

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 py-12 text-gray-500 justify-center">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading assessment&hellip;
        </div>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border-2 border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm font-medium text-gray-900">Assessment not found</p>
          <Link to="/assessments" className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">← Back to Assessments</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <nav className="mb-4 text-sm text-gray-500" aria-label="Breadcrumb">
        <ol className="flex items-center gap-2">
          <li><Link to="/assessments" className="hover:text-gray-700">Assessments</Link></li>
          <li aria-hidden>/</li>
          <li><Link to="/assessments/$id" params={{ id: assessment.id }} className="hover:text-gray-700">{assessment.tool_name}</Link></li>
          <li aria-hidden>/</li>
          <li className="text-gray-900 font-medium">VB-MAPP Form</li>
        </ol>
      </nav>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">VB-MAPP Assessment</h1>
          <p className="mt-1 text-sm text-gray-500">
            Client: <span className="font-medium text-gray-700">{client?.name ?? "Unknown"}</span>
            {assessment.status === "completed" && <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Completed</span>}
            {assessment.status === "in_progress" && <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">In Progress</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-500"><span className="font-medium">{progress.pct}%</span> complete</div>
          <div className="h-2 w-32 rounded-full bg-gray-200 overflow-hidden"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress.pct}%` }} /></div>
        </div>
      </div>

      {statusMessage && (
        <div className={`mb-4 rounded-md p-3 text-sm ${statusMessage.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`} role="alert">
          {statusMessage.text}
        </div>
      )}

      {readOnly && (
        <div className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-700">This assessment has been completed and is in read-only mode.</div>
      )}

      <div className="rounded-lg bg-white p-4 shadow ring-1 ring-black/5 sm:p-6">
        <VBMAPPForm scores={scores} onChange={setScores} readOnly={readOnly} />
      </div>

      {!readOnly && (
        <div className="mt-6 flex items-center justify-between">
          <Link to="/assessments" className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors">Back to List</Link>
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleSaveDraft} disabled={saving} className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm ring-1 ring-inset ring-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-60">
              {saving ? "Saving…" : "Save Draft"}
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-60">
              {saving ? "Submitting…" : "Submit Assessment"}
            </button>
          </div>
        </div>
      )}

      {readOnly && (
        <div className="mt-6 flex items-center justify-between">
          <Link to="/assessments" className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors">Back to List</Link>
          <Link to="/assessments/$id" params={{ id: assessment.id }} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors">View Summary</Link>
        </div>
      )}
    </div>
  );
}
