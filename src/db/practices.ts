// ClearView ABA Suite — Practice (tenant) helpers — server-only
//
// A "practice" is the tenant boundary. Every user is a member of at least one
// practice, and every client belongs to exactly one practice. Membership
// carries a PERMISSION role (owner/admin/clinician/viewer), which is a
// different concept from `users.role` (the clinical credential).
//
// Nothing in this file may be imported into client code.

import { sql } from "./sql";
import type {
  PlanTier,
  PracticeContext,
  PracticeRole,
  User,
  UserRole,
} from "./types";

/** Default practice name for a practitioner who has none yet. */
export function practiceNameForUser(userName: string): string {
  return `${userName}'s Practice`;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

/**
 * Resolve the practice a user is currently acting in.
 *
 * This is THE tenancy lookup: it runs server-side from the session cookie on
 * every request.
 *
 * Which practice wins when an account belongs to more than one: the MOST
 * RECENTLY JOINED active membership (phase 2 — joining a practice by accepting
 * an invite makes that practice the one you land in). A user who is removed
 * from a practice they joined falls back to their next most recent active
 * membership, normally the practice created at their own signup. There is no
 * practice switcher yet; this ordering is the whole rule.
 */
export async function getActiveMembership(
  userId: string,
): Promise<PracticeContext | null> {
  const rows = await sql()`
    SELECT p.id, p.name, p.plan, pm.role
    FROM practice_members pm
    JOIN practices p ON p.id = pm.practice_id
    WHERE pm.user_id = ${userId} AND pm.status = 'active'
    ORDER BY pm.joined_at DESC, p.created_at DESC
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    practiceId: String(r.id),
    practiceRole: r.role as PracticeRole,
    practiceName: String(r.name),
    practicePlan: r.plan as PlanTier,
  };
}

/** Every practice a user can access (active memberships only). */
export async function listPracticesForUser(
  userId: string,
): Promise<(PracticeContext & { joinedAt: string })[]> {
  const rows = await sql()`
    SELECT p.id, p.name, p.plan, pm.role, pm.joined_at
    FROM practice_members pm
    JOIN practices p ON p.id = pm.practice_id
    WHERE pm.user_id = ${userId} AND pm.status = 'active'
    ORDER BY pm.joined_at DESC
  `;
  return rows.map((r) => ({
    practiceId: String(r.id),
    practiceRole: r.role as PracticeRole,
    practiceName: String(r.name),
    practicePlan: r.plan as PlanTier,
    joinedAt: toIso(r.joined_at),
  }));
}

/**
 * Create a practice and make `userId` its owner. Returns the new practice id.
 * Callers that need atomicity use the CTE helpers below instead.
 */
export async function createPracticeForUser(
  userId: string,
  userName: string,
  plan: PlanTier = "trial",
): Promise<string> {
  const rows = await sql()`
    WITH new_practice AS (
      INSERT INTO practices (name, plan)
      VALUES (${practiceNameForUser(userName)}, ${plan})
      RETURNING id
    )
    INSERT INTO practice_members (practice_id, user_id, role, status)
    SELECT id, ${userId}, 'owner', 'active' FROM new_practice
    RETURNING practice_id
  `;
  return String(rows[0].practice_id);
}

/**
 * Return the user's active practice, creating one (with them as owner) if they
 * have none. Idempotent: repeated calls never create a second practice for a
 * user who already belongs to one.
 */
export async function ensurePracticeForUser(
  userId: string,
  userName: string,
  plan: PlanTier = "trial",
): Promise<PracticeContext> {
  const existing = await getActiveMembership(userId);
  if (existing) return existing;
  await createPracticeForUser(userId, userName, plan);
  const created = await getActiveMembership(userId);
  if (!created) {
    throw new Error(`Could not create a practice for user ${userId}`);
  }
  return created;
}

/**
 * Keep `practices.plan` in step with the billing tier stored on `users.plan`.
 * The practice is the billing-relevant record going forward; the user column is
 * retained so existing billing UI keeps working.
 */
export async function syncPracticePlan(
  userId: string,
  plan: PlanTier,
): Promise<void> {
  await sql()`
    UPDATE practices p
    SET plan = ${plan}
    WHERE p.id IN (
      SELECT practice_id FROM practice_members
      WHERE user_id = ${userId} AND role = 'owner' AND status = 'active'
    )
  `;
}

/**
 * Create a user AND their practice AND their owner membership in ONE statement
 * (a single implicit transaction), so a signup can never leave an account that
 * belongs to no practice.
 */
export async function createUserWithPractice(
  name: string,
  email: string,
  passwordHash: string,
  role: UserRole | string,
  plan: PlanTier = "trial",
): Promise<User & { practiceId: string }> {
  const rows = await sql()`
    WITH new_user AS (
      INSERT INTO users (name, email, role, password_hash, plan)
      VALUES (${name}, ${email.toLowerCase().trim()}, ${role}, ${passwordHash}, ${plan})
      RETURNING *
    ), new_practice AS (
      INSERT INTO practices (name, plan)
      SELECT ${practiceNameForUser(name)}, new_user.plan FROM new_user
      RETURNING id
    ), new_membership AS (
      INSERT INTO practice_members (practice_id, user_id, role, status)
      SELECT new_practice.id, new_user.id, 'owner', 'active'
      FROM new_practice, new_user
      RETURNING practice_id
    )
    SELECT new_user.*, new_membership.practice_id
    FROM new_user, new_membership
  `;
  const r = rows[0];
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    role: r.role as UserRole,
    password_hash: String(r.password_hash),
    plan: (r.plan ?? "trial") as PlanTier,
    trial_ends_at: r.trial_ends_at ? toIso(r.trial_ends_at) : null,
    stripe_customer_id: r.stripe_customer_id ? String(r.stripe_customer_id) : null,
    account_status: (r.account_status ?? "trial") as User["account_status"],
    created_at: toIso(r.created_at),
    practiceId: String(r.practice_id),
  };
}
