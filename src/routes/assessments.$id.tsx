// Assessment detail/view page — /assessments/$id
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { getAssessmentFn } from "~/server/assessments";
import { getClientFn } from "~/server/clients";
import type { Assessment, Client } from "~/db/types";
import { generateAssessmentPDF } from "~/routes/api/-pdf";
import { addSignatureFn, getSignaturesFn, hasAllSignaturesFn } from "~/server/signatures";
import { SignaturePad } from "~/components/SignaturePad";

export const Route = createFileRoute("/assessments/$id")({
  component: AssessmentDetailPage,
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

function AssessmentDetailPage() {
  const { assessment: initialAssessment, client: initialClient } =
    Route.useLoaderData() as {
      assessment: Assessment | null;
      client: Client | null;
    };
  const navigate = useNavigate();
  const params = Route.useParams();

  const [assessment, setAssessment] = useState<Assessment | null>(
    initialAssessment
  );
  const [client, setClient] = useState<Client | null>(initialClient);
  const [loading, setLoading] = useState(!initialAssessment);
  const [pdfLoading, setPdfLoading] = useState(false);

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
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [initialAssessment, params.id]);

  const scoring = useMemo(() => {
    if (!assessment?.raw_scores || typeof assessment.raw_scores !== "object")
      return null;
    const rs = assessment.raw_scores as Record<string, unknown>;
    return (rs._computed as Record<string, unknown>) ?? null;
  }, [assessment]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
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
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-lg border-2 border-dashed border-gray-300 py-16 text-center">
          <p className="text-sm font-medium text-gray-900">Assessment not found</p>
          <Link to="/assessments" className="mt-4 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">
            ← Back to Assessments
          </Link>
        </div>
      </div>
    );
  }

  const handleExportPDF = async () => {
    setPdfLoading(true);
    try {
      const result = await generateAssessmentPDF({ id: assessment.id });
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
      in_progress: "bg-yellow-100 text-yellow-800",
      completed: "bg-green-100 text-green-800",
    };
    const labels: Record<string, string> = {
      draft: "Draft",
      in_progress: "In Progress",
      completed: "Completed",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>
        {labels[status] ?? status}
      </span>
    );
  };

  const milestonesOverall = (scoring?.milestones as Record<string, unknown>)?.overallTotal as number | undefined;
  const milestonesMax = (scoring?.milestones as Record<string, unknown>)?.maxOverall as number | undefined;
  const barriersTotal = (scoring?.barriers as Record<string, unknown>)?.total as number | undefined;
  const barriersMax = (scoring?.barriers as Record<string, unknown>)?.max as number | undefined;
  const transitionTotal = (scoring?.transition as Record<string, unknown>)?.total as number | undefined;
  const transitionMax = (scoring?.transition as Record<string, unknown>)?.max as number | undefined;
  const eesaTotal = (scoring?.eesa as Record<string, unknown>)?.overallTotal as number | undefined;
  const taPct = (scoring?.task_analysis as Record<string, unknown>)?.overallPercentage as number | undefined;

  const scoreColor = (val: number, max: number, invert?: boolean) => {
    const pct = max > 0 ? val / max : 0;
    if (invert) return pct <= 0.25 ? "text-green-600" : pct <= 0.5 ? "text-yellow-600" : "text-red-600";
    return pct >= 0.75 ? "text-green-600" : pct >= 0.5 ? "text-yellow-600" : "text-red-600";
  };

  const bgColor = (val: number, max: number, invert?: boolean) => {
    const pct = max > 0 ? val / max : 0;
    if (invert) return pct <= 0.25 ? "bg-green-50 border-green-200" : pct <= 0.5 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";
    return pct >= 0.75 ? "bg-green-50 border-green-200" : pct >= 0.5 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200";
  };

  const canEdit = assessment.status === "draft" || assessment.status === "in_progress";

  // Signature state
  const [signatures, setSignatures] = useState<Array<{ id: string; document_type: string; document_id: string; signer_name: string; signer_role: string; signature_data: string | null; signed_at: string; ip_address?: string | null }>>([]);
  const [sigStatus, setSigStatus] = useState<{ bcba: boolean; parentGuardian: boolean; allSigned: boolean; bcbaSignature: any; parentSignature: any } | null>(null);
  const [showSignModal, setShowSignModal] = useState(false);
  const [signRole, setSignRole] = useState<string>("bcba");
  const [signName, setSignName] = useState("");
  const [signDataUrl, setSignDataUrl] = useState<string | null>(null);
  const [signingLoading, setSigningLoading] = useState(false);

  const fetchSignatures = useCallback(async () => {
    try {
      const [sigs, status] = await Promise.all([
        getSignaturesFn({ documentType: "assessment", documentId: params.id }),
        hasAllSignaturesFn({ documentType: "assessment", documentId: params.id }),
      ]);
      setSignatures(sigs);
      setSigStatus(status);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (assessment) fetchSignatures();
  }, [assessment?.id, fetchSignatures]);

  const handleSignSubmit = async () => {
    if (!signDataUrl || !signName.trim()) return;
    setSigningLoading(true);
    try {
      await addSignatureFn({
        documentType: "assessment",
        documentId: params.id,
        signerName: signName.trim(),
        signerRole: signRole,
        signatureData: signDataUrl,
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <nav className="mb-4 text-sm text-gray-500" aria-label="Breadcrumb">
        <ol className="flex items-center gap-2">
          <li><a href="/assessments" onClick={(e) => { e.preventDefault(); navigate({ to: "/assessments" }); }} className="hover:text-gray-700">Assessments</a></li>
          <li aria-hidden>/</li>
          <li className="text-gray-900 font-medium truncate max-w-[300px]">{assessment.tool_name} — {client?.name ?? "Unknown Client"}</li>
        </ol>
      </nav>

      <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5 mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">{assessment.tool_name} Assessment</h1>
              {statusBadge(assessment.status)}
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Client:{" "}
              {client ? (
                <Link to="/clients/$clientId" params={{ clientId: client.id }} className="font-medium text-indigo-600 hover:text-indigo-800">{client.name}</Link>
              ) : "Unknown Client"}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span>Date: {assessment.assessment_date ? new Date(assessment.assessment_date).toLocaleDateString() : "—"}</span>
              <span>Assessor: {assessment.assessor_name || "—"}</span>
              {assessment.tool_version && <span>Version: {assessment.tool_version}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <Link to="/assessments/$id/vb-mapp" params={{ id: assessment.id }} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>
                Edit
              </Link>
            )}
            <button type="button" onClick={handleExportPDF} disabled={pdfLoading} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {pdfLoading ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
              )}
              {pdfLoading ? "Generating PDF…" : "Export PDF"}
            </button>
          </div>
        </div>
      </div>

      {scoring ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
          {milestonesOverall !== undefined && milestonesMax !== undefined && (
            <div className={`rounded-lg border p-4 ${bgColor(milestonesOverall, milestonesMax)}`}>
              <h3 className="text-sm font-semibold text-gray-700">Milestones</h3>
              <p className={`mt-1 text-2xl font-bold ${scoreColor(milestonesOverall, milestonesMax)}`}>{milestonesOverall} <span className="text-sm font-normal text-gray-400">/ {milestonesMax}</span></p>
            </div>
          )}
          {barriersTotal !== undefined && barriersMax !== undefined && (
            <div className={`rounded-lg border p-4 ${bgColor(barriersTotal, barriersMax, true)}`}>
              <h3 className="text-sm font-semibold text-gray-700">Barriers</h3>
              <p className={`mt-1 text-2xl font-bold ${scoreColor(barriersTotal, barriersMax, true)}`}>{barriersTotal} <span className="text-sm font-normal text-gray-400">/ {barriersMax}</span></p>
            </div>
          )}
          {transitionTotal !== undefined && transitionMax !== undefined && (
            <div className={`rounded-lg border p-4 ${bgColor(transitionTotal, transitionMax)}`}>
              <h3 className="text-sm font-semibold text-gray-700">Transition</h3>
              <p className={`mt-1 text-2xl font-bold ${scoreColor(transitionTotal, transitionMax)}`}>{transitionTotal} <span className="text-sm font-normal text-gray-400">/ {transitionMax}</span></p>
            </div>
          )}
          {eesaTotal !== undefined && (
            <div className="rounded-lg border border-gray-200 bg-white p-4"><h3 className="text-sm font-semibold text-gray-700">EESA</h3><p className="mt-1 text-2xl font-bold text-indigo-600">{eesaTotal}</p></div>
          )}
          {taPct !== undefined && (
            <div className="rounded-lg border border-gray-200 bg-white p-4"><h3 className="text-sm font-semibold text-gray-700">Task Analysis</h3><p className="mt-1 text-2xl font-bold text-indigo-600">{taPct}%</p></div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-gray-300 py-12 text-center mb-6">
          <p className="text-sm text-gray-500">{assessment.status === "draft" ? "This assessment has not been scored yet." : "No score data available."}</p>
          {canEdit && <Link to="/assessments/$id/vb-mapp" params={{ id: assessment.id }} className="mt-3 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Start Scoring</Link>}
        </div>
      )}

      {assessment.summary_notes && (
        <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Summary Notes</h2>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{assessment.summary_notes}</p>
        </div>
      )}

      {/* Signature Status */}
      {assessment && (
        <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5 mb-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3 border-b pb-2">Signatures</h3>
          {sigStatus?.allSigned ? (
            <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-green-800">Fully Signed</p>
                <p className="text-xs text-green-600">All required signatures have been collected.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  {sigStatus?.bcba ? (
                    <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">BCBA Signature</p>
                    {sigStatus?.bcba && sigStatus.bcbaSignature ? (
                      <p className="text-xs text-gray-500">
                        Signed by {sigStatus.bcbaSignature.signer_name} on {new Date(sigStatus.bcbaSignature.signed_at).toLocaleString()}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">⏳ Pending</p>
                    )}
                  </div>
                </div>
                {!sigStatus?.bcba && (
                  <button type="button" onClick={() => { setSignRole("bcba"); setShowSignModal(true); }}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors">
                    Sign Now
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  {sigStatus?.parentGuardian ? (
                    <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">Parent / Guardian Signature</p>
                    {sigStatus?.parentGuardian && sigStatus.parentSignature ? (
                      <p className="text-xs text-gray-500">
                        Signed by {sigStatus.parentSignature.signer_name} on {new Date(sigStatus.parentSignature.signed_at).toLocaleString()}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">⏳ Pending</p>
                    )}
                  </div>
                </div>
                {!sigStatus?.parentGuardian && (
                  <button type="button" onClick={() => { setSignRole("parent_guardian"); setShowSignModal(true); }}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors">
                    Sign Now
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="text-xs text-gray-400 space-y-1">
        <p>Created: {new Date(assessment.created_at).toLocaleString()}</p>
        <p>Updated: {new Date(assessment.updated_at).toLocaleString()}</p>
        <p>ID: {assessment.id}</p>
      </div>

      {/* Signing Modal */}
      {showSignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Sign Assessment</h2>
              <button type="button" onClick={() => setShowSignModal(false)}
                className="rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">I am signing as:</label>
                <select value={signRole} onChange={(e) => setSignRole(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="bcba">BCBA</option>
                  <option value="parent_guardian">Parent / Guardian</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                <input type="text" value={signName} onChange={(e) => setSignName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Signature</label>
                <SignaturePad onSave={setSignDataUrl} />
              </div>
              <button type="button" onClick={handleSignSubmit}
                disabled={!signDataUrl || !signName.trim() || signingLoading}
                className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {signingLoading ? "Saving…" : "Confirm & Sign"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mt-8 flex items-center justify-between">
        <Link to="/assessments" className="text-sm text-gray-500 hover:text-gray-700">← Back to Assessments</Link>
      </div>
    </div>
  );
}
