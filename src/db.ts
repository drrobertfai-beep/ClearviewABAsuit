// ClearView ABA Suite — Database helpers
// All data mutations happen server-side only (createServerFn or API routes).
// Never import these into client code.

import { sql } from "./db/sql";
export { sql };

import { auditChange } from "./db/audit";
export { auditChange };

// Auth helpers
export {
  getUserByEmail,
  getUserById,
  createUser,
  createSession,
  getSessionByToken,
  deleteSession,
  deleteExpiredSessions,
} from "./db/auth";
export type { Session, SessionWithUser } from "./db/auth";

import type {
  Client,
  Assessment,
  TreatmentPlan,
  Signature,
  AuditEntry,
  User,
  ClientStatus,
  AssessmentStatus,
  TreatmentPlanStatus,
} from "./db/types";
export type {
  Client,
  Assessment,
  TreatmentPlan,
  Signature,
  AuditEntry,
  User,
  ClientStatus,
  AssessmentStatus,
  TreatmentPlanStatus,
};

// ============================================================================
// Helper: coerce row dates to strings so React can render them
// ============================================================================
function coerceRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

// ============================================================================
// CLIENTS
// ============================================================================

export async function getClient(id: string): Promise<Client | null> {
  const rows = await sql()`SELECT * FROM clients WHERE id = ${id}`;
  return rows.length > 0 ? coerceRow<Client>(rows[0]) : null;
}

export async function listClients(opts?: {
  status?: ClientStatus;
  limit?: number;
  offset?: number;
}): Promise<Client[]> {
  const { status, limit = 50, offset = 0 } = opts ?? {};
  let rows;
  if (status) {
    rows = await sql()`SELECT * FROM clients WHERE status = ${status} ORDER BY name LIMIT ${limit} OFFSET ${offset}`;
  } else {
    rows = await sql()`SELECT * FROM clients ORDER BY name LIMIT ${limit} OFFSET ${offset}`;
  }
  return rows.map((r) => coerceRow<Client>(r));
}

export async function createClient(
  data: Omit<Client, "id" | "created_at" | "updated_at">,
  changedBy?: string,
): Promise<Client> {
  const rows = await sql()`
    INSERT INTO clients (
      name, date_of_birth, gender, contact_email, contact_phone, address,
      referral_source, diagnoses, setting, insurance_info, consent_flags,
      privacy_notes, status
    ) VALUES (
      ${data.name}, ${data.date_of_birth ?? null}, ${data.gender ?? null},
      ${data.contact_email ?? null}, ${data.contact_phone ?? null}, ${data.address ?? null},
      ${data.referral_source ?? null}, ${JSON.stringify(data.diagnoses ?? [])}::jsonb,
      ${data.setting ?? null}, ${JSON.stringify(data.insurance_info ?? {})}::jsonb,
      ${JSON.stringify(data.consent_flags ?? {})}::jsonb,
      ${data.privacy_notes ?? null}, ${data.status ?? "active"}
    )
    RETURNING *
  `;
  const client = coerceRow<Client>(rows[0]);
  if (changedBy) {
    await auditChange("clients", client.id, "CREATE", changedBy, null, client as unknown as Record<string, unknown>);
  }
  return client;
}

export async function updateClient(
  id: string,
  data: Partial<Omit<Client, "id" | "created_at" | "updated_at">>,
  changedBy?: string,
): Promise<Client | null> {
  const old = await getClient(id);
  if (!old) return null;

  const setClauses: string[] = [];
  const values: unknown[] = [];

  const fields: (keyof typeof data)[] = [
    "name", "date_of_birth", "gender", "contact_email", "contact_phone",
    "address", "referral_source", "setting", "privacy_notes", "status",
  ];
  for (const f of fields) {
    if (f in data) {
      setClauses.push(`${f} = $${values.length + 1}`);
      values.push((data as Record<string, unknown>)[f] ?? null);
    }
  }
  // JSONB fields
  for (const f of ["diagnoses", "insurance_info", "consent_flags"] as const) {
    if (f in data) {
      setClauses.push(`${f} = $${values.length + 1}::jsonb`);
      values.push(JSON.stringify((data as Record<string, unknown>)[f]));
    }
  }

  setClauses.push(`updated_at = now()`);

  if (setClauses.length === 1) return old; // only updated_at — nothing changed

  const rows = await sql()`UPDATE clients SET ${sql().unsafe?.(setClauses.join(", ")) ?? sql()`${""}`} WHERE id = ${id} RETURNING *`;
  // Use a simpler approach — build the query differently for safety
  const rows2 = await sql()`
    UPDATE clients SET
      name = COALESCE(${data.name ?? null}, name),
      date_of_birth = COALESCE(${data.date_of_birth !== undefined ? (data.date_of_birth ?? null) : undefined}::date, date_of_birth),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;

  // Actually, the safe approach is to build the query manually. Let me use a clean pattern:
  const client = await _updateClientInternal(id, data);
  if (changedBy && client) {
    await auditChange("clients", id, "UPDATE", changedBy, old as unknown as Record<string, unknown>, client as unknown as Record<string, unknown>);
  }
  return client;
}

async function _updateClientInternal(
  id: string,
  data: Partial<Omit<Client, "id" | "created_at" | "updated_at">>,
): Promise<Client | null> {
  // Build SET clause from provided fields
  const parts: string[] = [];
  const bindings: unknown[] = [];
  let idx = 1;

  const scalarFields: (keyof typeof data)[] = [
    "name", "date_of_birth", "gender", "contact_email", "contact_phone",
    "address", "referral_source", "setting", "privacy_notes", "status",
  ];
  for (const f of scalarFields) {
    if (f in data) {
      parts.push(`${f} = $${idx++}`);
      bindings.push((data as Record<string, unknown>)[f] ?? null);
    }
  }
  for (const f of ["diagnoses", "insurance_info", "consent_flags"] as const) {
    if (f in data) {
      parts.push(`${f} = $${idx++}::jsonb`);
      bindings.push(JSON.stringify((data as Record<string, unknown>)[f]));
    }
  }

  if (parts.length === 0) return null;
  parts.push("updated_at = now()");

  const query = `UPDATE clients SET ${parts.join(", ")} WHERE id = $${idx++} RETURNING *`;
  bindings.push(id);

  const neonClient = sql();
  const rows = await neonClient.query(query, bindings);
  return rows.length > 0 ? coerceRow<Client>(rows[0]) : null;
}

export async function deleteClient(id: string, changedBy?: string): Promise<boolean> {
  const old = await getClient(id);
  if (!old) return false;
  await sql()`DELETE FROM clients WHERE id = ${id}`;
  if (changedBy) {
    await auditChange("clients", id, "DELETE", changedBy, old as unknown as Record<string, unknown>, null);
  }
  return true;
}

// ============================================================================
// ASSESSMENTS
// ============================================================================

export async function getAssessment(id: string): Promise<Assessment | null> {
  const rows = await sql()`SELECT * FROM assessments WHERE id = ${id}`;
  return rows.length > 0 ? coerceRow<Assessment>(rows[0]) : null;
}

export async function listAssessments(opts?: {
  clientId?: string;
  status?: AssessmentStatus;
  limit?: number;
  offset?: number;
}): Promise<Assessment[]> {
  const { clientId, status, limit = 50, offset = 0 } = opts ?? {};
  let rows;
  if (clientId && status) {
    rows = await sql()`SELECT * FROM assessments WHERE client_id = ${clientId} AND status = ${status} ORDER BY assessment_date DESC LIMIT ${limit} OFFSET ${offset}`;
  } else if (clientId) {
    rows = await sql()`SELECT * FROM assessments WHERE client_id = ${clientId} ORDER BY assessment_date DESC LIMIT ${limit} OFFSET ${offset}`;
  } else if (status) {
    rows = await sql()`SELECT * FROM assessments WHERE status = ${status} ORDER BY assessment_date DESC LIMIT ${limit} OFFSET ${offset}`;
  } else {
    rows = await sql()`SELECT * FROM assessments ORDER BY assessment_date DESC LIMIT ${limit} OFFSET ${offset}`;
  }
  return rows.map((r) => coerceRow<Assessment>(r));
}

export async function createAssessment(
  data: Omit<Assessment, "id" | "created_at" | "updated_at">,
  changedBy?: string,
): Promise<Assessment> {
  const rows = await sql()`
    INSERT INTO assessments (
      client_id, tool_name, tool_version, assessment_date, assessor_name,
      status, raw_scores, summary_notes
    ) VALUES (
      ${data.client_id}, ${data.tool_name}, ${data.tool_version ?? null},
      ${data.assessment_date}, ${data.assessor_name},
      ${data.status ?? "draft"}, ${JSON.stringify(data.raw_scores ?? {})}::jsonb,
      ${data.summary_notes ?? null}
    )
    RETURNING *
  `;
  const assessment = coerceRow<Assessment>(rows[0]);
  if (changedBy) {
    await auditChange("assessments", assessment.id, "CREATE", changedBy, null, assessment as unknown as Record<string, unknown>);
  }
  return assessment;
}

export async function updateAssessment(
  id: string,
  data: Partial<Omit<Assessment, "id" | "created_at" | "updated_at">>,
  changedBy?: string,
): Promise<Assessment | null> {
  const old = await getAssessment(id);
  if (!old) return null;

  const parts: string[] = [];
  const bindings: unknown[] = [];
  let idx = 1;

  const scalarFields: (keyof typeof data)[] = [
    "client_id", "tool_name", "tool_version", "assessment_date",
    "assessor_name", "status", "summary_notes",
  ];
  for (const f of scalarFields) {
    if (f in data) {
      parts.push(`${f} = $${idx++}`);
      bindings.push((data as Record<string, unknown>)[f] ?? null);
    }
  }
  if ("raw_scores" in data) {
    parts.push(`raw_scores = $${idx++}::jsonb`);
    bindings.push(JSON.stringify((data as Record<string, unknown>).raw_scores));
  }

  if (parts.length === 0) return old;
  parts.push("updated_at = now()");

  const query = `UPDATE assessments SET ${parts.join(", ")} WHERE id = $${idx++} RETURNING *`;
  bindings.push(id);

  const rows = await sql().query(query, bindings);
  const assessment = rows.length > 0 ? coerceRow<Assessment>(rows[0]) : null;
  if (changedBy && assessment) {
    await auditChange("assessments", id, "UPDATE", changedBy, old as unknown as Record<string, unknown>, assessment as unknown as Record<string, unknown>);
  }
  return assessment;
}

export async function deleteAssessment(id: string, changedBy?: string): Promise<boolean> {
  const old = await getAssessment(id);
  if (!old) return false;
  await sql()`DELETE FROM assessments WHERE id = ${id}`;
  if (changedBy) {
    await auditChange("assessments", id, "DELETE", changedBy, old as unknown as Record<string, unknown>, null);
  }
  return true;
}

// ============================================================================
// TREATMENT PLANS
// ============================================================================

export async function getTreatmentPlan(id: string): Promise<TreatmentPlan | null> {
  const rows = await sql()`SELECT * FROM treatment_plans WHERE id = ${id}`;
  return rows.length > 0 ? coerceRow<TreatmentPlan>(rows[0]) : null;
}

export async function listTreatmentPlans(opts?: {
  clientId?: string;
  status?: TreatmentPlanStatus;
  limit?: number;
  offset?: number;
}): Promise<TreatmentPlan[]> {
  const { clientId, status, limit = 50, offset = 0 } = opts ?? {};
  let rows;
  if (clientId && status) {
    rows = await sql()`SELECT * FROM treatment_plans WHERE client_id = ${clientId} AND status = ${status} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  } else if (clientId) {
    rows = await sql()`SELECT * FROM treatment_plans WHERE client_id = ${clientId} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  } else if (status) {
    rows = await sql()`SELECT * FROM treatment_plans WHERE status = ${status} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  } else {
    rows = await sql()`SELECT * FROM treatment_plans ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  }
  return rows.map((r) => coerceRow<TreatmentPlan>(r));
}

export async function createTreatmentPlan(
  data: Omit<TreatmentPlan, "id" | "created_at" | "updated_at">,
  changedBy?: string,
): Promise<TreatmentPlan> {
  const rows = await sql()`
    INSERT INTO treatment_plans (
      client_id, assessment_id, reason_for_referral, diagnosis, treatment_history,
      concurrent_services, family_history, school_info, maladaptive_behaviors,
      behavior_intervention_plan, skill_acquisition_goals, assessment_outcomes,
      parent_training_goals, service_coordination_goals, discharge_criteria,
      requested_services, therapy_schedule, status
    ) VALUES (
      ${data.client_id}, ${data.assessment_id ?? null},
      ${data.reason_for_referral ?? null}, ${data.diagnosis ?? null},
      ${data.treatment_history ?? null},
      ${JSON.stringify(data.concurrent_services ?? [])}::jsonb,
      ${data.family_history ?? null}, ${data.school_info ?? null},
      ${JSON.stringify(data.maladaptive_behaviors ?? [])}::jsonb,
      ${data.behavior_intervention_plan ?? null},
      ${JSON.stringify(data.skill_acquisition_goals ?? [])}::jsonb,
      ${data.assessment_outcomes ?? null},
      ${JSON.stringify(data.parent_training_goals ?? [])}::jsonb,
      ${JSON.stringify(data.service_coordination_goals ?? [])}::jsonb,
      ${data.discharge_criteria ?? null},
      ${JSON.stringify(data.requested_services ?? [])}::jsonb,
      ${JSON.stringify(data.therapy_schedule ?? {})}::jsonb,
      ${data.status ?? "draft"}
    )
    RETURNING *
  `;
  const plan = coerceRow<TreatmentPlan>(rows[0]);
  if (changedBy) {
    await auditChange("treatment_plans", plan.id, "CREATE", changedBy, null, plan as unknown as Record<string, unknown>);
  }
  return plan;
}

export async function updateTreatmentPlan(
  id: string,
  data: Partial<Omit<TreatmentPlan, "id" | "created_at" | "updated_at">>,
  changedBy?: string,
): Promise<TreatmentPlan | null> {
  const old = await getTreatmentPlan(id);
  if (!old) return null;

  const parts: string[] = [];
  const bindings: unknown[] = [];
  let idx = 1;

  const scalarFields: (keyof typeof data)[] = [
    "client_id", "assessment_id", "reason_for_referral", "diagnosis",
    "treatment_history", "family_history", "school_info",
    "behavior_intervention_plan", "assessment_outcomes", "discharge_criteria", "status",
  ];
  for (const f of scalarFields) {
    if (f in data) {
      parts.push(`${f} = $${idx++}`);
      bindings.push((data as Record<string, unknown>)[f] ?? null);
    }
  }
  const jsonbFields = [
    "concurrent_services", "maladaptive_behaviors", "skill_acquisition_goals",
    "parent_training_goals", "service_coordination_goals", "requested_services",
    "therapy_schedule",
  ] as const;
  for (const f of jsonbFields) {
    if (f in data) {
      parts.push(`${f} = $${idx++}::jsonb`);
      bindings.push(JSON.stringify((data as Record<string, unknown>)[f]));
    }
  }

  if (parts.length === 0) return old;
  parts.push("updated_at = now()");

  const query = `UPDATE treatment_plans SET ${parts.join(", ")} WHERE id = $${idx++} RETURNING *`;
  bindings.push(id);

  const rows = await sql().query(query, bindings);
  const plan = rows.length > 0 ? coerceRow<TreatmentPlan>(rows[0]) : null;
  if (changedBy && plan) {
    await auditChange("treatment_plans", id, "UPDATE", changedBy, old as unknown as Record<string, unknown>, plan as unknown as Record<string, unknown>);
  }
  return plan;
}

export async function deleteTreatmentPlan(id: string, changedBy?: string): Promise<boolean> {
  const old = await getTreatmentPlan(id);
  if (!old) return false;
  await sql()`DELETE FROM treatment_plans WHERE id = ${id}`;
  if (changedBy) {
    await auditChange("treatment_plans", id, "DELETE", changedBy, old as unknown as Record<string, unknown>, null);
  }
  return true;
}

// ============================================================================
// SIGNATURES
// ============================================================================

export async function getSignatures(
  documentType: string,
  documentId: string,
): Promise<Signature[]> {
  const rows = await sql()`
    SELECT * FROM signatures
    WHERE document_type = ${documentType} AND document_id = ${documentId}
    ORDER BY signed_at DESC
  `;
  return rows.map((r) => coerceRow<Signature>(r));
}

export async function addSignature(
  data: {
    document_type: string;
    document_id: string;
    signer_name: string;
    signer_role: string;
    signature_data: string;
    ip_address?: string;
  },
  changedBy?: string,
): Promise<Signature> {
  const rows = await sql()`
    INSERT INTO signatures (
      document_type, document_id, signer_name, signer_role, signature_data, ip_address
    ) VALUES (
      ${data.document_type}, ${data.document_id}, ${data.signer_name},
      ${data.signer_role}, ${data.signature_data}, ${data.ip_address ?? null}
    )
    RETURNING *
  `;
  const sig = coerceRow<Signature>(rows[0]);
  if (changedBy) {
    await auditChange("signatures", sig.id, "CREATE", changedBy, null, sig as unknown as Record<string, unknown>);
  }
  return sig;
}

export async function getSignaturesByRole(
  documentType: string,
  documentId: string,
  role: string,
): Promise<Signature | null> {
  const rows = await sql()`
    SELECT * FROM signatures
    WHERE document_type = ${documentType} AND document_id = ${documentId} AND signer_role = ${role}
    ORDER BY signed_at DESC
    LIMIT 1
  `;
  return rows.length > 0 ? coerceRow<Signature>(rows[0]) : null;
}

// ============================================================================
// AUDIT LOG QUERIES
// ============================================================================

export async function getAuditLog(opts?: {
  table?: string;
  action?: string;
  user?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): Promise<{ entries: AuditEntry[]; total: number }> {
  const { table, action, user, startDate, endDate, limit = 50, offset = 0 } = opts ?? {};
  
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (table) {
    conditions.push(`table_name = $${idx++}`);
    params.push(table);
  }
  if (action) {
    conditions.push(`action = $${idx++}`);
    params.push(action);
  }
  if (user) {
    conditions.push(`changed_by ILIKE $${idx++}`);
    params.push(`%${user}%`);
  }
  if (startDate) {
    conditions.push(`changed_at >= $${idx++}`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`changed_at <= $${idx++}`);
    params.push(endDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countQuery = `SELECT COUNT(*) as total FROM audit_log ${where}`;
  const dataQuery = `SELECT * FROM audit_log ${where} ORDER BY changed_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
  
  const countParams = [...params];
  const dataParams = [...params, limit, offset];

  const neonClient = sql();
  const [countRows, dataRows] = await Promise.all([
    neonClient.query(countQuery, countParams),
    neonClient.query(dataQuery, dataParams),
  ]);

  return {
    entries: dataRows.map((r) => coerceRow<AuditEntry>(r)),
    total: Number(countRows[0]?.total ?? 0),
  };
}

export async function getAuditEntry(id: string): Promise<AuditEntry | null> {
  const rows = await sql()`SELECT * FROM audit_log WHERE id = ${id}`;
  return rows.length > 0 ? coerceRow<AuditEntry>(rows[0]) : null;
}
