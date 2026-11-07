// ClearView ABA Suite — client CSV import (server side)
//
// The analysis and the write live together so the preview the user sees and the
// rows that get committed are produced by the same code path. Every query takes
// the caller's `practiceId` first — resolved from the session by
// src/server/auth-guard.ts, never from the request body.
//
// Privacy: the audit entry written here records the file name, counts and
// per-row *reasons* (row number + column + message). Client names, dates of
// birth and diagnoses are never written to the audit trail by this module, and
// nothing here logs to the console.

import { sql } from "./sql";
import {
  MAX_IMPORT_ROWS,
  clientDuplicateKey,
  duplicateKey,
  validateRow,
} from "~/lib/client-import";
import type {
  ClientImportData,
  ImportRowInput,
  RowError,
  ValidatedRow,
} from "~/lib/client-import";

export interface ImportRowProblem {
  rowNumber: number;
  errors: RowError[];
}

export interface ImportDuplicate {
  rowNumber: number;
  /** Name as it appears in the file — shown back to the practice that owns it. */
  name: string;
}

export interface ImportAnalysis {
  totalRows: number;
  /** Rows that passed validation. */
  validRows: number;
  /** Rows that failed validation and will not be imported. */
  invalid: ImportRowProblem[];
  /** Valid rows whose name+DOB already exists (in the practice or earlier in the file). */
  duplicates: ImportDuplicate[];
  /** Rows that would be written if the import runs with skipDuplicates on. */
  importable: number;
}

/**
 * Validate the mapped rows and flag duplicates against the caller's practice.
 * Read-only — safe to call for a preview.
 */
export async function analyzeClientImport(
  practiceId: string,
  rows: ImportRowInput[],
): Promise<{
  analysis: ImportAnalysis;
  validated: ValidatedRow[];
  /** Valid rows with their duplicate status resolved, in file order. */
  classified: (ValidatedRow & { duplicate: boolean })[];
}> {
  const validated = rows.map(validateRow);

  // Existing clients in THIS practice only. DOB is formatted in SQL so the
  // driver never hands back a Date that shifts across a timezone.
  const existing = await sql().query(
    `SELECT name, to_char(date_of_birth, 'YYYY-MM-DD') AS dob
       FROM clients
      WHERE practice_id = $1`,
    [practiceId],
  );
  const seen = new Set<string>(
    existing.map((row: Record<string, unknown>) =>
      clientDuplicateKey({
        name: String(row.name ?? ""),
        date_of_birth: (row.dob as string | null) ?? null,
      }),
    ),
  );

  const invalid: ImportRowProblem[] = [];
  const duplicates: ImportDuplicate[] = [];
  const classified: (ValidatedRow & { duplicate: boolean })[] = [];
  let validRows = 0;

  for (const row of validated) {
    if (!row.data) {
      invalid.push({ rowNumber: row.rowNumber, errors: row.errors });
      classified.push({ ...row, duplicate: false });
      continue;
    }
    validRows++;
    const key = duplicateKey(row.data.name, row.data.date_of_birth);
    const duplicate = seen.has(key);
    if (duplicate) {
      duplicates.push({ rowNumber: row.rowNumber, name: row.data.name });
    } else {
      // Only the first occurrence counts as new, so a file that lists the same
      // client twice skips the second one rather than creating it twice.
      seen.add(key);
    }
    classified.push({ ...row, duplicate });
  }

  return {
    analysis: {
      totalRows: rows.length,
      validRows,
      invalid,
      duplicates,
      importable: validRows - duplicates.length,
    },
    validated,
    classified,
  };
}

export interface ImportCommitResult {
  imported: number;
  skippedDuplicates: ImportDuplicate[];
  failed: ImportRowProblem[];
  totalRows: number;
  /** False when there was nothing to write (all rows failed or were skipped). */
  audited: boolean;
}

/** Columns written by a batch insert, in order. */
const INSERT_COLUMNS = [
  "practice_id",
  "name",
  "date_of_birth",
  "gender",
  "contact_email",
  "contact_phone",
  "address",
  "referral_source",
  "diagnoses",
  "setting",
  "insurance_info",
  "consent_flags",
  "privacy_notes",
  "status",
] as const;

/**
 * Insert every row plus one summary audit entry in a single SQL statement.
 *
 * A single statement is atomic in Postgres: either all the clients and the
 * audit entry land, or none of them do. That matters here because the audit
 * trail is the record that a bulk clinical-data import happened at all.
 */
async function insertClientBatch(
  practiceId: string,
  rows: ClientImportData[],
  meta: {
    changedBy: string | null;
    fileName: string;
    totalRows: number;
    skippedDuplicates: number;
    failed: ImportRowProblem[];
  },
): Promise<number> {
  if (rows.length === 0) return 0;

  const params: unknown[] = [];
  const valueClauses: string[] = [];

  for (const row of rows) {
    const offset = params.length;
    params.push(
      practiceId,
      row.name,
      row.date_of_birth,
      row.gender,
      row.contact_email,
      row.contact_phone,
      row.address,
      row.referral_source,
      JSON.stringify(row.diagnoses ?? []),
      row.setting,
      JSON.stringify(row.insurance_info ?? {}),
      JSON.stringify({}),
      row.privacy_notes,
      "active",
    );
    valueClauses.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}::date, $${offset + 4}, $${offset + 5}, ` +
        `$${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}::jsonb, $${offset + 10}, ` +
        `$${offset + 11}::jsonb, $${offset + 12}::jsonb, $${offset + 13}, $${offset + 14})`,
    );
  }

  // Audit summary: counts and per-row reasons only — no client identifiers.
  const summary = {
    source: "csv_import",
    file_name: meta.fileName.slice(0, 200),
    rows_in_file: meta.totalRows,
    rows_imported: rows.length,
    rows_skipped_duplicates: meta.skippedDuplicates,
    rows_failed: meta.failed.length,
    failures: meta.failed.slice(0, 200).map((failure) => ({
      row: failure.rowNumber,
      column: failure.errors.map((e) => e.field).join(", "),
      reason: failure.errors.map((e) => e.message).join(" ").slice(0, 300),
    })),
  };

  const batchId = crypto.randomUUID();
  const auditOffset = params.length;
  params.push(practiceId, batchId, meta.changedBy, JSON.stringify(summary));

  const statement = `
    WITH ins AS (
      INSERT INTO clients (${INSERT_COLUMNS.join(", ")})
      VALUES ${valueClauses.join(",\n")}
      RETURNING id
    ), aud AS (
      INSERT INTO audit_log (practice_id, table_name, record_id, action, changed_by, old_values, new_values)
      VALUES ($${auditOffset + 1}::uuid, 'clients', $${auditOffset + 2}::uuid, 'CREATE', $${auditOffset + 3}, NULL, $${auditOffset + 4}::jsonb)
      RETURNING id
    )
    SELECT (SELECT count(*)::int FROM ins) AS imported, (SELECT id FROM aud) AS audit_id
  `;

  const result = await sql().query(statement, params);
  return Number(result[0]?.imported ?? 0);
}

/**
 * Validate, de-duplicate and insert a batch of mapped CSV rows.
 *
 * `skipDuplicates` true (the default) leaves existing clients alone; false
 * imports them anyway, which is what a BCBA wants when two different children
 * genuinely share a name and a birthday.
 */
export async function commitClientImport(
  practiceId: string,
  rows: ImportRowInput[],
  options: {
    fileName: string;
    skipDuplicates: boolean;
    changedBy: string | null;
  },
): Promise<ImportCommitResult> {
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(
      `This import has more than ${MAX_IMPORT_ROWS} rows. Split the file and import it in parts.`,
    );
  }

  const { analysis, classified } = await analyzeClientImport(practiceId, rows);

  const toInsert: ClientImportData[] = [];
  const skippedDuplicates: ImportDuplicate[] = [];

  for (const row of classified) {
    if (!row.data) continue;
    if (row.duplicate && options.skipDuplicates) {
      skippedDuplicates.push({ rowNumber: row.rowNumber, name: row.data.name });
      continue;
    }
    toInsert.push(row.data);
  }

  const imported = await insertClientBatch(practiceId, toInsert, {
    changedBy: options.changedBy,
    fileName: options.fileName || "clients.csv",
    totalRows: analysis.totalRows,
    skippedDuplicates: skippedDuplicates.length,
    failed: analysis.invalid,
  });

  return {
    imported,
    skippedDuplicates,
    failed: analysis.invalid,
    totalRows: analysis.totalRows,
    audited: imported > 0,
  };
}
