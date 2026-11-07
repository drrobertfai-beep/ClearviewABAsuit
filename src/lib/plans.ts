// ClearView ABA Suite — Plan catalog (single source of truth)
//
// This module is shared by the billing page and the registration page. It is
// plain data only (no secrets, no server imports) so it is safe to import from
// client code.
//
// Payment architecture: this business uses a managed Stripe account, so there
// is no Stripe secret key in this environment and no server-side checkout
// session is created. Checkout happens on Stripe-hosted Payment Links — the
// URLs below are the live links for each Stripe price. Nothing here verifies
// payment; activation is done by the owner/team lead.

export type PlanId = "solo" | "practice" | "clinic";

/** The plan value stored on `users.plan`. */
export type PlanTier = "trial" | PlanId;

export interface Plan {
  /** Matches `users.plan` in the database. */
  id: PlanId;
  name: string;
  /** Display price, e.g. "$49". */
  price: string;
  /** Numeric price in whole dollars (useful for comparisons/sorting). */
  priceUsd: number;
  /** Billing period label rendered next to the price. */
  period: string;
  clientLimit: string;
  seats: string;
  features: readonly string[];
  /** Stripe-hosted Payment Link — checkout happens on Stripe's domain. */
  stripePaymentLink: string;
  /** Stripe Price ID backing the Payment Link (for reconciliation/reporting). */
  stripePriceId: string;
  popular?: boolean;
  /** Tailwind classes used by the billing page. */
  ui: {
    border: string;
    accent: string;
    text: string;
  };
  /** Tailwind classes used by the registration page plan picker. */
  picker: {
    idle: string;
    selected: string;
  };
}

export const PLANS: readonly Plan[] = [
  {
    id: "solo",
    name: "Solo",
    price: "$49",
    priceUsd: 49,
    period: "/mo",
    clientLimit: "Up to 10 clients",
    seats: "1 practitioner",
    features: [
      "Unlimited assessments",
      "Treatment plan generator",
      "PDF export",
      "Digital signatures",
      "Audit trail on every change",
      "Email support",
    ],
    stripePaymentLink: "https://buy.stripe.com/fZuaEX4kjaVW5K069f1sQ02",
    stripePriceId: "price_1UY5ayDsI5z3Kj8WZ4WzH7J9",
    ui: {
      border: "border-indigo-200",
      accent: "bg-indigo-600 hover:bg-indigo-500",
      text: "text-indigo-600",
    },
    picker: {
      idle: "border-indigo-200 hover:border-indigo-400",
      selected: "border-indigo-500 ring-2 ring-indigo-500",
    },
  },
  {
    id: "practice",
    name: "Practice",
    price: "$149",
    priceUsd: 149,
    period: "/mo",
    clientLimit: "Up to 30 clients",
    seats: "1 practitioner",
    features: [
      "Everything in Solo",
      "Priority email support",
      "Guided onboarding call",
      "Client data import help",
    ],
    stripePaymentLink: "https://buy.stripe.com/3cIbJ16sr2pqc8ogNT1sQ03",
    stripePriceId: "price_1UY5b8DsI5z3Kj8W8nGnyTbk",
    popular: true,
    ui: {
      border: "border-purple-300",
      accent: "bg-purple-600 hover:bg-purple-500",
      text: "text-purple-600",
    },
    picker: {
      idle: "border-purple-200 hover:border-purple-400",
      selected: "border-purple-500 ring-2 ring-purple-500",
    },
  },
  {
    id: "clinic",
    name: "Clinic",
    price: "$299",
    priceUsd: 299,
    period: "/mo",
    clientLimit: "Unlimited clients",
    seats: "1 practitioner",
    features: [
      "Everything in Practice",
      "Onboarding and setup help",
      "Client data import help",
      "Direct email line to the team",
    ],
    stripePaymentLink: "https://buy.stripe.com/8x25kD9ED4xy6O455b1sQ04",
    stripePriceId: "price_1UY5bHDsI5z3Kj8WxGvtCF2y",
    ui: {
      border: "border-emerald-200",
      accent: "bg-emerald-600 hover:bg-emerald-500",
      text: "text-emerald-600",
    },
    picker: {
      idle: "border-emerald-200 hover:border-emerald-400",
      selected: "border-emerald-500 ring-2 ring-emerald-500",
    },
  },
];

/** Human-readable label for any value of `users.plan`. */
export const PLAN_LABELS: Record<PlanTier, string> = {
  trial: "Free Trial",
  solo: "Solo",
  practice: "Practice",
  clinic: "Clinic",
};

export function isPlanId(value: unknown): value is PlanId {
  return PLANS.some((plan) => plan.id === value);
}

export function getPlan(id: string | null | undefined): Plan | null {
  if (!id) return null;
  return PLANS.find((plan) => plan.id === id) ?? null;
}

/** Label for a plan tier coming from the database (falls back to the raw value). */
export function planLabel(tier: string | null | undefined): string {
  if (!tier) return PLAN_LABELS.trial;
  return PLAN_LABELS[tier as PlanTier] ?? tier;
}

/**
 * The Stripe Payment Link for a plan. Returns null for unknown plans so callers
 * can render a disabled state instead of a broken link.
 */
export function checkoutUrl(id: string | null | undefined): string | null {
  return getPlan(id)?.stripePaymentLink ?? null;
}

/** Monthly price rank, used to decide "Upgrade" vs "Switch" wording. */
export function planRank(id: string | null | undefined): number {
  const plan = getPlan(id);
  return plan ? plan.priceUsd : 0;
}
