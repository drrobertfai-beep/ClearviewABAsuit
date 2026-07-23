// ClearView ABA Suite — Signature Server Functions
import { createServerFn } from "@tanstack/react-start";
import { getSignatures, addSignature, getSignaturesByRole } from "~/db";
import { updateTreatmentPlan } from "~/db";
import type { Signature } from "~/db/types";

export const addSignatureFn = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        documentType: string;
        documentId: string;
        signerName: string;
        signerRole: string;
        signatureData: string;
      },
  )
  .handler(async ({ data }) => {
    const sig = await addSignature(
      {
        document_type: data.documentType,
        document_id: data.documentId,
        signer_name: data.signerName,
        signer_role: data.signerRole,
        signature_data: data.signatureData,
      },
      data.signerName,
    );

    // If both BCBA and parent have signed, auto-approve
    if (data.documentType === "treatment_plan") {
      const bcbaSig = await getSignaturesByRole("treatment_plan", data.documentId, "bcba");
      const parentSig = await getSignaturesByRole("treatment_plan", data.documentId, "parent_guardian");
      if (bcbaSig && parentSig) {
        await updateTreatmentPlan(data.documentId, { status: "approved" }, "system");
      }
    }

    if (data.documentType === "assessment") {
      const bcbaSig = await getSignaturesByRole("assessment", data.documentId, "bcba");
      const parentSig = await getSignaturesByRole("assessment", data.documentId, "parent_guardian");
      if (bcbaSig && parentSig) {
        // Assessment is already "completed" — maybe lock it here
      }
    }

    return sig;
  });

export const getSignaturesFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { documentType: string; documentId: string })
  .handler(async ({ data }) => {
    return getSignatures(data.documentType, data.documentId);
  });

export const hasAllSignaturesFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { documentType: string; documentId: string })
  .handler(async ({ data }) => {
    const bcbaSig = await getSignaturesByRole(data.documentType, data.documentId, "bcba");
    const parentSig = await getSignaturesByRole(data.documentType, data.documentId, "parent_guardian");
    return {
      bcba: !!bcbaSig,
      parentGuardian: !!parentSig,
      allSigned: !!(bcbaSig && parentSig),
      bcbaSignature: bcbaSig,
      parentSignature: parentSig,
    };
  });
