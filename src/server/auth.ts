// ClearView ABA Suite — Auth server functions
// All authentication logic runs server-side via createServerFn.
// Uses httpOnly cookies for session tokens.

import { createServerFn } from "@tanstack/react-start";
import {
  getCookie,
  setCookie,
  deleteCookie,
  getRequestHost,
  getRequestProtocol,
} from "@tanstack/react-start/server";
import {
  getUserByEmail,
  getUserById,
  createSession,
  getSessionByToken,
  deleteSession,
} from "~/db/auth";
import {
  createUserWithPractice,
  ensurePracticeForUser,
  getActiveMembership,
} from "~/db/practices";
import { hashPassword, verifyPassword } from "~/server/password";
import { shouldUseSecureCookie } from "~/server/session-cookie";
import { toSafeUser } from "~/server/safe-user";
import type { SafeUser } from "~/server/safe-user";

export type { SafeUser };

// ============================================================================
// Session config
// ============================================================================
const SESSION_COOKIE = "cv_auth_token";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

/**
 * Whether the session cookie must carry the `Secure` flag for *this* request.
 *
 * The policy itself lives in `~/server/session-cookie` (pure + unit-testable);
 * here we only read the live request. `x-forwarded-proto` / `x-forwarded-host`
 * are honoured because production sits behind Vercel's TLS-terminating edge.
 */
function isSecureRequest(): boolean {
  let protocol = "http";
  let host = "";
  try {
    protocol = getRequestProtocol({ xForwardedProto: true });
    host = getRequestHost({ xForwardedHost: true });
  } catch {
    // No request context (e.g. invoked outside a server-fn handler): the policy
    // below then falls back to NODE_ENV.
  }

  return shouldUseSecureCookie({
    protocol,
    host,
    nodeEnv: process.env.NODE_ENV,
  });
}

/**
 * Cookie attributes for the session token:
 *  - `httpOnly` keeps the token out of reach of JavaScript (XSS),
 *  - `sameSite: 'lax'` stops cross-site POSTs from carrying it (CSRF) while
 *    still allowing normal top-level navigation,
 *  - `secure` keeps it off plain-HTTP connections in production.
 */

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: isSecureRequest(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

// ============================================================================
// getSessionFn — returns current user or null
// ============================================================================
export const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;

  const result = await getSessionByToken(token);
  if (!result) return null;

  // The practice is resolved from the session on every request, server-side.
  return toSafeUser(result.user, result.practice);
});

// ============================================================================
// loginFn — validates credentials, creates session, sets cookie
// ============================================================================
export const loginFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { email: string; password: string })
  .handler(async ({ data }) => {
    const { email, password } = data;

    if (!email || !password) {
      throw new Error("Email and password are required.");
    }

    const user = await getUserByEmail(email);
    if (!user) {
      throw new Error("Invalid email or password.");
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      throw new Error("Invalid email or password.");
    }

    // Tenancy: resolve the practice this account acts in. `ensurePracticeForUser`
    // is a safety net for accounts created before practices existed (or by a
    // script): they get their own practice on first login instead of seeing
    // every row in the database.
    const practice = await ensurePracticeForUser(user.id, user.name, user.plan);

    // Create session
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
    await createSession(user.id, token, expiresAt);

    // Set the session cookie (httpOnly, SameSite=Lax, Secure on HTTPS/prod)
    setCookie(SESSION_COOKIE, token, sessionCookieOptions());

    return toSafeUser(user, practice);
  });

// ============================================================================
// registerFn — creates user, creates session, sets cookie
// ============================================================================
export const registerFn = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        name: string;
        email: string;
        password: string;
        role: string;
        plan?: string;
      },
  )
  .handler(async ({ data }) => {
    const { name, email, password, role, plan } = data;

    // Validate inputs
    if (!name || !email || !password || !role) {
      throw new Error("All fields are required.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const validRoles = ["bcba", "bcaba", "admin"];
    if (!validRoles.includes(role)) {
      throw new Error("Invalid role. Allowed roles: BCBA, BCaBA, Admin.");
    }

    // Check email uniqueness
    const existing = await getUserByEmail(email);
    if (existing) {
      throw new Error("An account with this email already exists.");
    }

    // Hash password, then create the user AND their practice AND their owner
    // membership in one statement (a single implicit transaction), so a fresh
    // signup always lands in a working, empty, isolated practice.
    const passwordHash = await hashPassword(password);
    const requestedPlan =
      plan && ["solo", "practice", "clinic"].includes(plan)
        ? (plan as "solo" | "practice" | "clinic")
        : "trial";
    const user = await createUserWithPractice(
      name,
      email,
      passwordHash,
      role,
      requestedPlan,
    );

    // Keep the billing columns honest: account_status stays "trial" until the
    // Stripe webhook (phase 3) flips it to "active".
    if (requestedPlan !== "trial") {
      const { updateUserPlan } = await import("~/db/auth");
      await updateUserPlan(user.id, requestedPlan, "trial");
    }

    // Create session (auto-login)
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
    await createSession(user.id, token, expiresAt);

    // Set the session cookie (httpOnly, SameSite=Lax, Secure on HTTPS/prod)
    setCookie(SESSION_COOKIE, token, sessionCookieOptions());

    // Re-fetch user to get updated plan info, and resolve the practice we just
    // created for them.
    const { getUserById } = await import("~/db/auth");
    const updatedUser = await getUserById(user.id);
    const practice = await getActiveMembership(user.id);
    return toSafeUser(updatedUser ?? user, practice);
  });

// ============================================================================
// logoutFn — clears session and cookie
// ============================================================================
export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await deleteSession(token);
  }
  // Match the attributes used when setting it so the browser clears it too.
  deleteCookie(SESSION_COOKIE, {
    path: "/",
    httpOnly: true,
    secure: isSecureRequest(),
    sameSite: "lax",
  });
  return { success: true };
});
