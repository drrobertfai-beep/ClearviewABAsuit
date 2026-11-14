// ClearView ABA Suite — Stripe webhook handler
//
// POST /api/stripe/webhook (route: src/routes/api/stripe/webhook.ts)
//
// This is a plain request handler, not a server function: Stripe needs the RAW
// body to verify the signature, and it sends no session cookie and no CSRF
// token. The route is public by design — the signature is the authentication.
//
// Order of operations (each step fails closed):
//   1. No STRIPE_WEBHOOK_SECRET → 500, nothing read or written. The rest of the
//      app is untouched by a missing secret.
//   2. Bad/missing signature → 400, nothing written.
//   3. Body is not JSON / has no id+type → 400, nothing written.
//   4. Event id already applied → 200, no change applied a second time.
//   5. Otherwise apply the change, audit it, mark the event applied, 200.
//
// Every path that a well-formed event can take returns 2xx once we have decided
// what to do with it, so Stripe stops retrying. Only a real processing failure
// returns 500 (and leaves the event retryable).
//
// Server-only — never import this from client code.

import {
  applyPracticeBillingChange,
  claimStripeEvent,
  findPracticeByCustomer,
  findPracticeById,
  findPracticeBySubscription,
  finishStripeEvent,
  planForPriceId,
  type BillingStatus,
} from "~/db/billing";
import type { PlanTier } from "~/db/types";
import { verifyStripeSignature } from "./stripe-signature";

interface StripeEvent {
  id: string;
  type: string;
  data?: { object?: unknown };
}

type Json = Record<string, unknown>;

function json(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** `data.object.items.data[0].price.id` — the reliable place a price appears. */
function priceFromSubscription(object: Json): string | null {
  const items = asObject(object.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  for (const item of data) {
    const price = asString(asObject(asObject(item)?.price)?.id);
    if (price) return price;
  }
  // Legacy shape (pre-2020 subscription objects carried a single `plan`).
  return asString(asObject(object.plan)?.id);
}

/**
 * Best-effort price id from a Checkout Session.
 *
 * `line_items` is only present when the session was retrieved with it expanded;
 * Payment Links do not expand it by default. We therefore also accept a price
 * id carried in metadata (a Payment Link can be configured with
 * `metadata[price_id]`). When none is found we do NOT guess from the amount —
 * the accompanying `customer.subscription.updated` event carries the price and
 * applies the plan instead.
 */
function priceFromCheckoutSession(object: Json): string | null {
  const lineItems = asObject(object.line_items);
  const data = Array.isArray(lineItems?.data) ? lineItems.data : [];
  for (const item of data) {
    const price = asString(asObject(asObject(item)?.price)?.id);
    if (price) return price;
  }

  const candidates = [
    asObject(object.metadata),
    asObject(asObject(object.subscription_details)?.metadata),
  ];
  for (const metadata of candidates) {
    if (!metadata) continue;
    const price = asString(metadata.price_id) ?? asString(metadata.stripe_price_id);
    if (price) return price;
  }

  return null;
}

/** Resolve a price id to a plan, logging (and ignoring) one we do not sell. */
function resolvePlan(priceId: string | null, context: string): PlanTier | null {
  if (!priceId) return null;
  const plan = planForPriceId(priceId);
  if (!plan) {
    console.warn(
      `[stripe] ${context}: unknown price ${priceId} — ignored (not mapped to a plan)`,
    );
    return null;
  }
  return plan;
}

function billingStatusFromSubscriptionStatus(
  status: string | null,
): BillingStatus | null {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    default:
      return null;
  }
}

interface ApplyResult {
  applied: boolean;
  note: string;
}

/** checkout.session.completed — the buyer just paid; activate their practice. */
async function applyCheckoutCompleted(object: Json): Promise<ApplyResult> {
  const referenceId = asString(object.client_reference_id);
  const customerId = asString(object.customer);
  const subscriptionId = asString(object.subscription);

  if (!referenceId) {
    console.warn(
      "[stripe] checkout.session.completed: no client_reference_id — cannot tell which practice paid; ignored",
    );
    return { applied: false, note: "no client_reference_id" };
  }

  const practice = await findPracticeById(referenceId);
  if (!practice) {
    console.warn(
      `[stripe] checkout.session.completed: client_reference_id ${referenceId} matches no practice; ignored`,
    );
    return { applied: false, note: "unknown practice" };
  }

  const priceId = priceFromCheckoutSession(object);
  const plan = resolvePlan(priceId, "checkout.session.completed");

  if (!plan) {
    // Still record the Stripe ids so the follow-up subscription event can find
    // this practice, but never invent a plan.
    const stored = await applyPracticeBillingChange(
      practice.id,
      { stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId },
      "checkout.session.completed (no usable price)",
    );
    console.warn(
      `[stripe] checkout.session.completed: no usable price id (line_items not expanded) — plan left unchanged, waiting for customer.subscription.updated${stored.changed ? " (stripe ids stored)" : ""}`,
    );
    return {
      applied: stored.changed,
      note: priceId ? `unknown price ${priceId} ignored` : "no usable price id",
    };
  }

  const result = await applyPracticeBillingChange(
    practice.id,
    {
      plan,
      billingStatus: "active",
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    },
    `checkout.session.completed (price ${priceId ?? "n/a"})`,
  );

  console.log(
    `[stripe] checkout.session.completed: practice ${practice.id} → plan ${plan}, billing active${result.changed ? "" : " (already in that state)"}`,
  );
  return { applied: result.changed, note: `plan ${plan}` };
}

/** customer.subscription.updated — upgrade, downgrade, or status change. */
async function applySubscriptionUpdated(object: Json): Promise<ApplyResult> {
  const subscriptionId = asString(object.id);
  const customerId = asString(object.customer);
  const status = asString(object.status);

  const practice =
    (await findPracticeBySubscription(subscriptionId)) ??
    (await findPracticeByCustomer(customerId));

  if (!practice) {
    console.warn(
      `[stripe] customer.subscription.updated: no practice for customer ${customerId ?? "?"} / subscription ${subscriptionId ?? "?"}; ignored`,
    );
    return { applied: false, note: "unknown practice" };
  }

  const priceId = priceFromSubscription(object);
  const plan = resolvePlan(priceId, "customer.subscription.updated");
  let billingStatus = billingStatusFromSubscriptionStatus(status);

  // A cancelled subscription is read-only: drop the paid tier, keep every row.
  if (billingStatus === "cancelled") {
    const result = await applyPracticeBillingChange(
      practice.id,
      {
        plan: "trial",
        billingStatus: "cancelled",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      },
      `customer.subscription.updated (status ${status ?? "unknown"})`,
    );
    console.log(
      `[stripe] practice ${practice.id}: subscription ${subscriptionId} is cancelled → read-only`,
    );
    return { applied: result.changed, note: "cancelled → read-only" };
  }

  const result = await applyPracticeBillingChange(
    practice.id,
    {
      ...(plan ? { plan } : {}),
      ...(billingStatus ? { billingStatus } : {}),
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    },
    `customer.subscription.updated (status ${status ?? "unknown"}, price ${priceId ?? "n/a"})`,
  );

  console.log(
    `[stripe] customer.subscription.updated: practice ${practice.id} status=${status ?? "?"} plan=${plan ?? "(unchanged)"} billing=${billingStatus ?? "(unchanged)"}${result.changed ? "" : " (no change)"}`,
  );
  return { applied: result.changed, note: "subscription synced" };
}

/** customer.subscription.deleted — cancellation: read-only, data preserved. */
async function applySubscriptionDeleted(object: Json): Promise<ApplyResult> {
  const subscriptionId = asString(object.id);
  const customerId = asString(object.customer);

  const practice =
    (await findPracticeBySubscription(subscriptionId)) ??
    (await findPracticeByCustomer(customerId));

  if (!practice) {
    console.warn(
      `[stripe] customer.subscription.deleted: no practice for customer ${customerId ?? "?"} / subscription ${subscriptionId ?? "?"}; ignored`,
    );
    return { applied: false, note: "unknown practice" };
  }

  const result = await applyPracticeBillingChange(
    practice.id,
    {
      plan: "trial",
      billingStatus: "cancelled",
      stripeSubscriptionId: subscriptionId,
    },
    "customer.subscription.deleted",
  );

  console.log(
    `[stripe] customer.subscription.deleted: practice ${practice.id} is now read-only (all data kept)`,
  );
  return { applied: result.changed, note: "cancelled → read-only" };
}

/** invoice.payment_failed — flag past-due, keep access, show a banner. */
async function applyInvoicePaymentFailed(object: Json): Promise<ApplyResult> {
  const customerId = asString(object.customer);
  const practice = await findPracticeByCustomer(customerId);

  if (!practice) {
    console.warn(
      `[stripe] invoice.payment_failed: no practice for customer ${customerId ?? "?"}; ignored`,
    );
    return { applied: false, note: "unknown practice" };
  }

  const result = await applyPracticeBillingChange(
    practice.id,
    { billingStatus: "past_due" },
    "invoice.payment_failed",
  );

  console.log(
    `[stripe] invoice.payment_failed: practice ${practice.id} marked past_due${result.changed ? "" : " (already past_due)"}`,
  );
  return { applied: result.changed, note: "past_due" };
}

/** Route an event to the handler for its type. */
export async function applyStripeEvent(event: StripeEvent): Promise<ApplyResult> {
  const object = asObject(event.data?.object);
  if (!object) return { applied: false, note: "event has no data.object" };

  switch (event.type) {
    case "checkout.session.completed":
      return applyCheckoutCompleted(object);
    case "customer.subscription.updated":
      return applySubscriptionUpdated(object);
    case "customer.subscription.deleted":
      return applySubscriptionDeleted(object);
    case "invoice.payment_failed":
      return applyInvoicePaymentFailed(object);
    default:
      // Accepted and acknowledged so Stripe stops retrying; nothing to do.
      return { applied: false, note: `ignored event type ${event.type}` };
  }
}

/**
 * The whole webhook, as a Request → Response function so it can be driven from
 * the route handler and from tests without a running server.
 */
export async function handleStripeWebhook(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    // Fail closed. Nothing is read from the body and nothing is written; every
    // other part of the app keeps working without this variable.
    console.error(
      "[stripe] STRIPE_WEBHOOK_SECRET is not set — rejecting webhook (fail closed). Add the signing secret in Settings → Secrets.",
    );
    return json(500, { error: "webhook not configured" });
  }

  const rawBody = await request.text();
  const verdict = verifyStripeSignature(
    rawBody,
    request.headers.get("stripe-signature"),
    secret,
  );

  if (!verdict.ok) {
    console.warn(`[stripe] rejected webhook: ${verdict.reason}`);
    return json(400, { error: "invalid signature" });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    console.warn("[stripe] rejected webhook: body is not valid JSON");
    return json(400, { error: "invalid payload" });
  }

  const event = asObject(parsed);
  const eventId = asString(event?.id);
  const eventType = asString(event?.type);
  if (!event || !eventId || !eventType) {
    console.warn("[stripe] rejected webhook: payload has no id/type");
    return json(400, { error: "invalid payload" });
  }

  // Idempotency: claim the id before touching a practice.
  const shouldProcess = await claimStripeEvent(eventId, eventType, parsed);
  if (!shouldProcess) {
    console.log(`[stripe] ${eventType} ${eventId} already applied — no-op`);
    return json(200, { received: true, duplicate: true });
  }

  try {
    const result = await applyStripeEvent({ id: eventId, type: eventType, data: event.data as StripeEvent["data"] });
    await finishStripeEvent(eventId, "applied");
    return json(200, { received: true, applied: result.applied, note: result.note });
  } catch (error) {
    // Leave the event retryable and ask Stripe to deliver it again.
    console.error(`[stripe] failed to apply ${eventType} ${eventId}`, error);
    await finishStripeEvent(eventId, "failed");
    return json(500, { error: "processing failed" });
  }
}
