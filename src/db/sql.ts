// ClearView ABA Suite — Raw Neon SQL helper (internal)
// Used by db.ts and audit.ts. Not for direct client use.
//
// Reads DATABASE_URL from process.env first, then falls back to a .env file
// in the project root. This ensures the server picks up the URL whether it's
// started via `bun run publish` (which injects env) or directly in the sandbox.

import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function resolveUrl(): string {
  // 1. Try process.env (set by publish wrapper, CI, or explicit export)
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // 2. Fall back to .env file (sandbox persistence across sessions)
  try {
    const envPath = join(process.cwd(), ".env");
    const envContent = readFileSync(envPath, "utf-8");
    const match = envContent.match(/^DATABASE_URL\s*=\s*(.+)$/m);
    if (match && match[1]) {
      const url = match[1].trim();
      // Strip surrounding quotes if present
      const clean = url.replace(/^["']|["']$/g, "");
      process.env.DATABASE_URL = clean; // cache for subsequent calls
      return clean;
    }
  } catch {
    // .env file doesn't exist or can't be read — fall through to error
  }

  throw new Error(
    "DATABASE_URL is not set — connect a database (via the database card) before running queries.",
  );
}

export const sql = () => {
  return neon(resolveUrl());
};
