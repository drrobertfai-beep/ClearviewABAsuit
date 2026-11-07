// ClearView ABA Suite — Audit Log Server Functions
//
// The audit trail is practice-scoped: every entry is stamped with the practice
// of the record it describes, and only that practice's entries are returned.
import { createServerFn } from "@tanstack/react-start";
import { getAuditLog, getAuditEntry } from "~/db";
import { requireSession } from "~/server/auth-guard";

export const getAuditLogFn = createServerFn({ method: "GET" })
  .validator(
    (d: unknown) =>
      d as {
        table?: string;
        action?: string;
        user?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
        offset?: number;
      },
  )
  .handler(async ({ data }) => {
    const { practiceId } = await requireSession();
    return getAuditLog(practiceId, data);
  });

export const getAuditEntryFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    const { practiceId } = await requireSession();
    return getAuditEntry(practiceId, data.id);
  });
