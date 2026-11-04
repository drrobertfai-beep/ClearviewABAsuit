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

    return {
      success: true,
      message: `Schema migration completed successfully. (${statements.length} statements executed)`,
      statements: statements.length,
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
