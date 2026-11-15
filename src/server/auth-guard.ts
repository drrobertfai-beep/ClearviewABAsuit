// ClearView ABA Suite — Session + role-based access guard (server-only)
// Import only in server code or createServerFn handlers.
//
// This is the ONLY place a request's practice is decided. The practice id comes
// from the session row joined to practice_members — never from a request body,
// query string or URL — so a caller cannot ask for another practice's data.

import { getCookie } from "@tanstack/react-start/server";
import { getSessionByToken } from "~/db/auth";
import { getBillingStatus } from "~/db/billing";
import { toSafeUser } from "~/server/safe-user";
import type { SafeUser } from "~/server/safe-user";
import type { PracticeRole } from "~/db/types";

const SESSION_COOKIE = "cv_auth_token";

/** A request that is known to belong to a practice. */
export interface RequestContext {
  user: SafeUser;
  /** The caller's own session row — the unit the practice choice is stored on. */
  sessionId: string;
  practiceId: string;
  practiceRole: PracticeRole;
}

/**
 * Require an authenticated caller that belongs to a practice.
 * Throws otherwise — callers use the returned `practiceId` for every query.
 *
 * Usage inside createServerFn handlers:
 *   const { practiceId, user } = await requireSession();
 */
export async function requireSession(): Promise<RequestContext> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) {
    throw new Error("Authentication required.");
  }
  return contextForToken(token);
}

/**
 * The same guard for a plain request handler (a route under src/routes/api),
 * where the session cookie is read from the request headers instead of the
 * server-function cookie store. Used by the attachment download route, so a file
 * is only ever served to a signed-in member of the practice that owns it.
 */
export async function requireSessionForRequest(
  request: Request,
): Promise<RequestContext> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) {
    throw new Error("Authentication required.");
  }
  return contextForToken(token);
}

/** Pull `cv_auth_token` out of a raw Cookie header. */
function readSessionCookie(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}

/** Resolve a session token to the caller's practice. */
async function contextForToken(token: string): Promise<RequestContext> {
  const result = await getSessionByToken(token);
  if (!result) {
    throw new Error("Session expired. Please log in again.");
  }

  if (!result.practice) {
    throw new Error("This account is not attached to a practice.");
  }

  return {
    user: toSafeUser(result.user, result.practice),
    sessionId: result.session.id,
    practiceId: result.practice.practiceId,
    practiceRole: result.practice.practiceRole,
  };
}

/**
 * Refuse a WRITE when the practice is read-only.
 *
 * Cancelling a subscription (customer.subscription.deleted) puts the practice in
 * the read-only state: everything it holds stays, but nothing changes until it is
 * reactivated. Reads are never blocked, so a cancelled practice can still see and
 * export its own data.
 *
 * Called from the permission guards below, which every mutating server function
 * goes through — a client that ignores the disabled buttons still gets refused
 * here, server-side.
 */
export async function assertPracticeWritable(practiceId: string): Promise<void> {
  const status = await getBillingStatus(practiceId);
  if (status === "cancelled") {
    throw new Error(
      "This practice is read-only because its subscription was cancelled. Nothing has been deleted — reactivate on the Billing page to make changes.",
    );
  }
}

/**
 * Require one of the given practice permission levels (owner/admin/clinician/
 * viewer). Distinct from the clinical credential on `users.role`.
 */
export async function requirePracticeRole(
  allowedRoles: PracticeRole[],
): Promise<RequestContext> {
  const ctx = await requireSession();
  if (!allowedRoles.includes(ctx.practiceRole)) {
    throw new Error("You do not have permission to perform this action.");
  }
  await assertPracticeWritable(ctx.practiceId);
  return ctx;
}

/**
 * Enforce the clinical credential (users.role: bcba/bcaba/admin/parent).
 *
 * Usage inside createServerFn handlers:
 *   const { user, practiceId } = await requireRole(['bcba', 'admin']);
 */
export async function requireRole(allowedRoles: string[]): Promise<RequestContext> {
  const ctx = await requireSession();
  if (!allowedRoles.includes(ctx.user.role)) {
    throw new Error("You do not have permission to perform this action.");
  }
  await assertPracticeWritable(ctx.practiceId);
  return ctx;
}
