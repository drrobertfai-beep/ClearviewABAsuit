// ClearView ABA Suite — Auth server functions
// All authentication logic runs server-side via createServerFn.
// Uses httpOnly cookies for session tokens.

import { createServerFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import {
  getUserByEmail,
  createUser,
  createSession,
  getSessionByToken,
  deleteSession,
} from "~/db/auth";
import type { User } from "~/db/types";

// ============================================================================
// SafeUser — public user object (no password_hash)
// ============================================================================
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: User["role"];
  plan: User["plan"];
  trial_ends_at: string | null;
  account_status: User["account_status"];
  created_at: string;
}

function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    trial_ends_at: user.trial_ends_at,
    account_status: user.account_status,
    created_at: user.created_at,
  };
}

// ============================================================================
// Session config
// ============================================================================
const SESSION_COOKIE = "cv_auth_token";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

// ============================================================================
// getSessionFn — returns current user or null
// ============================================================================
export const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (!token) return null;

  const result = await getSessionByToken(token);
  if (!result) return null;

  return toSafeUser(result.user);
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

    const valid = await Bun.password.verify(password, user.password_hash);
    if (!valid) {
      throw new Error("Invalid email or password.");
    }

    // Create session
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
    await createSession(user.id, token, expiresAt);

    // Set httpOnly cookie
    setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: false, // Set to true in production with HTTPS
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    return toSafeUser(user);
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

    // Hash password and create user
    const passwordHash = await Bun.password.hash(password);
    const user = await createUser(name, email, passwordHash, role);

    // If plan was specified, update the user's plan (default is "trial" from DB)
    if (plan && ["solo", "practice", "clinic"].includes(plan)) {
      const { updateUserPlan } = await import("~/db/auth");
      await updateUserPlan(user.id, plan as "solo" | "practice" | "clinic", "trial");
    }

    // Create session (auto-login)
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000);
    await createSession(user.id, token, expiresAt);

    // Set httpOnly cookie
    setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    // Re-fetch user to get updated plan info
    const { getUserById } = await import("~/db/auth");
    const updatedUser = await getUserById(user.id);
    return toSafeUser(updatedUser ?? user);
  });

// ============================================================================
// logoutFn — clears session and cookie
// ============================================================================
export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(SESSION_COOKIE);
  if (token) {
    await deleteSession(token);
  }
  deleteCookie(SESSION_COOKIE, { path: "/" });
  return { success: true };
});
