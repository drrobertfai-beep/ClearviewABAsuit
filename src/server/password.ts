// ClearView ABA Suite — Password hashing (runtime-agnostic)
//
// Uses only Node built-ins (`node:crypto` scrypt) so the exact same code runs
// under Node (Vercel's nodejs22.x function runtime) and Bun (local dev).
// Previously this used Bun's password API (argon2id), which is undefined on Node —
// that broke sign-in and registration in production.
//
// Stored format (self-describing, single TEXT column):
//
//   scrypt$<N>$<r>$<p>$<salt-b64>$<hash-b64>
//
// `N`, `r`, `p` are the scrypt cost parameters, salt is 16 random bytes and the
// derived key is 64 bytes. Encoding the parameters lets us raise the cost later
// without invalidating existing hashes.

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** scrypt cost parameters. ~16 MiB of memory, ~50-100 ms per hash. */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
// scrypt needs slightly more than 128 * N * r bytes; give it headroom.
const MAX_MEM = 128 * SCRYPT_N * SCRYPT_R * 2;

const PREFIX = "scrypt";

function deriveKey(
  password: string,
  salt: Buffer,
  N: number,
  r: number,
  p: number,
  keyLength: number,
): Promise<Buffer> {
  return scrypt(password.normalize("NFKC"), salt, keyLength, {
    N,
    r,
    p,
    maxmem: Math.max(MAX_MEM, 128 * N * r * 2),
  });
}

/**
 * Hash a password for storage. Returns `scrypt$N$r$p$salt$hash`.
 * Safe to call from server-only code; never import this into client code.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("hashPassword: password must be a non-empty string");
  }

  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, KEY_LENGTH);

  return [
    PREFIX,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/**
 * Constant-time check of a password against a stored hash.
 *
 * Returns `false` (never throws) for malformed or unsupported hashes — e.g. the
 * legacy Bun/argon2id hash strings, which cannot be verified here. Those
 * accounts must be migrated once with `src/db/rehash-demo.ts` (or a fresh
 * `hashPassword` write).
 */
export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (typeof password !== "string" || !password) return false;
  if (typeof storedHash !== "string" || !storedHash) return false;

  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);

  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    N < 2 ||
    N > 2 ** 20 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 16
  ) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = await deriveKey(password, salt, N, r, p, expected.length);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    // e.g. maxmem exceeded for an absurd stored cost — fail closed.
    return false;
  }
}

/** True when a stored hash was produced by the current scrypt scheme. */
export function isCurrentHashFormat(storedHash: string | null | undefined): boolean {
  return typeof storedHash === "string" && storedHash.startsWith(`${PREFIX}$`);
}
