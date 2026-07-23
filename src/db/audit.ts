// ClearView ABA Suite — Audit logging helper
// Inserts a row into audit_log. Called from CRUD helpers server-side only.

import { sql } from "./sql";
import type { AuditAction } from "./types";

export async function auditChange(
  tableName: string,
  recordId: string,
  action: AuditAction,
  changedBy: string | null,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): Promise<void> {
  await sql()`
    INSERT INTO audit_log (table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (${tableName}, ${recordId}, ${action}, ${changedBy}, ${oldValues ? JSON.stringify(oldValues) : null}::jsonb, ${newValues ? JSON.stringify(newValues) : null}::jsonb)
  `;
}
