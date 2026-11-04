// ClearView ABA Suite — Signature & sign-off panel for clinical documents
//
// Renders the signature status of an assessment or treatment plan (BCBA +
// parent/guardian), shows the captured signature images, and lets the current
// user add a signature. Used by the treatment plan detail page.
//
// Signatures are fetched server-side by the page loader and passed in as
// `initialSignatures`, so a signed document renders as signed on first paint
// (important for a clinical record). After signing, the panel refreshes itself.

import { useCallback, useState } from "react";
import { addSignatureFn, getSignaturesFn } from "~/server/signatures";
import { SignaturePad } from "~/components/SignaturePad";
import type { Signature } from "~/db/types";

interface SignatureSectionProps {
  documentType: "assessment" | "treatment_plan";
  documentId: string;
  /** Signatures loaded with the page (SSR) so the signed state renders immediately. */
  initialSignatures?: Signature[];
  /** Called after a signature is stored. */
  onSigned?: (signature: Signature) => void;
}

const ROLE_LABELS: Record<string, string> = {
  bcba: "BCBA",
  parent_guardian: "Parent / Guardian",
  admin: "Administrator",
};

export function SignatureSection({
  documentType,
  documentId,
  initialSignatures = [],
  onSigned,
}: SignatureSectionProps) {
  const [signatures, setSignatures] = useState<Signature[]>(initialSignatures);
  const [showModal, setShowModal] = useState(false);
  const [role, setRole] = useState<"bcba" | "parent_guardian">("bcba");
  const [name, setName] = useState("");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const bcba = signatures.find((s) => s.signer_role === "bcba");
  const parent = signatures.find((s) => s.signer_role === "parent_guardian");
  const allSigned = Boolean(bcba && parent);

  const refresh = useCallback(async () => {
    try {
      const sigs = await getSignaturesFn({
        data: { documentType, documentId },
      });
      setSignatures(sigs);
    } catch {
      /* keep the signatures we already have */
    }
  }, [documentType, documentId]);

  const openModal = (nextRole: "bcba" | "parent_guardian") => {
    setRole(nextRole);
    setName("");
    setDataUrl(null);
    setError("");
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!dataUrl || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const signature = await addSignatureFn({
        data: {
          documentType,
          documentId,
          signerName: name.trim(),
          signerRole: role,
          signatureData: dataUrl,
        },
      });
      setShowModal(false);
      await refresh();
      onSigned?.(signature);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the signature.",
      );
    } finally {
      setSaving(false);
    }
  };

  const statusRow = (
    label: string,
    signature: Signature | undefined,
    nextRole: "bcba" | "parent_guardian",
  ) => (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {signature ? (
          <svg
            className="mt-0.5 h-5 w-5 flex-none text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        ) : (
          <svg
            className="mt-0.5 h-5 w-5 flex-none text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          {signature ? (
            <>
              <p className="text-xs text-gray-500">
                Signed by {signature.signer_name} on{" "}
                {new Date(signature.signed_at).toLocaleString()}
              </p>
              {signature.ip_address && (
                <p className="text-xs text-gray-400">
                  Captured from {signature.ip_address}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400">Pending signature</p>
          )}
        </div>
      </div>

      {signature ? (
        signature.signature_data ? (
          <img
            src={signature.signature_data}
            alt={`${label} signature`}
            className="h-14 w-40 flex-none rounded border border-gray-200 bg-white object-contain"
          />
        ) : null
      ) : (
        <button
          type="button"
          onClick={() => openModal(nextRole)}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
        >
          Sign now
        </button>
      )}
    </div>
  );

  return (
    <div className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5">
      <h3 className="mb-3 border-b pb-2 text-base font-semibold text-gray-900">
        Signatures
      </h3>

      {allSigned ? (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <svg
            className="h-6 w-6 flex-none text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div>
            <p className="text-sm font-semibold text-green-800">Fully Signed</p>
            <p className="text-xs text-green-600">
              All required signatures have been collected.
            </p>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {statusRow("BCBA Signature", bcba, "bcba")}
        {statusRow("Parent / Guardian Signature", parent, "parent_guardian")}
      </div>

      {signatures.length > 0 && (
        <p className="mt-3 text-xs text-gray-400">
          {signatures.length} signature{signatures.length === 1 ? "" : "s"} on
          record · every signature is written to the audit log.
        </p>
      )}

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Add signature"
        >
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h4 className="text-base font-semibold text-gray-900">
              Add signature
            </h4>
            <p className="mt-1 text-xs text-gray-500">
              Signing as {ROLE_LABELS[role] ?? role}. This is recorded with a
              timestamp in the audit log.
            </p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Signer role
                </span>
                <select
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as "bcba" | "parent_guardian")
                  }
                  className="input w-full"
                >
                  <option value="bcba">BCBA</option>
                  <option value="parent_guardian">Parent / Guardian</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Signer name
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input w-full"
                  placeholder="Full name"
                />
              </label>

              <div>
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Signature
                </span>
                <div className="rounded border border-gray-300">
                  <SignaturePad onSave={setDataUrl} width={440} height={160} />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!dataUrl || !name.trim() || saving}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save signature"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
