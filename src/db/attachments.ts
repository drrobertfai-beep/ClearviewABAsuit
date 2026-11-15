// ClearView ABA Suite — Plan-level attachments (assessment graphs)
//
// Bytes live in Postgres (plan_attachments.data BYTEA), never in an external
// file service and never behind a public URL. Every function takes the caller's
// `practiceId` first, so an attachment id from another practice reads as
// "not found" exactly like a nonexistent one.
//
// Bytes cross the driver boundary as base64 in both directions: the HTTP driver
// hands bytea back in a runtime-dependent shape, so we let Postgres do the
// encoding (encode/decode) and keep the TypeScript side plain strings.
//
// Uploads arrive in chunks — the production host caps a request body well below
// 10 MB — so a row is written before it is complete. `completed_at` is NULL
// until the last chunk lands, and every read filters on it: a half-uploaded file
// is never listed, served or exported.

import { sql } from "./sql";
import { auditChange } from "./audit";
import type { PlanAttachment, PlanAttachmentBytes } from "./types";

/** Hard caps from the template spec (section 7). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_PLAN = 20;

/** The only file types an assessment graph may arrive as. */
export const ALLOWED_ATTACHMENT_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "application/pdf": "pdf",
};

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

/** True when `mime` is one of the accepted types. */
export function isAllowedMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_ATTACHMENT_MIME, mime);
}

/**
 * The file's real type, read from its magic bytes — never from the declared
 * name or content type alone. Returns null when the bytes are not one of the
 * three accepted formats.
 */
export function sniffMime(head: Uint8Array): string | null {
  if (head.length >= 8) {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (png.every((b, i) => head[i] === b)) return "image/png";
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return "image/jpeg";
  }
  if (head.length >= 4) {
    const pdf = [0x25, 0x50, 0x44, 0x46]; // %PDF
    if (pdf.every((b, i) => head[i] === b)) return "application/pdf";
  }
  return null;
}

/** Attachment metadata for a plan, newest last. Completed uploads only. */
export async function listPlanAttachments(
  practiceId: string,
  planId: string,
): Promise<PlanAttachment[]> {
  const rows = await sql()`
    SELECT a.id, a.plan_id, a.filename, a.mime_type, a.byte_size, a.created_at,
           u.email AS uploaded_by_name
    FROM plan_attachments a
    LEFT JOIN users u ON u.id = a.uploaded_by
    WHERE a.practice_id = ${practiceId}
      AND a.plan_id = ${planId}
      AND a.completed_at IS NOT NULL
    ORDER BY a.created_at ASC
  `;
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    plan_id: String(r.plan_id),
    filename: String(r.filename),
    mime_type: String(r.mime_type),
    byte_size: Number(r.byte_size ?? 0),
    created_at: toIso(r.created_at),
    uploaded_by_name: r.uploaded_by_name ? String(r.uploaded_by_name) : null,
  }));
}

/** How many completed attachments the plan already holds. */
export async function countPlanAttachments(
  practiceId: string,
  planId: string,
): Promise<number> {
  const rows = await sql()`
    SELECT COUNT(*)::int AS n
    FROM plan_attachments
    WHERE practice_id = ${practiceId}
      AND plan_id = ${planId}
      AND completed_at IS NOT NULL
  `;
  return Number(rows[0]?.n ?? 0);
}

/**
 * Open an upload. Refuses when the plan is not this practice's, when the plan is
 * already at the 20-file cap, or when the declared size is over 10 MB.
 */
export async function startPlanAttachment(
  practiceId: string,
  planId: string,
  input: { filename: string; mimeType: string; byteSize: number },
  uploadedBy: string | null,
): Promise<{ id: string }> {
  if (!isAllowedMime(input.mimeType)) {
    throw new Error("Only PNG, JPG and PDF files can be attached.");
  }
  if (
    !Number.isFinite(input.byteSize) ||
    input.byteSize <= 0 ||
    input.byteSize > MAX_ATTACHMENT_BYTES
  ) {
    throw new Error("Each attachment must be 10 MB or smaller.");
  }

  const planRows = await sql()`
    SELECT p.id FROM treatment_plans p
    JOIN clients c ON c.id = p.client_id
    WHERE p.id = ${planId} AND c.practice_id = ${practiceId}
  `;
  if (planRows.length === 0) {
    throw new Error("Treatment plan not found");
  }

  const used = await countPlanAttachments(practiceId, planId);
  if (used >= MAX_ATTACHMENTS_PER_PLAN) {
    throw new Error(
      `A plan can hold at most ${MAX_ATTACHMENTS_PER_PLAN} attachments. Delete one to add another.`,
    );
  }

  const filename = (input.filename || "attachment").slice(0, 200);
  const rows = await sql()`
    INSERT INTO plan_attachments (practice_id, plan_id, filename, mime_type, byte_size, uploaded_by)
    VALUES (${practiceId}, ${planId}, ${filename}, ${input.mimeType}, ${input.byteSize}, ${uploadedBy})
    RETURNING id
  `;
  return { id: String(rows[0].id) };
}

/**
 * Append one chunk of bytes to an open upload. The 10 MB cap is enforced in the
 * UPDATE itself, so a client that lies about its size cannot push past it.
 */
export async function appendPlanAttachmentChunk(
  practiceId: string,
  attachmentId: string,
  chunkBase64: string,
): Promise<number> {
  const rows = await sql()`
    UPDATE plan_attachments
    SET data = data || decode(${chunkBase64}, 'base64')
    WHERE id = ${attachmentId}
      AND practice_id = ${practiceId}
      AND completed_at IS NULL
      AND octet_length(data) + octet_length(decode(${chunkBase64}, 'base64')) <= ${MAX_ATTACHMENT_BYTES}
    RETURNING octet_length(data) AS size
  `;
  if (rows.length === 0) {
    throw new Error(
      "That upload is not open, or it would exceed the 10 MB limit.",
    );
  }
  return Number(rows[0].size ?? 0);
}

/**
 * Close an upload: verify the real file type from the bytes, record the size and
 * write the audit entry. A file whose bytes do not match an accepted format is
 * deleted rather than left half-stored.
 */
export async function completePlanAttachment(
  practiceId: string,
  attachmentId: string,
  actorEmail: string | null,
): Promise<PlanAttachment> {
  const openRows = await sql()`
    SELECT id, plan_id, filename, mime_type, created_at,
           encode(substring(data from 1 for 8), 'hex') AS head_hex
    FROM plan_attachments
    WHERE id = ${attachmentId}
      AND practice_id = ${practiceId}
      AND completed_at IS NULL
  `;
  if (openRows.length === 0) {
    throw new Error("That upload is no longer open.");
  }
  const open = openRows[0];

  const headHex = String(open.head_hex ?? "");
  const head = new Uint8Array(
    (headHex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)),
  );
  const realMime = sniffMime(head);
  if (!realMime) {
    await sql()`
      DELETE FROM plan_attachments
      WHERE id = ${attachmentId} AND practice_id = ${practiceId}
    `;
    throw new Error("That file is not a PNG, JPG or PDF.");
  }

  const rows = await sql()`
    UPDATE plan_attachments
    SET completed_at = NOW(),
        byte_size = octet_length(data),
        mime_type = ${realMime}
    WHERE id = ${attachmentId}
      AND practice_id = ${practiceId}
      AND completed_at IS NULL
    RETURNING id, plan_id, filename, mime_type, byte_size, created_at
  `;
  const r = rows[0];
  const attachment: PlanAttachment = {
    id: String(r.id),
    plan_id: String(r.plan_id),
    filename: String(r.filename),
    mime_type: String(r.mime_type),
    byte_size: Number(r.byte_size ?? 0),
    created_at: toIso(r.created_at),
    uploaded_by_name: actorEmail,
  };

  await auditChange(
    practiceId,
    "plan_attachments",
    attachment.id,
    "CREATE",
    actorEmail,
    null,
    {
      plan_id: attachment.plan_id,
      filename: attachment.filename,
      mime_type: attachment.mime_type,
      byte_size: attachment.byte_size,
    },
  );

  return attachment;
}

/** One attachment's bytes, for the authenticated download route. */
export async function getPlanAttachmentBytes(
  practiceId: string,
  attachmentId: string,
): Promise<PlanAttachmentBytes | null> {
  const rows = await sql()`
    SELECT id, plan_id, filename, mime_type, byte_size, created_at,
           encode(data, 'base64') AS data_base64
    FROM plan_attachments
    WHERE id = ${attachmentId}
      AND practice_id = ${practiceId}
      AND completed_at IS NOT NULL
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    plan_id: String(r.plan_id),
    filename: String(r.filename),
    mime_type: String(r.mime_type),
    byte_size: Number(r.byte_size ?? 0),
    created_at: toIso(r.created_at),
    uploaded_by_name: null,
    data_base64: String(r.data_base64 ?? ""),
  };
}

/** Record a download. Called by the serve route on every successful read. */
export async function auditAttachmentDownload(
  practiceId: string,
  attachment: { id: string; plan_id: string; filename: string },
  actorEmail: string | null,
): Promise<void> {
  await auditChange(
    practiceId,
    "plan_attachments",
    attachment.id,
    "READ",
    actorEmail,
    null,
    { plan_id: attachment.plan_id, filename: attachment.filename, event: "download" },
  );
}

/** Every completed attachment for a plan, bytes included — used by the PDF export. */
export async function listPlanAttachmentBytes(
  practiceId: string,
  planId: string,
): Promise<PlanAttachmentBytes[]> {
  const rows = await sql()`
    SELECT id, plan_id, filename, mime_type, byte_size, created_at,
           encode(data, 'base64') AS data_base64
    FROM plan_attachments
    WHERE practice_id = ${practiceId}
      AND plan_id = ${planId}
      AND completed_at IS NOT NULL
    ORDER BY created_at ASC
  `;
  return rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    plan_id: String(r.plan_id),
    filename: String(r.filename),
    mime_type: String(r.mime_type),
    byte_size: Number(r.byte_size ?? 0),
    created_at: toIso(r.created_at),
    uploaded_by_name: null,
    data_base64: String(r.data_base64 ?? ""),
  }));
}

/** Remove an attachment. False when it is not this practice's. */
export async function deletePlanAttachment(
  practiceId: string,
  attachmentId: string,
  actorEmail: string | null,
): Promise<boolean> {
  const rows = await sql()`
    DELETE FROM plan_attachments
    WHERE id = ${attachmentId} AND practice_id = ${practiceId}
    RETURNING id, plan_id, filename
  `;
  if (rows.length === 0) return false;
  await auditChange(
    practiceId,
    "plan_attachments",
    String(rows[0].id),
    "DELETE",
    actorEmail,
    { plan_id: String(rows[0].plan_id), filename: String(rows[0].filename) },
    null,
  );
  return true;
}
