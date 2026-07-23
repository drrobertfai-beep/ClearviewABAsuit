// ClearView ABA Suite — Audit Log Server Functions
import { createServerFn } from "@tanstack/react-start";
import { getAuditLog, getAuditEntry } from "~/db";

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
    return getAuditLog(data);
  });

export const getAuditEntryFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    return getAuditEntry(data.id);
  });
