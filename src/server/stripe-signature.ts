// ClearView ABA Suite — Stripe webhook signature verification
//
// Verifies the `Stripe-Signature` header exactly the way Stripe's own
// `constructEvent` does: HMAC-SHA256 over "<timestamp>.<raw body>" keyed with
// the endpoint's signing secret, compared in constant time.
//
// Implemented with node:crypto instead of the `stripe` npm package: production
// runs on Vercel as Node (see build-vercel.sh), and pulling in the whole SDK for
// one HMAC would be the only reason the dependency existed.
//
// Server-only — never import this from client code.

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * How far the signed timestamp may drift from our clock. Stripe's default is
 * five minutes; a request outside it is treated as a replay and rejected.
 */
const TOLERANCE_SECONDS = 300;

export type SignatureVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Verify a webhook request body against its signature header.
 *
 * @param rawBody  the request body EXACTLY as received (no re-serialisation)
 * @param header   the `stripe-signature` header value
 * @param secret   the endpoint signing secret (`whsec_…`)
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
): SignatureVerdict {
  if (!secret) return { ok: false, reason: "no signing secret configured" };
  if (!header) return { ok: false, reason: "missing stripe-signature header" };

  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (!value) continue;
    if (key === "t") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (timestamp === null) return { ok: false, reason: "no timestamp in signature header" };
  if (signatures.length === 0) return { ok: false, reason: "no v1 signature in header" };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp outside the allowed tolerance" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBytes = Buffer.from(expected, "utf8");

  for (const candidate of signatures) {
    const candidateBytes = Buffer.from(candidate, "utf8");
    if (
      candidateBytes.length === expectedBytes.length &&
      timingSafeEqual(candidateBytes, expectedBytes)
    ) {
      return { ok: true };
    }
  }

  return { ok: false, reason: "signature mismatch" };
}
