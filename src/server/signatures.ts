// ClearView ABA Suite — Signature Server Functions
//
// Signatures belong to a document (assessment or treatment plan), so every
// handler resolves the caller's practice and the db layer refuses to read or
// write signatures for a document in another practice.
import { createServerFn } from "@tanstack/react-start";
import { getSignatures, addSignature, getSignaturesByRole } from "~/db";
import { updateTreatmentPlan } from "~/db";
import { requireSession } from "~/server/auth-guard";

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
    const { practiceId } = await requireSession();
    const sig = await addSignature(
      practiceId,
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
      const bcbaSig = await getSignaturesByRole(
        practiceId,
        "treatment_plan",
        data.documentId,
        "bcba",
      );
      const parentSig = await getSignaturesByRole(
        practiceId,
        "treatment_plan",
        data.documentId,
        "parent_guardian",
      );
      if (bcbaSig && parentSig) {
        await updateTreatmentPlan(
          practiceId,
          data.documentId,
          { status: "approved" },
          "system",
        );
      }
    }

    if (data.documentType === "assessment") {
      const bcbaSig = await getSignaturesByRole(
        practiceId,
        "assessment",
        data.documentId,
        "bcba",
      );
      const parentSig = await getSignaturesByRole(
        practiceId,
        "assessment",
        data.documentId,
        "parent_guardian",
      );
      if (bcbaSig && parentSig) {
        // Assessment is already "completed" — maybe lock it here
      }
    }

    return sig;
  });

export const getSignaturesFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { documentType: string; documentId: string })
  .handler(async ({ data }) => {
    const { practiceId } = await requireSession();
    return getSignatures(practiceId, data.documentType, data.documentId);
  });

export const hasAllSignaturesFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { documentType: string; documentId: string })
  .handler(async ({ data }) => {
    const { practiceId } = await requireSession();
    const bcbaSig = await getSignaturesByRole(
      practiceId,
      data.documentType,
      data.documentId,
      "bcba",
    );
    const parentSig = await getSignaturesByRole(
      practiceId,
      data.documentType,
      data.documentId,
      "parent_guardian",
    );
    return {
      bcba: !!bcbaSig,
      parentGuardian: !!parentSig,
      allSigned: !!(bcbaSig && parentSig),
      bcbaSignature: bcbaSig,
      parentSignature: parentSig,
    };
  });
