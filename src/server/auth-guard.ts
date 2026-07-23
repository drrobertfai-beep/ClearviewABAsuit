// ClearView ABA Suite — Role-based access guard (server-only)
// Import only in server code or createServerFn handlers.

import { getCookie } from "@tanstack/react-start/server";
import { getSessionByToken } from "~/db/auth";
import type { User } from "~/db/types";

export type SafeUser = Omit<User, "password_hash">;

const SESSION_COOKIE = "cv_auth_token";

function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    created_at: user.created_at,
  };
}

/**
 * Enforce role-based access. Throws if the current user is not authenticated
 * or does not have one of the allowed roles.
 *
 * Usage inside createServerFn handlers:
 *   const user = await requireRole(['bcba', 'admin']);
 */
export async function requireRole(
  allowedRoles: string[],
): Promise<SafeUser> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) {
    throw new Error("Authentication required.");
  }

  const result = await getSessionByToken(token);
  if (!result) {
    throw new Error("Session expired. Please log in again.");
  }

  if (!allowedRoles.includes(result.user.role)) {
    throw new Error("You do not have permission to perform this action.");
  }

  return toSafeUser(result.user);
}
