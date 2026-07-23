// Dashboard — landing page at /
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function daysUntil(dateStr: string | null): number {
  if (!dateStr) return 0;
  const now = new Date();
  const end = new Date(dateStr);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
}

function TrialBanner({ trialEndsAt, plan }: { trialEndsAt: string | null; plan: string }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const daysLeft = daysUntil(trialEndsAt);
  const isExpired = daysLeft === 0 && trialEndsAt !== null;

  if (plan !== "trial" && !isExpired) return null;

  return (
    <div className={`rounded-lg p-4 mb-8 border ${isExpired ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {isExpired ? (
            <svg className="h-6 w-6 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          ) : (
            <svg className="h-6 w-6 flex-shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          )}
          <div>
            <p className={`text-sm font-semibold ${isExpired ? "text-red-800" : "text-amber-800"}`}>
              {isExpired
                ? "Your free trial has expired"
                : `You have ${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your free trial`}
            </p>
            <p className={`text-sm ${isExpired ? "text-red-700" : "text-amber-700"}`}>
              {isExpired
                ? "Please select a plan to continue using ClearView ABA Suite."
                : "Choose a plan to keep your account active after the trial ends."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to="/billing"
            className={`rounded-md px-3 py-1.5 text-sm font-semibold shadow-sm transition-colors ${
              isExpired
                ? "bg-red-600 text-white hover:bg-red-500"
                : "bg-amber-600 text-white hover:bg-amber-500"
            }`}
          >
            {isExpired ? "Select Plan" : "Choose Plan"}
          </Link>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-md p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const ctx = Route.useRouteContext();
  const user = ctx.user as { plan?: string; trial_ends_at?: string | null; account_status?: string } | null;

  const quickLinks = [
    {
      to: "/clients",
      title: "Clients",
      description: "View, search, and manage client profiles",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
      ),
      color: "bg-indigo-50 text-indigo-700",
    },
    {
      to: "/clients/new",
      title: "New Client",
      description: "Add a new client profile to the system",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      ),
      color: "bg-green-50 text-green-700",
    },
    {
      to: "/assessments",
      title: "Assessments",
      description: "Create and manage VB-MAPP, ABLLS-R, and other assessments with auto-scoring",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
        </svg>
      ),
      color: "bg-yellow-50 text-yellow-700",
      disabled: false,
    },
    {
      to: "/treatment-plans",
      title: "Treatment Plans",
      description: "Create and manage comprehensive ABA treatment plans with auto-populated assessment data",
      icon: (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
      ),
      color: "bg-purple-50 text-purple-700",
      disabled: false,
    },
  ];

  const stats = [
    { label: "Active Clients", value: "—", color: "text-green-600" },
    { label: "Assessments", value: "—", color: "text-indigo-600" },
    { label: "Treatment Plans", value: "—", color: "text-purple-600" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Trial Banner */}
      {user && (user.plan === "trial" || user.account_status === "trial") && (
        <TrialBanner trialEndsAt={user.trial_ends_at ?? null} plan={user.plan ?? "trial"} />
      )}

      {/* Hero */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          ClearView ABA Suite
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-gray-500">
          Streamline your ABA assessment-to-treatment-plan workflow. Client
          profiles, structured assessments, auto-generated treatment plans, and
          HIPAA-compliant documentation — all in one place.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg bg-white p-5 shadow ring-1 ring-black/5"
          >
            <dt className="text-sm font-medium text-gray-500">{stat.label}</dt>
            <dd className={`mt-1 text-2xl font-bold ${stat.color}`}>
              {stat.value}
            </dd>
          </div>
        ))}
      </div>

      {/* Quick links */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Quick Actions
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((link) => {
          const content = (
            <div
              className={`group relative rounded-lg border p-5 transition-shadow hover:shadow-md ${
                link.disabled
                  ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-60"
                  : "cursor-pointer border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div
                className={`mb-3 inline-flex rounded-lg p-2.5 ${link.color}`}
              >
                {link.icon}
              </div>
              <h3 className="text-sm font-semibold text-gray-900">
                {link.title}
                {link.disabled && (
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                    Soon
                  </span>
                )}
              </h3>
              <p className="mt-1 text-xs text-gray-500">{link.description}</p>
            </div>
          );

          if (link.disabled) {
            return <div key={link.title}>{content}</div>;
          }

          return (
            <Link key={link.title} to={link.to} className="block">
              {content}
            </Link>
          );
        })}
      </div>

      {/* Workflow overview */}
      <div className="mt-12 rounded-lg bg-white p-6 shadow ring-1 ring-black/5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Workflow Overview
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <WorkflowStep
            number={1}
            title="Create Client Profile"
            description="Add client demographics, diagnoses, insurance, and consent information."
            active
          />
          <WorkflowStep
            number={2}
            title="Complete Assessment"
            description="Enter VB-MAPP, ABLLS-R, or other assessment scores with auto-scoring."
          />
          <WorkflowStep
            number={3}
            title="Generate Treatment Plan"
            description="Auto-populate treatment plans from assessment data, add signatures, and export PDFs."
          />
        </div>
      </div>
    </div>
  );
}

function WorkflowStep({
  number,
  title,
  description,
  active,
}: {
  number: number;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
          active
            ? "bg-indigo-600 text-white"
            : "bg-gray-100 text-gray-400"
        }`}
        aria-hidden="true"
      >
        {number}
      </div>
      <div>
        <h3
          className={`text-sm font-semibold ${
            active ? "text-gray-900" : "text-gray-500"
          }`}
        >
          {title}
        </h3>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>
    </div>
  );
}
