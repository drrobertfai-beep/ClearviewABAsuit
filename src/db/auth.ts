// ClearView ABA Suite — Auth DB helpers (server-only)
// Session and user queries for authentication.

import { sql } from "./sql";
import type { User } from "./types";

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface SessionWithUser {
  session: Session;
  user: User;
}

// ============================================================================
// Helpers
// ============================================================================

function rowToUser(r: Record<string, unknown>): User {
  return {
    id: String(r.id ?? r.u_id),
    email: String(r.email ?? r.u_email),
    name: String(r.name ?? r.u_name),
    role: (r.role ?? r.u_role) as User["role"],
    password_hash: String(r.password_hash ?? r.u_password_hash),
    plan: ((r.plan ?? r.u_plan ?? "trial") as User["plan"]),
    trial_ends_at: r.trial_ends_at ?? r.u_trial_ends_at ? String(r.trial_ends_at ?? r.u_trial_ends_at) : null,
    stripe_customer_id: r.stripe_customer_id ?? r.u_stripe_customer_id ? String(r.stripe_customer_id ?? r.u_stripe_customer_id) : null,
    account_status: ((r.account_status ?? r.u_account_status ?? "trial") as User["account_status"]),
    created_at: (r.created_at ?? r.u_created_at) instanceof Date
      ? ((r.created_at ?? r.u_created_at) as Date).toISOString()
      : String(r.created_at ?? r.u_created_at),
  };
}

// ============================================================================
// User helpers
// ============================================================================

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await sql()`SELECT * FROM users WHERE email = ${email.toLowerCase().trim()}`;
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await sql()`SELECT * FROM users WHERE id = ${id}`;
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}

export async function createUser(
  name: string,
  email: string,
  passwordHash: string,
  role: string,
): Promise<User> {
  const rows = await sql()`
    INSERT INTO users (name, email, role, password_hash)
    VALUES (${name}, ${email.toLowerCase().trim()}, ${role}, ${passwordHash})
    RETURNING *
  `;
  return rowToUser(rows[0]);
}

export async function updateUserPlan(
  userId: string,
  plan: "trial" | "solo" | "practice" | "clinic",
  accountStatus: "trial" | "active" | "past_due" | "cancelled",
  trialEndsAt?: string | null,
): Promise<User | null> {
  const rows = await sql()`
    UPDATE users
    SET plan = ${plan},
        account_status = ${accountStatus},
        trial_ends_at = ${trialEndsAt ?? null}::timestamptz
    WHERE id = ${userId}
    RETURNING *
  `;
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}

// ============================================================================
// Session helpers
// ============================================================================

export async function createSession(
  userId: string,
  token: string,
  expiresAt: Date,
): Promise<Session> {
  const rows = await sql()`
    INSERT INTO sessions (user_id, token, expires_at)
    VALUES (${userId}, ${token}, ${expiresAt.toISOString()})
    RETURNING *
  `;
  const r = rows[0];
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    token: String(r.token),
    expires_at: r.expires_at instanceof Date ? r.expires_at.toISOString() : String(r.expires_at),
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  };
}

export async function getSessionByToken(token: string): Promise<SessionWithUser | null> {
  const rows = await sql()`
    SELECT s.id as s_id, s.user_id as s_user_id, s.token as s_token,
           s.expires_at as s_expires_at, s.created_at as s_created_at,
           u.id as u_id, u.email as u_email, u.name as u_name,
           u.role as u_role, u.password_hash as u_password_hash,
           u.plan as u_plan, u.trial_ends_at as u_trial_ends_at,
           u.stripe_customer_id as u_stripe_customer_id,
           u.account_status as u_account_status,
           u.created_at as u_created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > now()
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    session: {
      id: String(r.s_id),
      user_id: String(r.s_user_id),
      token: String(r.s_token),
      expires_at: r.s_expires_at instanceof Date ? r.s_expires_at.toISOString() : String(r.s_expires_at),
      created_at: r.s_created_at instanceof Date ? r.s_created_at.toISOString() : String(r.s_created_at),
    },
    user: rowToUser(r),
  };
}

export async function deleteSession(token: string): Promise<void> {
  await sql()`DELETE FROM sessions WHERE token = ${token}`;
}

export async function deleteExpiredSessions(): Promise<void> {
  await sql()`DELETE FROM sessions WHERE expires_at <= now()`;
}
