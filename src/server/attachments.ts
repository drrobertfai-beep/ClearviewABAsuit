// ClearView ABA Suite — Plan attachment server functions
//
// Reads and deletes go through server functions; the upload and the download go
// through /api/plan-attachments because both move bytes. Every handler resolves
// the caller's practice from the session, so a plan or attachment id from
// another practice is indistinguishable from one that does not exist.

import { createServerFn } from "@tanstack/react-start";
import {
  listPlanAttachments,
  deletePlanAttachment,
  MAX_ATTACHMENTS_PER_PLAN,
} from "~/db";
import type { PlanAttachment } from "~/db/types";
import { requirePracticeRole, requireSession } from "~/server/auth-guard";

export interface PlanAttachmentList {
  attachments: PlanAttachment[];
  maxAttachments: number;
}

/** The graphs attached to a plan, plus the caps the UI displays. */
export const listPlanAttachmentsFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { planId: string })
  .handler(async ({ data }): Promise<PlanAttachmentList> => {
    const { practiceId } = await requireSession();
    const attachments = await listPlanAttachments(practiceId, data.planId);
    return { attachments, maxAttachments: MAX_ATTACHMENTS_PER_PLAN };
  });

export const deletePlanAttachmentFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    const { practiceId, user } = await requirePracticeRole([
      "owner",
      "admin",
      "clinician",
    ]);
    const removed = await deletePlanAttachment(practiceId, data.id, user.email);
    if (!removed) {
      throw new Error("Attachment not found");
    }
    return { ok: true };
  });
