// ClearView ABA Suite — Stripe billing state (webhook side) — server-only
//
// Everything that turns a Stripe event into a change on a practice lives here:
// recording the event id (so retries apply once), finding the practice, mapping
// a price to a plan, and auditing what changed.
//
// Rules this file exists to keep:
//   * The ONLY price → plan mapping is `stripePriceId` in src/lib/plans.ts. An
//     unknown price is logged and ignored — never guessed into a plan.
//   * Every applied change writes an audit row (table `practices`).
//   * Nothing here deletes data. Cancellation sets a read-only state.
//
// Nothing in this file may be imported into client code.

import { auditChange } from "./audit";
import { sql } from "./sql";
import type { PlanTier } from "./types";
import { PLANS } from "~/lib/plans";

/**
 * Whether the practice is paying.
 *   active    — current (also the state of an unpaid trial account)
 *   past_due  — payment failed; access continues, banner shown
 *   cancelled — subscription gone; READ-ONLY, all data preserved
 */
export type BillingStatus = "active" | "past_due" | "cancelled";

export const BILLING_STATUSES: readonly BillingStatus[] = [
  "active",
  "past_due",
  "cancelled",
];

/** Actor recorded on audit rows written by the webhook. */
export const STRIPE_ACTOR = "stripe:webhook";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Price id → plan tier, using `PLANS` as the single mapping source.
 * Returns null for a price we do not sell (caller logs and ignores).
 */
export function planForPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  const plan = PLANS.find((p) => p.stripePriceId === priceId);
  return plan ? (plan.id as PlanTier) : null;
}

// ---------------------------------------------------------------------------
// Event idempotency
// ---------------------------------------------------------------------------

/**
 * Claim an event id. Returns true when this delivery should be processed:
 *   - first delivery of the id → true
 *   - a redelivery of an event already marked 'applied' → false (no-op)
 *   - a redelivery of an event that is still 'processing' or 'failed' → true,
 *     so a crash or a transient error does not silently drop the event.
 *
 * The INSERT … ON CONFLICT makes the claim atomic: two simultaneous deliveries
 * of the same id cannot both see "first".
 */
export async function claimStripeEvent(
  eventId: string,
  type: string,
  payload: unknown,
): Promise<boolean> {
  const rows = await sql()`
    INSERT INTO stripe_events (id, type, payload, status)
    VALUES (${eventId}, ${type}, ${JSON.stringify(payload)}::jsonb, 'processing')
    ON CONFLICT (id) DO UPDATE SET status = stripe_events.status
    WHERE stripe_events.status <> 'applied'
    RETURNING id
  `;
  return rows.length > 0;
}

/** Record how an event ended. 'applied' makes future redeliveries a no-op. */
export async function finishStripeEvent(
  eventId: string,
  status: "applied" | "failed",
): Promise<void> {
  await sql()`UPDATE stripe_events SET status = ${status} WHERE id = ${eventId}`;
}

// ---------------------------------------------------------------------------
// Practice lookup
// ---------------------------------------------------------------------------

interface PracticeBillingRow {
  id: string;
  plan: PlanTier;
  billing_status: BillingStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

async function practiceBy(column: "id" | "customer" | "subscription", value: string) {
  if (column === "id") {
    if (!UUID_RE.test(value)) return null;
    const rows = await sql()`
      SELECT id, plan, billing_status, stripe_customer_id, stripe_subscription_id
      FROM practices WHERE id = ${value}::uuid
    `;
    return (rows[0] as PracticeBillingRow | undefined) ?? null;
  }
  if (column === "customer") {
    const rows = await sql()`
      SELECT id, plan, billing_status, stripe_customer_id, stripe_subscription_id
      FROM practices WHERE stripe_customer_id = ${value} LIMIT 1
    `;
    return (rows[0] as PracticeBillingRow | undefined) ?? null;
  }
  const rows = await sql()`
    SELECT id, plan, billing_status, stripe_customer_id, stripe_subscription_id
    FROM practices WHERE stripe_subscription_id = ${value} LIMIT 1
  `;
  return (rows[0] as PracticeBillingRow | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Applying a change
// ---------------------------------------------------------------------------

export interface PracticeBillingChange {
  plan?: PlanTier;
  billingStatus?: BillingStatus;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

/**
 * Write a billing change to a practice and audit it. A change that alters
 * nothing writes nothing (so a repeated event leaves no trace and no audit
 * noise). `reason` is stored in the audit row to say which Stripe event did it.
 */
export async function applyPracticeBillingChange(
  practiceId: string,
  change: PracticeBillingChange,
  reason: string,
): Promise<{ changed: boolean; before: PracticeBillingRow | null }> {
  const before = await practiceBy("id", practiceId);
  if (!before) return { changed: false, before: null };

  const next: PracticeBillingRow = {
    id: before.id,
    plan: change.plan ?? before.plan,
    billing_status: change.billingStatus ?? before.billing_status,
    stripe_customer_id: change.stripeCustomerId ?? before.stripe_customer_id,
    stripe_subscription_id:
      change.stripeSubscriptionId ?? before.stripe_subscription_id,
  };

  const unchanged =
    next.plan === before.plan &&
    next.billing_status === before.billing_status &&
    next.stripe_customer_id === before.stripe_customer_id &&
    next.stripe_subscription_id === before.stripe_subscription_id;
  if (unchanged) return { changed: false, before };

  await sql()`
    UPDATE practices
    SET plan = ${next.plan},
        billing_status = ${next.billing_status},
        stripe_customer_id = ${next.stripe_customer_id},
        stripe_subscription_id = ${next.stripe_subscription_id}
    WHERE id = ${practiceId}::uuid
  `;

  await auditChange(
    practiceId,
    "practices",
    practiceId,
    "UPDATE",
    STRIPE_ACTOR,
    {
      plan: before.plan,
      billing_status: before.billing_status,
      stripe_customer_id: before.stripe_customer_id,
      stripe_subscription_id: before.stripe_subscription_id,
      reason,
    },
    {
      plan: next.plan,
      billing_status: next.billing_status,
      stripe_customer_id: next.stripe_customer_id,
      stripe_subscription_id: next.stripe_subscription_id,
      reason,
    },
  );

  return { changed: true, before };
}

/** Look a practice up by its Stripe customer id (for events with no reference). */
export async function findPracticeByCustomer(customerId: string | null) {
  if (!customerId) return null;
  return practiceBy("customer", customerId);
}

/** Look a practice up by its Stripe subscription id. */
export async function findPracticeBySubscription(subscriptionId: string | null) {
  if (!subscriptionId) return null;
  return practiceBy("subscription", subscriptionId);
}

/** Look a practice up by primary key (the `client_reference_id` we sent). */
export async function findPracticeById(practiceId: string | null) {
  if (!practiceId) return null;
  return practiceBy("id", practiceId);
}

/** Current billing status of a practice; null when the practice is gone. */
export async function getBillingStatus(
  practiceId: string,
): Promise<BillingStatus | null> {
  if (!UUID_RE.test(practiceId)) return null;
  const rows = await sql()`
    SELECT billing_status FROM practices WHERE id = ${practiceId}::uuid
  `;
  if (rows.length === 0) return null;
  return String(rows[0].billing_status) as BillingStatus;
}
