// Billing page — plan catalog, Stripe checkout entry points, current plan.
//
// Checkout is handled by Stripe-hosted Payment Links (see ~/lib/plans). Each
// plan button is a real anchor to the matching buy.stripe.com URL, so it works
// with or without JavaScript and for signed-out visitors comparing plans.
//
// This page is intentionally public: a visitor can browse plans without an
// account. The current-plan panel only appears for a signed-in user, and it
// reads `users.plan` from the database (never a hardcoded "trial").

import { createFileRoute, Link } from "@tanstack/react-router";
import { PLANS, getPlan, planLabel, planRank } from "~/lib/plans";

type CheckoutState = "success" | "cancel";

interface BillingSearch {
  checkout?: CheckoutState;
  plan?: string;
}

export const Route = createFileRoute("/billing")({
  validateSearch: (search: Record<string, unknown>): BillingSearch => {
    const checkout = search.checkout;
    return {
      checkout:
        checkout === "success" || checkout === "cancel" ? checkout : undefined,
      plan: typeof search.plan === "string" ? search.plan : undefined,
    };
  },
  component: BillingPage,
});

const PLAN_FEATURE_CHECK = (
  <svg
    className="h-4 w-4 flex-shrink-0 text-gray-300"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
  </svg>
);

function BillingPage() {
  const ctx = Route.useRouteContext();
  const search = Route.useSearch();
  const user = ctx.user as {
    plan?: string;
    trial_ends_at?: string | null;
    account_status?: string;
    email?: string;
    name?: string;
  } | null;

  const currentPlan = user?.plan ?? "trial";
  const currentPlanDef = getPlan(currentPlan);
  const trialEndsAt = user?.trial_ends_at ?? null;
  // The plan tier is the source of truth for "which plan is this account on".
  // `account_status` only tells us whether the owner has finished activating a
  // paid plan yet (activation is manual today).
  const onTrial = currentPlan === "trial";
  const activationPending = !onTrial && user?.account_status !== "active";

  const daysLeft = (() => {
    if (!trialEndsAt) return 0;
    const now = new Date();
    const end = new Date(trialEndsAt);
    return Math.max(
      0,
      Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );
  })();

  const trialExpired = onTrial && daysLeft === 0 && trialEndsAt !== null;
  const checkoutPlan = getPlan(search.plan);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Billing &amp; Plan
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Manage your subscription and billing details for ClearView ABA Suite.
        </p>
      </div>

      {/* Post-checkout notice (Stripe hosted confirmation has no redirect set up,
          so this banner is shown when the customer comes back to
          /billing?checkout=success&plan=<id>). It does not claim any verification
          we cannot perform.) */}
      {search.checkout === "success" && (
        <div
          role="status"
          className="mb-8 rounded-lg border border-green-200 bg-green-50 p-5"
        >
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            <div>
              <h2 className="text-sm font-semibold text-green-900">
                Thank you — your payment was received
                {checkoutPlan ? ` for the ${checkoutPlan.name} plan` : ""}.
              </h2>
              <p className="mt-1 text-sm text-green-800">
                Your account is being activated. Activation is completed by our
                team, and we will email you
                {user?.email ? (
                  <>
                    {" "}
                    at <span className="font-medium">{user.email}</span>
                  </>
                ) : (
                  " at the address you used at checkout"
                )}{" "}
                as soon as it is done — usually within one business day. Until
                then your plan below may still show as your previous plan, and
                you are not charged twice.
              </p>
              <p className="mt-2 text-xs text-green-700">
                Your Stripe receipt was emailed to you by Stripe at checkout.
                Keep it for your records — it is your proof of payment.
              </p>
            </div>
          </div>
        </div>
      )}

      {search.checkout === "cancel" && (
        <div
          role="status"
          className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-5"
        >
          <h2 className="text-sm font-semibold text-amber-900">
            Checkout was not completed
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            No payment was taken and your plan has not changed. You can pick a
            plan below whenever you are ready.
          </p>
        </div>
      )}

      {/* Current plan status — signed in only */}
      {user ? (
        <div className="mb-10 rounded-lg bg-white p-6 shadow ring-1 ring-black/5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Current Plan
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700">
                  {planLabel(currentPlan)}
                </span>
                {onTrial && !trialExpired && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                    {daysLeft} day{daysLeft === 1 ? "" : "s"} left in trial
                  </span>
                )}
                {trialExpired && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    Trial expired
                  </span>
                )}
                {activationPending && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                    Activation pending
                  </span>
                )}
                {!onTrial && !activationPending && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m4.5 12.75 6 6 9-13.5"
                      />
                    </svg>
                    Active
                  </span>
                )}
              </div>
              {onTrial && trialEndsAt && (
                <p className="mt-2 text-sm text-gray-500">
                  {trialExpired
                    ? "Your trial ended. Select a plan below to continue."
                    : `Your trial ends on ${new Date(trialEndsAt).toLocaleDateString(
                        "en-US",
                        { year: "numeric", month: "long", day: "numeric" },
                      )}.`}
                </p>
              )}
              {!onTrial && (
                <p className="mt-2 text-sm text-gray-500">
                  You're on the{" "}
                  <span className="font-medium text-gray-700">
                    {planLabel(currentPlan)}
                  </span>{" "}
                  plan
                  {currentPlanDef
                    ? ` (${currentPlanDef.price}${currentPlanDef.period}, ${currentPlanDef.clientLimit.toLowerCase()})`
                    : ""}
                  .{" "}
                  {activationPending
                    ? "This plan is awaiting activation by our team — we'll email you as soon as it's live."
                    : "Manage your plan below."}
                </p>
              )}
            </div>
            <div className="text-sm text-gray-500">
              Account:{" "}
              <span className="font-medium text-gray-700">{user.email ?? "—"}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-10 rounded-lg border border-indigo-200 bg-indigo-50 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-indigo-900">
              You're browsing plans as a guest. Sign in to see the plan on your
              account — you can start checkout below either way.
            </p>
            <Link
              to="/login"
              className="inline-flex flex-shrink-0 items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      )}

      {/* Plan options */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {onTrial ? "Choose a Plan" : "Change Plan"}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {onTrial
            ? "Select a plan to continue after your trial. Billing is handled securely by Stripe — you'll be taken to Stripe's checkout page."
            : "Upgrade or change your plan. Billing is handled securely by Stripe — you'll be taken to Stripe's checkout page."}
        </p>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = user !== null && currentPlan === plan.id && !onTrial;
            const isUpgrade = planRank(plan.id) > planRank(currentPlan);
            const ctaLabel = onTrial
              ? `Choose ${plan.name}`
              : isUpgrade
                ? `Upgrade to ${plan.name}`
                : `Switch to ${plan.name}`;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-lg border-2 bg-white p-6 ${plan.ui.border} ${
                  isCurrent ? "ring-2 ring-indigo-500" : ""
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-purple-600 px-3 py-0.5 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                )}

                <div className="mb-4">
                  <span className="text-lg font-bold text-gray-900">
                    {plan.name}
                  </span>
                </div>

                <div className="mb-4">
                  <span className="text-3xl font-bold text-gray-900">
                    {plan.price}
                  </span>
                  <span className="text-sm text-gray-500">{plan.period}</span>
                </div>

                <ul className="mb-6 flex-1 space-y-2">
                  <li className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <svg
                      className="h-4 w-4 flex-shrink-0 text-indigo-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m4.5 12.75 6 6 9-13.5"
                      />
                    </svg>
                    {plan.clientLimit}
                  </li>
                  <li className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <svg
                      className="h-4 w-4 flex-shrink-0 text-indigo-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m4.5 12.75 6 6 9-13.5"
                      />
                    </svg>
                    {plan.seats}
                  </li>
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-500">
                      {PLAN_FEATURE_CHECK}
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="mt-auto rounded-md bg-gray-100 px-4 py-2.5 text-center text-sm font-semibold text-gray-600">
                    Current Plan
                  </div>
                ) : (
                  <a
                    href={plan.stripePaymentLink}
                    className={`mt-auto rounded-md px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-indigo-500 ${plan.ui.accent}`}
                    aria-label={`${ctaLabel} — $${plan.priceUsd} per month, checkout on Stripe`}
                  >
                    {ctaLabel}
                  </a>
                )}
                <p className="mt-2 text-center text-xs text-gray-400">
                  Secure checkout on Stripe
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing information */}
      <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Payment History
        </h2>
        <div className="rounded-md bg-gray-50 p-8 text-center">
          <svg
            className="mx-auto h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          <p className="mt-3 text-sm font-medium text-gray-500">
            In-app payment history isn't available yet
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Payments are processed by Stripe, which emails a receipt for every
            charge. Contact us if you need a consolidated invoice or a copy of a
            past receipt.
          </p>
        </div>
      </div>

      {/* Help */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Questions about billing?{" "}
          <Link to="/" className="font-medium text-indigo-600 hover:text-indigo-500">
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
