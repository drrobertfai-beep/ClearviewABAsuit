// ClearView ABA Suite — Audit logging helper
// Inserts a row into audit_log. Called from CRUD helpers server-side only.
//
// Every audit row is stamped with the practice of the record it describes, so
// the audit trail can be scoped to the caller's practice with a single column
// comparison (signatures and other child rows have no client_id of their own).

import { sql } from "./sql";
import type { AuditAction } from "./types";

export async function auditChange(
  practiceId: string,
  tableName: string,
  recordId: string,
  action: AuditAction,
  changedBy: string | null,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null,
): Promise<void> {
  await sql()`
    INSERT INTO audit_log (practice_id, table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (${practiceId}, ${tableName}, ${recordId}, ${action}, ${changedBy}, ${oldValues ? JSON.stringify(oldValues) : null}::jsonb, ${newValues ? JSON.stringify(newValues) : null}::jsonb)
  `;
}
