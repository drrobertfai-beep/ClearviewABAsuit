// ClearView ABA Suite — Stripe webhook route: POST /api/stripe/webhook
//
// A plain request handler rather than a server function: Stripe needs the RAW
// body for signature verification, and it sends no session cookie and no CSRF
// token. Public by design — the signature is the authentication.
//
// The handler itself lives in src/server/stripe-webhook.ts so it can be driven
// directly (and tested) without a running server. The dynamic import keeps that
// server-only module out of the client bundle.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleStripeWebhook } = await import("~/server/stripe-webhook");
        return handleStripeWebhook(request);
      },
    },
  },
});
