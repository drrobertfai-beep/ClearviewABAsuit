// ClearView ABA Suite — Session + role-based access guard (server-only)
// Import only in server code or createServerFn handlers.
//
// This is the ONLY place a request's practice is decided. The practice id comes
// from the session row joined to practice_members — never from a request body,
// query string or URL — so a caller cannot ask for another practice's data.

import { getCookie } from "@tanstack/react-start/server";
import { getSessionByToken } from "~/db/auth";
import { toSafeUser } from "~/server/safe-user";
import type { SafeUser } from "~/server/safe-user";
import type { PracticeRole } from "~/db/types";

const SESSION_COOKIE = "cv_auth_token";

/** A request that is known to belong to a practice. */
export interface RequestContext {
  user: SafeUser;
  practiceId: string;
  practiceRole: PracticeRole;
}

export function toSafeUser(
  user: User,
  practice: PracticeContext | null,
): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    trial_ends_at: user.trial_ends_at,
    stripe_customer_id: user.stripe_customer_id,
    account_status: user.account_status,
    created_at: user.created_at,
    practiceId: practice?.practiceId ?? null,
    practiceRole: practice?.practiceRole ?? null,
    practiceName: practice?.practiceName ?? null,
  };
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

  const result = await getSessionByToken(token);
  if (!result) {
    throw new Error("Session expired. Please log in again.");
  }

  if (!result.practice) {
    throw new Error("This account is not attached to a practice.");
  }

  return {
    user: toSafeUser(result.user, result.practice),
    practiceId: result.practice.practiceId,
    practiceRole: result.practice.practiceRole,
  };
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
  return ctx;
}
