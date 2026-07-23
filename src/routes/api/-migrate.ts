// POST /api/migrate — run schema.sql against the database
// This is a protected administrative endpoint; in production, guard with auth.
//
// Neon's serverless driver doesn't support multiple commands in a single
// prepared statement, so we split the schema file into individual statements
// and execute them sequentially.

import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

export const migrate = createServerFn({ method: "POST" }).handler(async () => {
  try {
    const schemaPath = join(process.cwd(), "src", "db", "schema.sql");
    const schema = await readFile(schemaPath, "utf-8");

    const statements = splitSQL(schema);
    const neonClient = sql();

    for (const stmt of statements) {
      await neonClient.unsafe(stmt);
    }

    return {
      success: true,
      message: `Schema migration completed successfully. (${statements.length} statements executed)`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Migration failed:", message);
    return {
      success: false,
      message: `Migration failed: ${message}`,
    };
  }
});
