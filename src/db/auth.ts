// ClearView ABA Suite — Auth DB helpers (server-only)
// Session and user queries for authentication.

import { sql } from "./sql";
import type { PracticeContext, PracticeRole, User } from "./types";

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
  /**
   * The practice this session is acting in, resolved server-side from
   * practice_members on every lookup. `null` only for an account that has no
   * active membership (should not happen after registration + backfill).
   */
  practice: PracticeContext | null;
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
    WITH updated AS (
      UPDATE users
      SET plan = ${plan},
          account_status = ${accountStatus},
          trial_ends_at = ${trialEndsAt ?? null}::timestamptz
      WHERE id = ${userId}
      RETURNING *
    ), synced_practice AS (
      -- practices.plan is the billing-relevant tier; keep it in step with the
      -- owning user's plan (see syncPracticePlan in src/db/practices.ts).
      UPDATE practices p
      SET plan = ${plan}
      WHERE p.id IN (
        SELECT practice_id FROM practice_members
        WHERE user_id = ${userId} AND role = 'owner' AND status = 'active'
      )
      RETURNING id
    )
    SELECT * FROM updated
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
           u.created_at as u_created_at,
           p.id as p_id, p.name as p_name, p.plan as p_plan, pm.role as pm_role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN LATERAL (
      SELECT pm.practice_id, pm.role
      FROM practice_members pm
      WHERE pm.user_id = u.id AND pm.status = 'active'
      -- Most recently joined active membership wins (see getActiveMembership
      -- in src/db/practices.ts). Accepting an invite makes that practice active.
      ORDER BY pm.joined_at DESC
      LIMIT 1
    ) pm ON TRUE
    LEFT JOIN practices p ON p.id = pm.practice_id
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
    practice: r.p_id
      ? {
          practiceId: String(r.p_id),
          practiceName: String(r.p_name),
          practicePlan: r.p_plan as PracticeContext["practicePlan"],
          practiceRole: r.pm_role as PracticeRole,
        }
      : null,
  };
}

export async function deleteSession(token: string): Promise<void> {
  await sql()`DELETE FROM sessions WHERE token = ${token}`;
}

export async function deleteExpiredSessions(): Promise<void> {
  await sql()`DELETE FROM sessions WHERE expires_at <= now()`;
}
