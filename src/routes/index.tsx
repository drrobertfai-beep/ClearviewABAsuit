// Route "/" — the front door.
//
// Signed out: the marketing landing page (public, server-rendered, indexable).
// Signed in:  the app dashboard, exactly as before.
//
// The auth wall lives in src/routes/__root.tsx; "/" is listed there as an open
// path so a stranger reaches the landing page instead of a login form.
import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { DashboardHome } from "~/components/DashboardHome";
import { LandingPage } from "~/components/LandingPage";

const TITLE =
  "ClearView ABA Suite — assessment to treatment plan for BCBAs and ABA practices";
const DESCRIPTION =
  "ClearView ABA Suite turns a completed VB-MAPP into a scored, signed, PDF-ready treatment plan. Assessment auto-scoring, treatment plan generation, digital signatures and an audit trail for BCBAs, BCaBAs and ABA practices.";

export const Route = createFileRoute("/")({
  // Read the session that the root route already resolved, so the <head> can
  // describe the page the visitor actually gets (marketing vs dashboard).
  loader: ({ context }) => ({
    signedIn: Boolean((context as { user?: unknown } | undefined)?.user),
  }),
  head: ({ loaderData }) => {
    if (loaderData?.signedIn) {
      return {
        meta: [
          { title: "Dashboard · ClearView ABA Suite" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    return {
      meta: [
        { title: TITLE },
        { name: "description", content: DESCRIPTION },
        { name: "robots", content: "index, follow" },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: "ClearView ABA Suite" },
        { property: "og:title", content: TITLE },
        { property: "og:description", content: DESCRIPTION },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: HomeRoute,
});

function HomeRoute() {
  const ctx = useRouteContext({ from: "/" }) as { user?: unknown };
  return ctx.user ? <DashboardHome /> : <LandingPage />;
}
