// Marketing landing page — rendered at / for a signed-out visitor.
//
// Honesty rules baked into this file:
//   - no testimonials, customer counts, logos or ratings (we have zero customers)
//   - no certification claims: "HIPAA-conscious safeguards", never "HIPAA certified"
//   - no demo credentials anywhere on the page
//   - no countdowns, scarcity or manufactured urgency
//   - prices are read from ~/lib/plans (the single source of truth), never copied
import { Link } from "@tanstack/react-router";

import {
  PLANS,
  clientLimitLabel,
  planLimits,
  seatsLabel,
} from "~/lib/plans";

const SCREENSHOT_CLIENTS = "/screenshots/clients-list.png";
const SCREENSHOT_SIGNATURES = "/screenshots/treatment-plan-signatures.png";

/** Primary CTA. The register page states the same 14-day trial. */
const TRIAL_NOTE = "14-day free trial · no credit card required";

function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5"
      />
    </svg>
  );
}

/** Real screenshot in a browser-chrome frame, so it reads as software. */
function BrowserFrame({
  src,
  alt,
  width,
  height,
  path,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  path: string;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-900/10">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-100 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          {["#f87171", "#fbbf24", "#34d399"].map((color) => (
            <span
              key={color}
              style={{
                display: "block",
                height: 10,
                width: 10,
                borderRadius: 9999,
                backgroundColor: color,
              }}
            />
          ))}
        </span>
        <span className="ml-2 flex-1 truncate rounded-md bg-white px-3 py-1 text-xs text-gray-500 ring-1 ring-gray-200">
          getclearviewaba.com{path}
        </span>
      </div>
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="block w-full"
      />
    </figure>
  );
}

const CAPABILITIES = [
  {
    title: "VB-MAPP assessment entry with auto-scoring",
    body: "Enter milestones, barriers and transition scores in a structured form. Totals, percentages and score bands recalculate as you go, so the assessment is scored the moment you finish typing — no spreadsheet to rebuild afterwards.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z"
      />
    ),
  },
  {
    title: "Treatment plans generated from assessment data",
    body: "Start a plan from a completed assessment and ClearView pulls in the client profile, scores and target lists. Write the goals once and the document keeps its structure from draft through review to the funding source.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    ),
  },
  {
    title: "Digital signatures, audit trail and PDF export",
    body: "Collect BCBA and parent/guardian signatures in the app, each stamped with a timestamp and captured IP. Every change lands in the audit log, and the finished plan exports to PDF ready to attach to an authorization request.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 0 0 2.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 0 1 2.916.52 6.003 6.003 0 0 1-5.395 4.972m0 0a6.726 6.726 0 0 1-2.749 1.35m0 0a6.772 6.772 0 0 1-3.044 0"
      />
    ),
  },
] as const;

export function LandingPage() {
  return (
    <div className="overflow-x-hidden bg-white">
      {/* ---------------------------------------------------------------- nav */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md text-base font-bold text-indigo-600 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 sm:text-lg"
          >
            <Logo className="h-6 w-6 sm:h-7 sm:w-7" />
            <span className="whitespace-nowrap">ClearView ABA Suite</span>
          </Link>
          <nav
            aria-label="Main navigation"
            className="flex items-center gap-1 sm:gap-3"
          >
            <a
              href="#pricing"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:inline-flex"
            >
              Pricing
            </a>
            <Link
              to="/login"
              className="hidden rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              to="/register"
              className="whitespace-nowrap rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 sm:px-4"
            >
              Start free trial
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* -------------------------------------------------------------- hero */}
        <section
          aria-labelledby="hero-heading"
          className="border-b border-gray-100 bg-gradient-to-b from-indigo-50/70 to-white"
        >
          <div className="mx-auto max-w-6xl px-4 pb-10 pt-12 sm:px-6 sm:pt-16 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">
                For BCBAs, BCaBAs and ABA practices
              </p>
              <h1
                id="hero-heading"
                className="mt-3 break-words text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl sm:leading-tight"
              >
                Cut the assessment-to-treatment-plan admin
              </h1>
              <p className="mt-5 text-base text-gray-600 sm:text-lg">
                ClearView ABA Suite turns a finished VB-MAPP into a scored,
                signed, PDF-ready treatment plan — client profiles, assessment
                entry, auto-scoring, digital signatures and an audit trail in one
                place, so your documentation time goes back to clinical care.
              </p>

              <div className="mt-8 flex flex-col items-center gap-4">
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-8 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                >
                  Start free trial
                </Link>
                <div className="flex items-center gap-6">
                  <a
                    href="#pricing"
                    className="rounded-md text-sm font-semibold text-indigo-600 underline-offset-4 hover:text-indigo-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  >
                    See pricing
                  </a>
                  <Link
                    to="/login"
                    className="rounded-md text-sm font-semibold text-indigo-600 underline-offset-4 hover:text-indigo-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                  >
                    Sign in
                  </Link>
                </div>
              </div>
              <p className="mt-3 text-xs text-gray-500">{TRIAL_NOTE}</p>
            </div>

            <div className="mt-12">
              <BrowserFrame
                src={SCREENSHOT_CLIENTS}
                alt="The ClearView ABA Suite clients list showing six fictional demo clients with date of birth, guardian contact, referral source and active/inactive status."
                width={1440}
                height={640}
                path="/clients"
              />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ capabilities */}
        <section
          aria-labelledby="capabilities-heading"
          className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8"
        >
          <h2
            id="capabilities-heading"
            className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl"
          >
            One workflow, from intake to signed plan
          </h2>
          <p className="mt-3 max-w-2xl text-base text-gray-600">
            Three things you do on every case, in one place instead of three.
          </p>

          <ul className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {CAPABILITIES.map((capability) => (
              <li
                key={capability.title}
                className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
              >
                <span className="mb-4 inline-flex rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  >
                    {capability.icon}
                  </svg>
                </span>
                <h3 className="text-base font-semibold text-gray-900">
                  {capability.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {capability.body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------ signatures proof */}
        <section
          aria-labelledby="signatures-heading"
          className="border-y border-gray-100 bg-gray-50"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:px-8">
            <div>
              <h2
                id="signatures-heading"
                className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl"
              >
                Signed, timestamped, and on the record
              </h2>
              <p className="mt-4 text-base leading-relaxed text-gray-600">
                A treatment plan is only finished when the signatures are on it.
                ClearView collects the BCBA and parent/guardian signatures in the
                app, records who signed and when, and keeps an audit trail of
                every change to the plan behind it.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-gray-700">
                {[
                  "BCBA and guardian signature capture with timestamps",
                  "Audit log of creates, edits and signature events",
                  "PDF export of the finished, signed plan",
                  "Role-based access, so staff only see what their role allows",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <svg
                      className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m4.5 12.75 6 6 9-13.5"
                      />
                    </svg>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <BrowserFrame
              src={SCREENSHOT_SIGNATURES}
              alt="The signatures panel of a ClearView ABA Suite treatment plan showing a Fully Signed state, a BCBA signature and a parent/guardian signature with timestamps."
              width={1440}
              height={700}
              path="/treatment-plans"
            />
          </div>
        </section>

        {/* --------------------------------------------------------- pricing */}
        <section
          id="pricing"
          aria-labelledby="pricing-heading"
          className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:px-8"
        >
          <h2
            id="pricing-heading"
            className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl"
          >
            Simple monthly pricing
          </h2>
          <p className="mt-3 max-w-2xl text-base text-gray-600">
            Per practice, billed monthly. Every plan starts with a 14-day free
            trial and no credit card.
          </p>

          <ul className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <li
                key={plan.id}
                className={`relative flex flex-col rounded-lg border bg-white p-6 shadow-sm ${
                  plan.popular ? "border-indigo-300 ring-1 ring-indigo-200" : "border-gray-200"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-6 rounded-full bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                    Most common
                  </span>
                )}
                <h3 className="text-lg font-semibold text-gray-900">
                  {plan.name}
                </h3>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight text-gray-900">
                    {plan.price}
                  </span>
                  <span className="text-sm font-medium text-gray-500">
                    {plan.period}
                  </span>
                </p>
                <p className="mt-3 text-sm text-gray-600">{clientLimitLabel(plan.clientLimit)}</p>
                <p className="text-sm text-gray-600">{seatsLabel(plan.seats)}</p>

                <ul className="mt-5 space-y-2 border-t border-gray-100 pt-5 text-sm text-gray-700">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <svg
                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-300"
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
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/register"
                  className={`mt-6 inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-semibold text-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                    plan.popular
                      ? "bg-indigo-600 hover:bg-indigo-500 focus-visible:ring-indigo-500"
                      : "bg-gray-900 hover:bg-gray-800 focus-visible:ring-gray-900"
                  }`}
                >
                  Start free trial
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-sm text-gray-500">
            Prices in USD. Checkout runs on Stripe.{" "}
            <Link
              to="/billing"
              className="font-semibold text-indigo-600 underline-offset-4 hover:text-indigo-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
            >
              Compare plans in detail
            </Link>
            .
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Seats are shared practice accounts. Solo is one practitioner;
            Practice includes{" "}
            {seatsLabel(planLimits("practice").seats).toLowerCase()} and Clinic{" "}
            {seatsLabel(planLimits("clinic").seats).toLowerCase()} — invite a
            colleague from the Members page and they work in the same practice
            as you.
          </p>
        </section>

        {/* ----------------------------------------------------- closing CTA */}
        <section aria-labelledby="cta-heading" className="bg-indigo-600">
          <div className="mx-auto max-w-4xl px-4 py-14 text-center sm:px-6 lg:px-8">
            <h2
              id="cta-heading"
              className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
            >
              Your next treatment plan could write itself
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-indigo-100">
              Start with a free 14-day trial. Add a client, complete a VB-MAPP,
              and see the plan generate from it.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/register"
                className="inline-flex w-full items-center justify-center rounded-md bg-white px-6 py-3 text-base font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600 sm:w-auto"
              >
                Start free trial
              </Link>
              <Link
                to="/login"
                className="rounded-md px-4 py-3 text-sm font-semibold text-white underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
              >
                Already have an account? Sign in
              </Link>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- safeguards */}
        <section
          aria-labelledby="safeguards-heading"
          className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8"
        >
          <h2
            id="safeguards-heading"
            className="text-lg font-semibold text-gray-900"
          >
            Built with HIPAA-conscious safeguards
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-600">
            ClearView ABA Suite is designed around protected health information:
            role-based access control, session authentication, encrypted
            transport, and an audit trail on data changes. We are a documentation
            tool, not a covered entity — you remain responsible for your own
            HIPAA programme and business associate agreements. We do not claim
            HIPAA certification.
          </p>
        </section>
      </main>

      {/* ------------------------------------------------------------ footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Logo className="h-5 w-5 text-indigo-600" />
            ClearView ABA Suite
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-500">
            <a
              href="#pricing"
              className="rounded-md hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Pricing
            </a>
            <Link
              to="/login"
              className="rounded-md hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Sign in
            </Link>
            <p>© {new Date().getFullYear()} ClearView ABA Suite. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
