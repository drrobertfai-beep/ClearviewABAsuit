// ClearView ABA Suite — Database helpers
// All data mutations happen server-side only (createServerFn or API routes).
// Never import these into client code.
//
// MULTI-TENANCY: every function in this file that touches a client or a
// client-owned row takes the caller's `practiceId` as its FIRST argument. The
// caller resolves it server-side from the session (src/server/auth-guard.ts);
// it is never read from a request body or URL. A record that belongs to another
// practice is indistinguishable from a record that does not exist: reads return
// null / an empty list, writes throw "not found".

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
  updateUserPlan,
} from "./db/auth";
export type { Session, SessionWithUser } from "./db/auth";

// Practice (tenant) helpers
export {
  getActiveMembership,
  listPracticesForUser,
  createPracticeForUser,
  ensurePracticeForUser,
  syncPracticePlan,
  createUserWithPractice,
  practiceNameForUser,
} from "./db/practices";

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
  DocumentType,
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

/** Fields a caller may set on a client. `practice_id` is stamped by the server. */
export type ClientInput = Omit<
  Client,
  "id" | "created_at" | "updated_at" | "practice_id"
>;

// ============================================================================
// Helper: coerce row dates to strings so React can render them
// ============================================================================
/**
 * DATE-only columns. The driver hands these back as JS Dates built at local
 * midnight, so `toISOString()` can slide them to the previous day in any
 * positive UTC offset. These are calendar dates with no time component — they
 * are serialized as `YYYY-MM-DD` using the local calendar fields instead.
 */
const DATE_ONLY_COLUMNS = new Set([
  "authorization_start_date",
  "authorization_end_date",
]);

function toDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function coerceRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = DATE_ONLY_COLUMNS.has(k) ? toDateOnly(v) : v.toISOString();
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

// ============================================================================
// Helper: does a document (assessment / treatment plan) live in this practice?
// ============================================================================
/**
 * Resolve the practice that owns a signed document. Returns null when the
 * document does not exist OR belongs to another practice — callers must not
 * distinguish the two.
 */
async function documentPracticeId(
  documentType: string,
  documentId: string,
): Promise<string | null> {
  if (documentType === "assessment") {
    const rows = await sql()`
      SELECT c.practice_id
      FROM assessments a JOIN clients c ON c.id = a.client_id
      WHERE a.id = ${documentId}
      LIMIT 1
    `;
    return rows.length > 0 ? (rows[0].practice_id as string | null) : null;
  }
  if (documentType === "treatment_plan") {
    const rows = await sql()`
      SELECT c.practice_id
      FROM treatment_plans t JOIN clients c ON c.id = t.client_id
      WHERE t.id = ${documentId}
      LIMIT 1
    `;
    return rows.length > 0 ? (rows[0].practice_id as string | null) : null;
  }
  return null;
}

/** True only when the document exists and belongs to `practiceId`. */
export async function documentInPractice(
  practiceId: string,
  documentType: string,
  documentId: string,
): Promise<boolean> {
  const owner = await documentPracticeId(documentType, documentId);
  return owner !== null && owner === practiceId;
}

// ============================================================================
// CLIENTS
// ============================================================================

export async function getClient(
  practiceId: string,
  id: string,
): Promise<Client | null> {
  const rows = await sql()`
    SELECT * FROM clients WHERE id = ${id} AND practice_id = ${practiceId}
  `;
  return rows.length > 0 ? coerceRow<Client>(rows[0]) : null;
}

export async function listClients(
  practiceId: string,
  opts?: {
    status?: ClientStatus;
    limit?: number;
    offset?: number;
  },
): Promise<Client[]> {
  const { status, limit = 50, offset = 0 } = opts ?? {};
  let rows;
  if (status) {
    rows = await sql()`
      SELECT * FROM clients
      WHERE practice_id = ${practiceId} AND status = ${status}
      ORDER BY name LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    rows = await sql()`
      SELECT * FROM clients
      WHERE practice_id = ${practiceId}
      ORDER BY name LIMIT ${limit} OFFSET ${offset}
    `;
  }
  return rows.map((r) => coerceRow<Client>(r));
}

export async function createClient(
  practiceId: string,
  data: ClientInput,
  changedBy?: string,
): Promise<Client> {
  const rows = await sql()`
    INSERT INTO clients (
      practice_id, name, date_of_birth, gender, contact_email, contact_phone,
      address, referral_source, diagnoses, setting, insurance_info,
      consent_flags, privacy_notes, status
    ) VALUES (
      ${practiceId}, ${data.name}, ${data.date_of_birth ?? null}, ${data.gender ?? null},
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
    await auditChange(
      practiceId,
      "clients",
      client.id,
      "CREATE",
      changedBy,
      null,
      client as unknown as Record<string, unknown>,
    );
  }
  return client;
}

export async function updateClient(
  practiceId: string,
  id: string,
  data: Partial<ClientInput>,
  changedBy?: string,
): Promise<Client | null> {
  const old = await getClient(practiceId, id);
  if (!old) return null;

  const client = await _updateClientInternal(practiceId, id, data);
  if (changedBy && client) {
    await auditChange(
      practiceId,
      "clients",
      id,
      "UPDATE",
      changedBy,
      old as unknown as Record<string, unknown>,
      client as unknown as Record<string, unknown>,
    );
  }
  return client;
}

async function _updateClientInternal(
  practiceId: string,
  id: string,
  data: Partial<ClientInput>,
): Promise<Client | null> {
  // Build SET clause from provided fields
  const parts: string[] = [];
  const bindings: unknown[] = [];
  let idx = 1;

  const scalarFields: (keyof ClientInput)[] = [
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

  // The practice constraint is part of the UPDATE, not just a prior read: a
  // concurrent re-assignment can never let this write escape the tenant.
  const query = `UPDATE clients SET ${parts.join(", ")}
    WHERE id = $${idx++} AND practice_id = $${idx++}
    RETURNING *`;
  bindings.push(id, practiceId);

  const neonClient = sql();
  const rows = await neonClient.query(query, bindings);
  return rows.length > 0 ? coerceRow<Client>(rows[0]) : null;
}

export async function deleteClient(
  practiceId: string,
  id: string,
  changedBy?: string,
): Promise<boolean> {
  const old = await getClient(practiceId, id);
  if (!old) return false;
  const rows = await sql()`
    DELETE FROM clients WHERE id = ${id} AND practice_id = ${practiceId} RETURNING id
  `;
  if (rows.length === 0) return false;
  if (changedBy) {
    await auditChange(
      practiceId,
      "clients",
      id,
      "DELETE",
      changedBy,
      old as unknown as Record<string, unknown>,
      null,
    );
  }
  return true;
}

// ============================================================================
// ASSESSMENTS
// ============================================================================

export async function getAssessment(
  practiceId: string,
  id: string,
): Promise<Assessment | null> {
  const rows = await sql()`
    SELECT a.* FROM assessments a
    JOIN clients c ON c.id = a.client_id
    WHERE a.id = ${id} AND c.practice_id = ${practiceId}
  `;
  return rows.length > 0 ? coerceRow<Assessment>(rows[0]) : null;
}

export async function listAssessments(
  practiceId: string,
  opts?: {
    clientId?: string;
    status?: AssessmentStatus;
    limit?: number;
    offset?: number;
  },
): Promise<Assessment[]> {
  const { clientId, status, limit = 50, offset = 0 } = opts ?? {};
  const conditions = ["c.practice_id = $1"];
  const params: unknown[] = [practiceId];
  let idx = 2;

  if (clientId) {
    conditions.push(`a.client_id = $${idx++}`);
    params.push(clientId);
  }
  if (status) {
    conditions.push(`a.status = $${idx++}`);
    params.push(status);
  }

  const query = `SELECT a.* FROM assessments a
    JOIN clients c ON c.id = a.client_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY a.assessment_date DESC
    LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  const rows = await sql().query(query, params);
  return rows.map((r) => coerceRow<Assessment>(r));
}

export async function createAssessment(
  practiceId: string,
  data: Omit<Assessment, "id" | "created_at" | "updated_at">,
  changedBy?: string,
): Promise<Assessment> {
  // A client_id from another practice must behave as "not found".
  const client = await getClient(practiceId, data.client_id);
  if (!client) throw new Error("Client not found.");

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
    await auditChange(
      practiceId,
      "assessments",
      assessment.id,
      "CREATE",
      changedBy,
      null,
      assessment as unknown as Record<string, unknown>,
    );
  }
  return assessment;
}

export async function updateAssessment(
  practiceId: string,
  id: string,
  data: Partial<Omit<Assessment, "id" | "created_at" | "updated_at">>,
  changedBy?: string,
): Promise<Assessment | null> {
  const old = await getAssessment(practiceId, id);
  if (!old) return null;

  // Re-parenting an assessment is only allowed inside the caller's practice.
  if (data.client_id && data.client_id !== old.client_id) {
    const target = await getClient(practiceId, data.client_id);
    if (!target) throw new Error("Client not found.");
  }

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

  const query = `UPDATE assessments SET ${parts.join(", ")}
    WHERE id = $${idx++} AND client_id IN (
      SELECT id FROM clients WHERE practice_id = $${idx++}
    )
    RETURNING *`;
  bindings.push(id, practiceId);

  const rows = await sql().query(query, bindings);
  const assessment = rows.length > 0 ? coerceRow<Assessment>(rows[0]) : null;
  if (changedBy && assessment) {
    await auditChange(
      practiceId,
      "assessments",
      id,
      "UPDATE",
      changedBy,
      old as unknown as Record<string, unknown>,
      assessment as unknown as Record<string, unknown>,
    );
  }
  return assessment;
}

export async function deleteAssessment(
  practiceId: string,
  id: string,
  changedBy?: string,
): Promise<boolean> {
  const old = await getAssessment(practiceId, id);
  if (!old) return false;
  const rows = await sql()`
    DELETE FROM assessments
    WHERE id = ${id} AND client_id IN (
      SELECT id FROM clients WHERE practice_id = ${practiceId}
    )
    RETURNING id
  `;
  if (rows.length === 0) return false;
  if (changedBy) {
    await auditChange(
      practiceId,
      "assessments",
      id,
      "DELETE",
      changedBy,
      old as unknown as Record<string, unknown>,
      null,
    );
  }
  return true;
}

// ============================================================================
// TREATMENT PLANS
// ============================================================================

export async function getTreatmentPlan(
  practiceId: string,
  id: string,
): Promise<TreatmentPlan | null> {
  const rows = await sql()`
    SELECT t.* FROM treatment_plans t
    JOIN clients c ON c.id = t.client_id
    WHERE t.id = ${id} AND c.practice_id = ${practiceId}
  `;
  return rows.length > 0 ? coerceRow<TreatmentPlan>(rows[0]) : null;
}

export async function listTreatmentPlans(
  practiceId: string,
  opts?: {
    clientId?: string;
    status?: TreatmentPlanStatus;
    limit?: number;
    offset?: number;
  },
): Promise<TreatmentPlan[]> {
  const { clientId, status, limit = 50, offset = 0 } = opts ?? {};
  const conditions = ["c.practice_id = $1"];
  const params: unknown[] = [practiceId];
  let idx = 2;

  if (clientId) {
    conditions.push(`t.client_id = $${idx++}`);
    params.push(clientId);
  }
  if (status) {
    conditions.push(`t.status = $${idx++}`);
    params.push(status);
  }

  const query = `SELECT t.* FROM treatment_plans t
    JOIN clients c ON c.id = t.client_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY t.created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}`;
  params.push(limit, offset);

  const rows = await sql().query(query, params);
  return rows.map((r) => coerceRow<TreatmentPlan>(r));
}

export async function createTreatmentPlan(
  practiceId: string,
  data: Omit<TreatmentPlan, "id" | "created_at" | "updated_at">,
  changedBy?: string,
): Promise<TreatmentPlan> {
  // A client_id from another practice must behave as "not found".
  const client = await getClient(practiceId, data.client_id);
  if (!client) throw new Error("Client not found.");

  // The linked assessment (if any) must belong to the same practice too.
  if (data.assessment_id) {
    const assessment = await getAssessment(practiceId, data.assessment_id);
    if (!assessment) throw new Error("Assessment not found.");
  }

  const rows = await sql()`
    INSERT INTO treatment_plans (
      client_id, assessment_id, reason_for_referral, diagnosis, treatment_history,
      concurrent_services, family_history, school_info, maladaptive_behaviors,
      behavior_intervention_plan, skill_acquisition_goals, assessment_outcomes,
      parent_training_goals, service_coordination_goals, discharge_criteria,
      requested_services, therapy_schedule, clinical_justification,
      authorization_start_date, authorization_end_date, authorization_number,
      titration_rationale, titration_phases,
      status
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
      ${JSON.stringify(data.therapy_schedule ?? [])}::jsonb,
      ${data.clinical_justification ?? null},
      ${data.authorization_start_date || null}::date,
      ${data.authorization_end_date || null}::date,
      ${data.authorization_number ?? null},
      ${data.titration_rationale ?? null},
      ${JSON.stringify(data.titration_phases ?? [])}::jsonb,
      ${data.status ?? "draft"}
    )
    RETURNING *
  `;
  const plan = coerceRow<TreatmentPlan>(rows[0]);
  if (changedBy) {
    await auditChange(
      practiceId,
      "treatment_plans",
      plan.id,
      "CREATE",
      changedBy,
      null,
      plan as unknown as Record<string, unknown>,
    );
  }
  return plan;
}

export async function updateTreatmentPlan(
  practiceId: string,
  id: string,
  data: Partial<Omit<TreatmentPlan, "id" | "created_at" | "updated_at">>,
  changedBy?: string,
): Promise<TreatmentPlan | null> {
  const old = await getTreatmentPlan(practiceId, id);
  if (!old) return null;

  if (data.client_id && data.client_id !== old.client_id) {
    const target = await getClient(practiceId, data.client_id);
    if (!target) throw new Error("Client not found.");
  }
  if (data.assessment_id && data.assessment_id !== old.assessment_id) {
    const assessment = await getAssessment(practiceId, data.assessment_id);
    if (!assessment) throw new Error("Assessment not found.");
  }

  const parts: string[] = [];
  const bindings: unknown[] = [];
  let idx = 1;

  const scalarFields: (keyof typeof data)[] = [
    "client_id", "assessment_id", "reason_for_referral", "diagnosis",
    "treatment_history", "family_history", "school_info",
    "behavior_intervention_plan", "assessment_outcomes", "discharge_criteria",
    "clinical_justification", "authorization_number", "titration_rationale",
    "status",
  ];
  for (const f of scalarFields) {
    if (f in data) {
      parts.push(`${f} = $${idx++}`);
      bindings.push((data as Record<string, unknown>)[f] ?? null);
    }
  }
  // DATE columns reject an empty string, so "" is written as NULL.
  const dateFields = [
    "authorization_start_date", "authorization_end_date",
  ] as const;
  for (const f of dateFields) {
    if (f in data) {
      parts.push(`${f} = $${idx++}::date`);
      bindings.push((data as Record<string, unknown>)[f] || null);
    }
  }
  const jsonbFields = [
    "concurrent_services", "maladaptive_behaviors", "skill_acquisition_goals",
    "parent_training_goals", "service_coordination_goals", "requested_services",
    "therapy_schedule", "titration_phases",
  ] as const;
  for (const f of jsonbFields) {
    if (f in data) {
      parts.push(`${f} = $${idx++}::jsonb`);
      bindings.push(JSON.stringify((data as Record<string, unknown>)[f]));
    }
  }

  if (parts.length === 0) return old;
  parts.push("updated_at = now()");

  const query = `UPDATE treatment_plans SET ${parts.join(", ")}
    WHERE id = $${idx++} AND client_id IN (
      SELECT id FROM clients WHERE practice_id = $${idx++}
    )
    RETURNING *`;
  bindings.push(id, practiceId);

  const rows = await sql().query(query, bindings);
  const plan = rows.length > 0 ? coerceRow<TreatmentPlan>(rows[0]) : null;
  if (changedBy && plan) {
    await auditChange(
      practiceId,
      "treatment_plans",
      id,
      "UPDATE",
      changedBy,
      old as unknown as Record<string, unknown>,
      plan as unknown as Record<string, unknown>,
    );
  }
  return plan;
}

export async function deleteTreatmentPlan(
  practiceId: string,
  id: string,
  changedBy?: string,
): Promise<boolean> {
  const old = await getTreatmentPlan(practiceId, id);
  if (!old) return false;
  const rows = await sql()`
    DELETE FROM treatment_plans
    WHERE id = ${id} AND client_id IN (
      SELECT id FROM clients WHERE practice_id = ${practiceId}
    )
    RETURNING id
  `;
  if (rows.length === 0) return false;
  if (changedBy) {
    await auditChange(
      practiceId,
      "treatment_plans",
      id,
      "DELETE",
      changedBy,
      old as unknown as Record<string, unknown>,
      null,
    );
  }
  return true;
}

// ============================================================================
// SIGNATURES
// ============================================================================
// Signatures have no client_id: they hang off a document (assessment or
// treatment plan). Every read and write first resolves the document's practice,
// so signatures are tenant-scoped without a denormalised column.

export async function getSignatures(
  practiceId: string,
  documentType: string,
  documentId: string,
): Promise<Signature[]> {
  if (!(await documentInPractice(practiceId, documentType, documentId))) {
    return [];
  }
  const rows = await sql()`
    SELECT * FROM signatures
    WHERE document_type = ${documentType} AND document_id = ${documentId}
    ORDER BY signed_at DESC
  `;
  return rows.map((r) => coerceRow<Signature>(r));
}

export async function addSignature(
  practiceId: string,
  data: {
    document_type: DocumentType | string;
    document_id: string;
    signer_name: string;
    signer_role: string;
    signature_data: string;
    ip_address?: string;
  },
  changedBy?: string,
): Promise<Signature> {
  // Signing a document from another practice behaves as "not found".
  if (!(await documentInPractice(practiceId, data.document_type, data.document_id))) {
    throw new Error("Document not found.");
  }

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
    await auditChange(
      practiceId,
      "signatures",
      sig.id,
      "CREATE",
      changedBy,
      null,
      sig as unknown as Record<string, unknown>,
    );
  }
  return sig;
}

export async function getSignaturesByRole(
  practiceId: string,
  documentType: string,
  documentId: string,
  role: string,
): Promise<Signature | null> {
  if (!(await documentInPractice(practiceId, documentType, documentId))) {
    return null;
  }
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

export async function getAuditLog(
  practiceId: string,
  opts?: {
    table?: string;
    action?: string;
    user?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  },
): Promise<{ entries: AuditEntry[]; total: number }> {
  const { table, action, user, startDate, endDate, limit = 50, offset = 0 } = opts ?? {};

  const conditions: string[] = ["practice_id = $1"];
  const params: unknown[] = [practiceId];
  let idx = 2;

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

  const where = `WHERE ${conditions.join(" AND ")}`;

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

export async function getAuditEntry(
  practiceId: string,
  id: string,
): Promise<AuditEntry | null> {
  const rows = await sql()`
    SELECT * FROM audit_log WHERE id = ${id} AND practice_id = ${practiceId}
  `;
  return rows.length > 0 ? coerceRow<AuditEntry>(rows[0]) : null;
}
