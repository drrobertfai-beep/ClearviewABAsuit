// Billing page — plan management and payment
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/billing")({
  component: BillingPage,
});

const PLANS = [
  {
    id: "solo",
    name: "Solo",
    price: "$49",
    period: "/mo",
    clientLimit: "Up to 10 clients",
    seats: "1 practitioner seat",
    features: [
      "Unlimited assessments",
      "Treatment plan generator",
      "PDF export",
      "Digital signatures",
      "Email support",
    ],
    borderColor: "border-indigo-200",
    accentColor: "bg-indigo-600 hover:bg-indigo-500",
    textColor: "text-indigo-600",
  },
  {
    id: "practice",
    name: "Practice",
    price: "$149",
    period: "/mo",
    clientLimit: "Up to 30 clients",
    seats: "Up to 5 practitioner seats",
    features: [
      "Everything in Solo",
      "Multi-user collaboration",
      "Advanced reporting",
      "Priority support",
      "Team audit trail",
    ],
    borderColor: "border-purple-300",
    accentColor: "bg-purple-600 hover:bg-purple-500",
    textColor: "text-purple-600",
    popular: true,
  },
  {
    id: "clinic",
    name: "Clinic",
    price: "$299",
    period: "/mo",
    clientLimit: "Unlimited clients",
    seats: "Unlimited practitioner seats",
    features: [
      "Everything in Practice",
      "Custom branding",
      "API access",
      "Dedicated account manager",
      "SLA guarantee",
    ],
    borderColor: "border-emerald-200",
    accentColor: "bg-emerald-600 hover:bg-emerald-500",
    textColor: "text-emerald-600",
  },
] as const;

const PLAN_LABELS: Record<string, string> = {
  trial: "Free Trial",
  solo: "Solo",
  practice: "Practice",
  clinic: "Clinic",
};

function BillingPage() {
  const ctx = Route.useRouteContext();
  const user = ctx.user as {
    plan?: string;
    trial_ends_at?: string | null;
    account_status?: string;
    email?: string;
    name?: string;
  } | null;

  const currentPlan = user?.plan ?? "trial";
  const trialEndsAt = user?.trial_ends_at ?? null;
  const isTrial = currentPlan === "trial" || user?.account_status === "trial";

  const daysLeft = (() => {
    if (!trialEndsAt) return 0;
    const now = new Date();
    const end = new Date(trialEndsAt);
    return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  })();

  const trialExpired = isTrial && daysLeft === 0 && trialEndsAt !== null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Billing & Plan
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Manage your subscription and billing details for ClearView ABA Suite.
        </p>
      </div>

      {/* Current plan status */}
      <div className="mb-10 rounded-lg bg-white p-6 shadow ring-1 ring-black/5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Current Plan
        </h2>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-sm font-semibold text-indigo-700">
                {PLAN_LABELS[currentPlan] ?? currentPlan}
              </span>
              {isTrial && !trialExpired && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  {daysLeft} day{daysLeft === 1 ? "" : "s"} left in trial
                </span>
              )}
              {trialExpired && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                  Trial expired
                </span>
              )}
              {!isTrial && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Active
                </span>
              )}
            </div>
            {isTrial && trialEndsAt && (
              <p className="mt-2 text-sm text-gray-500">
                {trialExpired
                  ? "Your trial ended. Select a plan below to continue."
                  : `Your trial ends on ${new Date(trialEndsAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`}
              </p>
            )}
            {!isTrial && (
              <p className="mt-2 text-sm text-gray-500">
                You're on the{" "}
                <span className="font-medium text-gray-700">
                  {PLAN_LABELS[currentPlan] ?? currentPlan}
                </span>{" "}
                plan. Manage your plan below.
              </p>
            )}
          </div>
          <div className="text-sm text-gray-500">
            Account: <span className="font-medium text-gray-700">{user?.email ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Plan options */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          {isTrial ? "Choose a Plan" : "Change Plan"}
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {isTrial
            ? "Select a plan to continue after your trial. Payment collection is coming soon."
            : "Upgrade or downgrade your plan. Plan changes will be prorated."}
        </p>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id && !isTrial;
            const isTrialCurrent = isTrial && currentPlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-lg border-2 bg-white p-6 ${
                  plan.popular ? plan.borderColor : plan.borderColor
                } ${isCurrent ? "ring-2 ring-indigo-500" : ""}`}
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
                    <svg className="h-4 w-4 flex-shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    {plan.clientLimit}
                  </li>
                  <li className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <svg className="h-4 w-4 flex-shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                    {plan.seats}
                  </li>
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-500">
                      <svg className="h-4 w-4 flex-shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="mt-auto rounded-md bg-gray-100 px-4 py-2.5 text-center text-sm font-semibold text-gray-600">
                    Current Plan
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled
                    className={`mt-auto rounded-md px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm opacity-60 cursor-not-allowed ${plan.accentColor}`}
                  >
                    Subscribe — Coming Soon
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Billing information placeholder */}
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
            No payment history yet
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Payment processing will be available soon. You won't be charged
            during your trial.
          </p>
        </div>
      </div>

      {/* Help */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Questions about billing?{" "}
          <Link
            to="/"
            className="font-medium text-indigo-600 hover:text-indigo-500"
          >
            Contact support
          </Link>
        </p>
      </div>
    </div>
  );
}
