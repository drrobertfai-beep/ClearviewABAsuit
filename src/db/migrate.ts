// ClearView ABA Suite — Schema migration runner
//
// Applies src/db/schema.sql to the connected Neon database. This is the one
// implementation used by the /api/migrate server function and by the CLI
// (`bun src/db/migrate.ts`), so there is a single migration code path.
//
// Neon's serverless driver doesn't support multiple commands in a single
// prepared statement, so the schema file is split into individual statements
// and executed sequentially. The schema is written to be re-runnable
// (CREATE ... IF NOT EXISTS / ALTER ... ADD COLUMN IF NOT EXISTS).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "./sql";
import { DEMO_EMAIL } from "./demo-account";

/**
 * Split a SQL text into individual statements, handling:
 * - Statement terminators (;) inside quoted strings
 * - Line comments (--) and block comments (/* ... *\/)
 * - Empty or comment-only "statements"
 */
function splitSQL(sqlText: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    const next = sqlText[i + 1] ?? "";

    // Handle comments (only outside quotes and block comments)
    if (!inSingleQuote && !inDoubleQuote && !inBlockComment) {
      if (ch === "-" && next === "-" && !inLineComment) {
        inLineComment = true;
        current += ch;
        continue;
      }
      if (inLineComment && ch === "\n") {
        inLineComment = false;
        current += ch;
        continue;
      }
      if (inLineComment) {
        current += ch;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        current += ch;
        continue;
      }
      if (inBlockComment && ch === "*" && next === "/") {
        inBlockComment = false;
        current += ch + next;
        i++;
        continue;
      }
    }

    if (inBlockComment) {
      current += ch;
      continue;
    }

    // Handle quotes
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    // Statement separator (semicolon outside quotes)
    if (ch === ";" && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        const lines = trimmed.split("\n");
        const isCommentOnly = lines.every(
          (line) => line.trim() === "" || line.trim().startsWith("--"),
        );
        if (!isCommentOnly) {
          statements.push(trimmed);
        }
      }
      current = "";
      continue;
    }

    current += ch;
  }

  // Trailing text without a semicolon
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    const lines = trimmed.split("\n");
    const isCommentOnly = lines.every(
      (line) => line.trim() === "" || line.trim().startsWith("--"),
    );
    if (!isCommentOnly) {
      statements.push(trimmed);
    }
  }

  return statements;
}

export interface MigrationResult {
  success: boolean;
  message: string;
  statements?: number;
  backfill?: BackfillReport;
}

/**
 * What the tenancy backfill did on this run. Every count is 0 on a second run —
 * that is how "re-running is a clean no-op" is proven.
 */
export interface BackfillReport {
  practicesCreated: number;
  membershipsCreated: number;
  clientsAssigned: number;
  auditRowsAssigned: number;
  practiceIdNotNull: boolean;
}

/**
 * Tenancy backfill — safe to run on the LIVE database, and re-runnable.
 *
 * 1. Every user with no membership gets a practice named "<name>'s Practice"
 *    and an `owner` membership for it.
 * 2. Every client that has no practice is assigned to the demo account's
 *    practice (all pre-existing client rows are demo data). Demo-flagged rows
 *    that somehow landed elsewhere are pulled back to it.
 * 3. Existing audit rows are stamped with the practice of the record they
 *    describe, so the audit trail is tenant-scoped too.
 * 4. `clients.practice_id` is tightened to NOT NULL — only after every row has
 *    a practice, so this can never fail halfway on a live database.
 *
 * Every step is guarded with WHERE NOT EXISTS / WHERE ... IS NULL, so a second
 * run inserts and updates nothing.
 */
export async function runTenancyBackfill(): Promise<BackfillReport> {
  const neon = sql();
  const report: BackfillReport = {
    practicesCreated: 0,
    membershipsCreated: 0,
    clientsAssigned: 0,
    auditRowsAssigned: 0,
    practiceIdNotNull: false,
  };

  // -- 1. A practice + owner membership for every user that has none ---------
  const usersWithoutPractice = await neon.query(
    `SELECT u.id, u.name, u.plan
       FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM practice_members pm WHERE pm.user_id = u.id
      )
      ORDER BY u.created_at ASC`,
  );

  for (const row of usersWithoutPractice as {
    id: string;
    name: string;
    plan: string | null;
  }[]) {
    // Re-check inside the insert so two concurrent migrations cannot both
    // create a practice for the same user.
    const created = await neon.query(
      `INSERT INTO practices (name, plan)
       SELECT $1, $2
        WHERE NOT EXISTS (
          SELECT 1 FROM practice_members pm WHERE pm.user_id = $3
        )
       RETURNING id`,
      [`${row.name}'s Practice`, row.plan ?? "trial", row.id],
    );
    if (created.length === 0) continue;
    report.practicesCreated += 1;

    const practiceId = String((created[0] as { id: string }).id);
    const membership = await neon.query(
      `INSERT INTO practice_members (practice_id, user_id, role, status)
       SELECT $1, $2, 'owner', 'active'
        WHERE NOT EXISTS (
          SELECT 1 FROM practice_members WHERE practice_id = $1 AND user_id = $2
        )
       RETURNING practice_id`,
      [practiceId, row.id],
    );
    if (membership.length > 0) report.membershipsCreated += 1;
  }

  // -- 2. Existing clients belong to the demo account's practice -------------
  const demoPractice = await neon.query(
    `SELECT pm.practice_id
       FROM practice_members pm
       JOIN users u ON u.id = pm.user_id
      WHERE lower(u.email) = lower($1) AND pm.status = 'active'
      ORDER BY pm.joined_at ASC
      LIMIT 1`,
    [DEMO_EMAIL],
  );

  let targetPracticeId: string | null = demoPractice.length
    ? String((demoPractice[0] as { practice_id: string }).practice_id)
    : null;

  // Fallbacks, in order: the oldest practice that exists, then a new practice
  // owned by the oldest user. This keeps the NOT NULL step below deployable on
  // any database shape without dropping a single client row.
  if (!targetPracticeId) {
    const oldest = await neon.query(
      `SELECT id FROM practices ORDER BY created_at ASC LIMIT 1`,
    );
    if (oldest.length > 0) {
      targetPracticeId = String((oldest[0] as { id: string }).id);
    } else {
      const anyUser = await neon.query(
        `SELECT id, name, plan FROM users ORDER BY created_at ASC LIMIT 1`,
      );
      const owner = anyUser[0] as
        | { id: string; name: string; plan: string | null }
        | undefined;
      const created = await neon.query(
        `INSERT INTO practices (name, plan) VALUES ($1, $2) RETURNING id`,
        [
          owner ? `${owner.name}'s Practice` : "ClearView Practice",
          owner?.plan ?? "trial",
        ],
      );
      targetPracticeId = String((created[0] as { id: string }).id);
      report.practicesCreated += 1;
      if (owner) {
        await neon.query(
          `INSERT INTO practice_members (practice_id, user_id, role, status)
           VALUES ($1, $2, 'owner', 'active')
           ON CONFLICT (practice_id, user_id) DO NOTHING`,
          [targetPracticeId, owner.id],
        );
        report.membershipsCreated += 1;
      }
    }
  }

  const assigned = await neon.query(
    `UPDATE clients
        SET practice_id = $1
      WHERE practice_id IS NULL
         OR (is_demo = TRUE AND practice_id <> $1)
      RETURNING id`,
    [targetPracticeId],
  );
  report.clientsAssigned = assigned.length;

  // -- 3. Stamp existing audit rows with their record's practice -------------
  const auditAssigned = await neon.query(
    `UPDATE audit_log a
        SET practice_id = COALESCE(
          (SELECT c.practice_id FROM clients c
            WHERE a.table_name = 'clients' AND c.id = a.record_id),
          (SELECT c.practice_id FROM assessments s
             JOIN clients c ON c.id = s.client_id
            WHERE a.table_name = 'assessments' AND s.id = a.record_id),
          (SELECT c.practice_id FROM treatment_plans t
             JOIN clients c ON c.id = t.client_id
            WHERE a.table_name = 'treatment_plans' AND t.id = a.record_id),
          (SELECT c.practice_id FROM signatures sg
             LEFT JOIN assessments s
                    ON sg.document_type = 'assessment' AND s.id = sg.document_id
             LEFT JOIN treatment_plans t
                    ON sg.document_type = 'treatment_plan' AND t.id = sg.document_id
             JOIN clients c ON c.id = COALESCE(s.client_id, t.client_id)
            WHERE a.table_name = 'signatures' AND sg.id = a.record_id)
        )
      WHERE a.practice_id IS NULL
      RETURNING a.id`,
  );
  report.auditRowsAssigned = auditAssigned.length;

  // Any audit row that still has no practice (e.g. a record that no longer
  // exists) is attributed to the demo practice so it stays visible to an owner
  // rather than becoming invisible to everyone.
  const leftoverAudit = await neon.query(
    `UPDATE audit_log SET practice_id = $1 WHERE practice_id IS NULL RETURNING id`,
    [targetPracticeId],
  );
  report.auditRowsAssigned += leftoverAudit.length;

  // -- 4. Tighten clients.practice_id to NOT NULL ---------------------------
  const orphans = await neon.query(
    `SELECT count(*)::int AS n FROM clients WHERE practice_id IS NULL`,
  );
  const orphanCount = Number((orphans[0] as { n: number }).n ?? 0);
  if (orphanCount > 0) {
    throw new Error(
      `Backfill left ${orphanCount} client(s) without a practice — refusing to set NOT NULL.`,
    );
  }
  await neon.query(
    `ALTER TABLE clients ALTER COLUMN practice_id SET NOT NULL`,
  );
  report.practiceIdNotNull = true;

  return report;
}

/** Apply src/db/schema.sql to the database. Safe to run repeatedly. */
export async function applySchema(): Promise<MigrationResult> {
  try {
    const schemaPath = join(process.cwd(), "src", "db", "schema.sql");
    const schema = await readFile(schemaPath, "utf-8");

    const statements = splitSQL(schema);
    const neonClient = sql();

    for (const stmt of statements) {
      // Use .query() — .unsafe() does not execute a plain string in this
      // driver version (it returns the fragment without running it), which made
      // this migration a silent no-op.
      await neonClient.query(stmt);
    }

    // Columns added to treatment_plans after the original schema shipped. They
    // are also in schema.sql; re-applying them here is belt-and-braces for a
    // database migrated by an older copy of this script. Both are idempotent,
    // so a second run is a no-op. `titration_phases` holds the phased step-down
    // table submitted with the authorization request.
    await neonClient.query(
      `ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS titration_rationale TEXT`,
    );
    await neonClient.query(
      `ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS titration_phases JSONB DEFAULT '[]'::jsonb`,
    );

    // Data backfill runs after the schema statements and before NOT NULL.
    const backfill = await runTenancyBackfill();

    return {
      success: true,
      message:
        `Schema migration completed successfully. (${statements.length} statements executed)` +
        ` — tenancy backfill: ${backfill.practicesCreated} practice(s) created, ` +
        `${backfill.membershipsCreated} membership(s) created, ` +
        `${backfill.clientsAssigned} client(s) assigned, ` +
        `${backfill.auditRowsAssigned} audit row(s) stamped` +
        (backfill.practiceIdNotNull ? ", clients.practice_id is NOT NULL." : "."),
      statements: statements.length,
      backfill,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Migration failed:", message);
    return {
      success: false,
      message: `Migration failed: ${message}`,
    };
  }
}

// Allow `bun src/db/migrate.ts` from the project root.
if (import.meta.main) {
  const result = await applySchema();
  console.log(result.message);
  if (!result.success) process.exit(1);
}
