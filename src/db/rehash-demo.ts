// ClearView ABA Suite — one-off credential migration for the demo practitioner.
//
// The demo account's `password_hash` was written by Bun's password API
// (argon2id) back when the app only ran under Bun; Vercel runs Node, so those
// hashes cannot be verified any more — sign-in fails with "Invalid email or
// password" even for the documented demo credentials.
//
// This script re-hashes the documented demo password with the current
// runtime-agnostic scrypt scheme (src/server/password.ts).
//
// It is IDEMPOTENT: if the stored hash already verifies against the demo
// password with the current scheme, nothing is written. Re-running is safe.
//
// Usage (from the site directory, so `.env` / DATABASE_URL is picked up):
//
//   bun src/db/rehash-demo.ts
//   bun src/db/rehash-demo.ts --email demo@clearviewaba.com --password demo123456
//
// Or with Node 22 (type stripping; the imports here are relative and use only
// node built-ins plus @neondatabase/serverless):
//
//   node --experimental-strip-types src/db/rehash-demo.ts

import { hashPassword, isCurrentHashFormat, verifyPassword } from "../server/password.ts";
import { sql } from "./sql.ts";

const DEFAULT_EMAIL = "demo@clearviewaba.com";
const DEFAULT_PASSWORD = "demo123456";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  const value = process.argv[idx + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

const email = (argValue("--email") ?? process.env.DEMO_EMAIL ?? DEFAULT_EMAIL)
  .toLowerCase()
  .trim();
const password = argValue("--password") ?? process.env.DEMO_PASSWORD ?? DEFAULT_PASSWORD;

async function main(): Promise<void> {
  const neon = sql();

  const rows = (await neon.query("SELECT id, email, password_hash FROM users WHERE lower(email) = lower($1)", [
    email,
  ])) as Array<{ id: string; email: string; password_hash: string }>;

  if (rows.length === 0) {
    console.log(`✗ No user found with email ${email} — nothing to migrate.`);
    console.log("  (Run the demo seed first: bun src/db/seed-demo.ts)");
    process.exitCode = 1;
    return;
  }

  const user = rows[0];
  const legacy = !isCurrentHashFormat(user.password_hash);
  const alreadyWorks = await verifyPassword(password, user.password_hash);

  if (alreadyWorks) {
    console.log(`✓ ${user.email} already verifies against the current scheme — no change.`);
    return;
  }

  const newHash = await hashPassword(password);
  await neon.query("UPDATE users SET password_hash = $1 WHERE id = $2", [newHash, user.id]);

  // Prove the round-trip against the value we just wrote.
  const verifyRows = (await neon.query("SELECT password_hash FROM users WHERE id = $1", [
    user.id,
  ])) as Array<{ password_hash: string }>;
  const ok = await verifyPassword(password, verifyRows[0]?.password_hash);

  console.log(
    `${ok ? "✓" : "✗"} ${user.email}: password_hash re-hashed with scrypt` +
      ` (was ${legacy ? "a legacy Bun/argon2id hash" : "an unverifiable hash"}).`,
  );
  console.log(`  New format: ${newHash.slice(0, 24)}… (${newHash.length} chars)`);
  console.log(`  Verify after write: ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("✗ rehash-demo failed:", err);
    process.exit(1);
  });
