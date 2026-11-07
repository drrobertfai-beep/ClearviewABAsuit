// ClearView ABA Suite — Practice members & invites — server-only
//
// Phase 2 of the practice model: who is in a practice, at what permission
// level, and how a colleague joins it. Every query takes `practiceId` first and
// is constrained to it, so a caller can never read or write another practice's
// membership.
//
// Permission roles (owner/admin/clinician/viewer) are NOT the clinical
// credential on `users.role` (bcba/bcaba/admin/parent). Both are kept.
//
// Seat limits come from `~/lib/plans` — the single source of truth shared with
// the landing, billing and members pages. Nothing here hardcodes a seat count.

import { randomBytes } from "node:crypto";

import { sql } from "./sql";
import { auditChange } from "./audit";
import type { MembershipStatus, PracticeRole } from "./types";
import { getPlan, hasSeatFor, planLabel, planLimits, seatsLabel } from "~/lib/plans";

/** How long an invite link stays usable. */
export const INVITE_TTL_DAYS = 14;

/** Roles that may be granted through an invite (an owner is promoted later). */
export const INVITABLE_ROLES: readonly PracticeRole[] = [
  "admin",
  "clinician",
  "viewer",
];

const ALL_ROLES: readonly PracticeRole[] = [
  "owner",
  "admin",
  "clinician",
  "viewer",
];

export function isPracticeRole(value: unknown): value is PracticeRole {
  return typeof value === "string" && ALL_ROLES.includes(value as PracticeRole);
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toIso(value);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PracticeMemberRecord {
  /** `users.id` — the account behind the membership. */
  userId: string;
  name: string;
  email: string;
  /** Clinical credential (`users.role`): bcba | bcaba | admin | parent. */
  credential: string;
  /** Permission level inside the practice. */
  role: PracticeRole;
  status: MembershipStatus;
  joinedAt: string;
}

export interface PendingInviteRecord {
  id: string;
  email: string;
  role: PracticeRole;
  /** The secret in the invite link. Only ever returned to owner/admin. */
  token: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface PracticeSummary {
  id: string;
  name: string;
  plan: string;
}

/** A seat check: what the plan allows and what the practice is using. */
export interface SeatStatus {
  plan: string;
  planName: string;
  /** Plan seat limit; null = unlimited. */
  seats: number | null;
  /** Active members. */
  seatsUsed: number;
  /** Live (unexpired, unaccepted) invites — a reserved seat each. */
  seatsPending: number;
  /** Whether one more practitioner would fit. */
  available: boolean;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** The practice's name and plan tier. */
export async function getPracticeSummary(
  practiceId: string,
): Promise<PracticeSummary | null> {
  const rows = await sql()`
    SELECT id, name, plan FROM practices WHERE id = ${practiceId} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return { id: String(r.id), name: String(r.name), plan: String(r.plan) };
}

/** Active members of a practice, owners first. */
export async function listMembers(
  practiceId: string,
): Promise<PracticeMemberRecord[]> {
  const rows = await sql()`
    SELECT pm.user_id, pm.role, pm.status, pm.joined_at,
           u.name, u.email, u.role AS credential
    FROM practice_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.practice_id = ${practiceId} AND pm.status = 'active'
    ORDER BY CASE pm.role
               WHEN 'owner' THEN 0
               WHEN 'admin' THEN 1
               WHEN 'clinician' THEN 2
               ELSE 3
             END,
             pm.joined_at ASC
  `;
  return rows.map((r) => ({
    userId: String(r.user_id),
    name: String(r.name),
    email: String(r.email),
    credential: String(r.credential),
    role: r.role as PracticeRole,
    status: r.status as MembershipStatus,
    joinedAt: toIso(r.joined_at),
  }));
}

/** Number of active seats in use. */
export async function countActiveSeats(practiceId: string): Promise<number> {
  const rows = await sql()`
    SELECT count(*)::int AS n
    FROM practice_members
    WHERE practice_id = ${practiceId} AND status = 'active'
  `;
  return Number(rows[0]?.n ?? 0);
}

/** Number of live invites (unaccepted, unexpired) — each holds a seat. */
export async function countPendingInvites(practiceId: string): Promise<number> {
  const rows = await sql()`
    SELECT count(*)::int AS n
    FROM practice_invites
    WHERE practice_id = ${practiceId}
      AND accepted_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
  `;
  return Number(rows[0]?.n ?? 0);
}

/** Live invites for the members page. */
export async function listPendingInvites(
  practiceId: string,
): Promise<PendingInviteRecord[]> {
  const rows = await sql()`
    SELECT id, email, role, token, created_at, expires_at
    FROM practice_invites
    WHERE practice_id = ${practiceId}
      AND accepted_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY created_at DESC
  `;
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    role: r.role as PracticeRole,
    token: String(r.token),
    createdAt: toIso(r.created_at),
    expiresAt: toIsoOrNull(r.expires_at),
  }));
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

/**
 * What the plan allows versus what the practice is using.
 *
 * A pending invite reserves a seat: otherwise an owner could send ten links on
 * a five-seat plan and the last five acceptances would fail one by one.
 */
export async function getSeatStatus(practiceId: string): Promise<SeatStatus> {
  const practice = await getPracticeSummary(practiceId);
  const plan = practice?.plan ?? "trial";
  const { seats } = planLimits(plan);
  const [seatsUsed, seatsPending] = await Promise.all([
    countActiveSeats(practiceId),
    countPendingInvites(practiceId),
  ]);
  return {
    plan,
    planName: planLabel(plan),
    seats,
    seatsUsed,
    seatsPending,
    available: hasSeatFor(seatsUsed + seatsPending, seats),
  };
}

/** Message for a refused invite/acceptance that names the plan and its limit. */
export function seatLimitMessage(status: SeatStatus): string {
  const limit = seatsLabel(status.seats);
  const used = `${status.seatsUsed} in use`;
  const pending =
    status.seatsPending > 0
      ? ` and ${status.seatsPending} invite${status.seatsPending === 1 ? "" : "s"} pending`
      : "";
  return (
    `The ${status.planName} plan includes ${limit} (${used}${pending}). ` +
    `No seats are left, so another practitioner cannot be added. ` +
    `Upgrade the plan or free up a seat first.`
  );
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

export type InviteLookupStatus = "pending" | "used" | "expired";

export interface InviteLookup {
  id: string;
  practiceId: string;
  practiceName: string;
  practicePlan: string;
  email: string;
  role: PracticeRole;
  status: InviteLookupStatus;
  expiresAt: string | null;
  acceptedAt: string | null;
}

/**
 * Resolve an invite from its token. Returns null for an unknown token (the
 * caller shows the same "no longer valid" page as expired/cancelled).
 */
export async function getInviteByToken(
  token: string,
): Promise<InviteLookup | null> {
  if (typeof token !== "string" || token.length < 10 || token.length > 200) {
    return null;
  }
  const rows = await sql()`
    SELECT i.id, i.practice_id, i.email, i.role, i.expires_at, i.accepted_at,
           p.name AS practice_name, p.plan AS practice_plan,
           (i.expires_at IS NOT NULL AND i.expires_at <= now()) AS is_expired
    FROM practice_invites i
    JOIN practices p ON p.id = i.practice_id
    WHERE i.token = ${token}
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  const status: InviteLookupStatus = r.accepted_at
    ? "used"
    : r.is_expired
      ? "expired"
      : "pending";
  return {
    id: String(r.id),
    practiceId: String(r.practice_id),
    practiceName: String(r.practice_name),
    practicePlan: String(r.practice_plan),
    email: String(r.email),
    role: r.role as PracticeRole,
    status,
    expiresAt: toIsoOrNull(r.expires_at),
    acceptedAt: toIsoOrNull(r.accepted_at),
  };
}

export type CreateInviteResult =
  | { ok: true; invite: PendingInviteRecord; replacedPending: boolean }
  | { ok: false; error: string };

/**
 * Create (or refresh) an invite for `email`.
 *
 * Re-inviting the same address replaces the previous pending invite instead of
 * stacking duplicates, so the older link stops working.
 */
export async function createInvite(
  practiceId: string,
  emailInput: string,
  role: PracticeRole,
  createdByUserId: string,
  actorEmail: string,
): Promise<CreateInviteResult> {
  const email = String(emailInput ?? "").toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!isPracticeRole(role)) {
    return { ok: false, error: "Choose a role for the invite." };
  }
  if (role === "owner") {
    return {
      ok: false,
      error: "Invites cannot grant ownership. Invite as an admin and promote later.",
    };
  }

  const seatStatus = await getSeatStatus(practiceId);
  if (!seatStatus.available) {
    return { ok: false, error: seatLimitMessage(seatStatus) };
  }

  // Already a member? Refreshing an invite for an existing member is a no-op
  // the owner should hear about rather than a confusing second link.
  const existingMember = await sql()`
    SELECT 1 FROM practice_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.practice_id = ${practiceId}
      AND pm.status = 'active'
      AND lower(u.email) = ${email}
    LIMIT 1
  `;
  if (existingMember.length > 0) {
    return { ok: false, error: `${email} is already a member of this practice.` };
  }

  // Replace any previous pending invite for this address.
  const replaced = await sql()`
    DELETE FROM practice_invites
    WHERE practice_id = ${practiceId}
      AND lower(email) = ${email}
      AND accepted_at IS NULL
    RETURNING id
  `;

  const token = randomBytes(24).toString("base64url");
  const rows = await sql()`
    INSERT INTO practice_invites (practice_id, email, role, token, expires_at, created_by)
    VALUES (
      ${practiceId}, ${email}, ${role}, ${token},
      now() + (${INVITE_TTL_DAYS} || ' days')::interval,
      ${createdByUserId}
    )
    RETURNING id, email, role, token, created_at, expires_at
  `;
  const r = rows[0];
  const invite: PendingInviteRecord = {
    id: String(r.id),
    email: String(r.email),
    role: r.role as PracticeRole,
    token: String(r.token),
    createdAt: toIso(r.created_at),
    expiresAt: toIsoOrNull(r.expires_at),
  };

  await auditChange(
    practiceId,
    "practice_invites",
    invite.id,
    "CREATE",
    actorEmail,
    replaced.length > 0 ? { replacedPendingInvites: replaced.length } : null,
    { email: invite.email, role: invite.role },
  );

  return { ok: true, invite, replacedPending: replaced.length > 0 };
}

/** Delete a pending invite. Returns false when it is not this practice's. */
export async function cancelInvite(
  practiceId: string,
  inviteId: string,
  actorEmail: string,
): Promise<boolean> {
  const rows = await sql()`
    DELETE FROM practice_invites
    WHERE id = ${inviteId}
      AND practice_id = ${practiceId}
      AND accepted_at IS NULL
    RETURNING id, email, role
  `;
  if (rows.length === 0) return false;
  const r = rows[0];
  await auditChange(
    practiceId,
    "practice_invites",
    String(r.id),
    "DELETE",
    actorEmail,
    { email: String(r.email), role: String(r.role) },
    { cancelled: true },
  );
  return true;
}

export type AcceptInviteResult =
  | {
      ok: true;
      practiceId: string;
      practiceName: string;
      role: PracticeRole;
      alreadyMember: boolean;
    }
  | { ok: false; reason: "invalid" | "expired" | "used" | "seats"; error: string };

/**
 * Accept an invite for the signed-in account.
 *
 * The seat count is checked AGAIN here: a seat may have filled between the
 * invite being sent and accepted. Reactivates a previously removed membership
 * instead of creating a duplicate row, and stamps `accepted_at`.
 */
export async function acceptInvite(
  token: string,
  userId: string,
  userEmail: string,
): Promise<AcceptInviteResult> {
  const invite = await getInviteByToken(token);
  if (!invite) {
    return { ok: false, reason: "invalid", error: "This invite is no longer valid." };
  }
  if (invite.status === "used") {
    return {
      ok: false,
      reason: "used",
      error: "This invite has already been used. Ask for a new one.",
    };
  }
  if (invite.status === "expired") {
    return {
      ok: false,
      reason: "expired",
      error: "This invite has expired. Ask for a new one.",
    };
  }

  const existing = await sql()`
    SELECT status FROM practice_members
    WHERE practice_id = ${invite.practiceId} AND user_id = ${userId}
    LIMIT 1
  `;
  const alreadyMember =
    existing.length > 0 && String(existing[0].status) === "active";

  if (!alreadyMember) {
    const seatStatus = await getSeatStatus(invite.practiceId);
    if (!seatStatus.available) {
      return { ok: false, reason: "seats", error: seatLimitMessage(seatStatus) };
    }
  }

  // Join (or re-join) the practice. `joined_at` is refreshed so this membership
  // becomes the account's active practice — see getActiveMembership.
  await sql()`
    INSERT INTO practice_members (practice_id, user_id, role, status, joined_at)
    VALUES (${invite.practiceId}, ${userId}, ${invite.role}, 'active', now())
    ON CONFLICT (practice_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          status = 'active',
          joined_at = now()
  `;

  await sql()`
    UPDATE practice_invites SET accepted_at = now() WHERE id = ${invite.id}
  `;

  await auditChange(
    invite.practiceId,
    "practice_members",
    userId,
    alreadyMember ? "UPDATE" : "CREATE",
    userEmail,
    null,
    { email: invite.email, role: invite.role, acceptedInvite: invite.id },
  );

  return {
    ok: true,
    practiceId: invite.practiceId,
    practiceName: invite.practiceName,
    role: invite.role,
    alreadyMember,
  };
}

// ---------------------------------------------------------------------------
// Member management
// ---------------------------------------------------------------------------

export type MemberMutationResult =
  | { ok: true }
  | { ok: false; error: string };

async function getMember(
  practiceId: string,
  userId: string,
): Promise<PracticeMemberRecord | null> {
  const rows = await sql()`
    SELECT pm.user_id, pm.role, pm.status, pm.joined_at,
           u.name, u.email, u.role AS credential
    FROM practice_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.practice_id = ${practiceId}
      AND pm.user_id = ${userId}
      AND pm.status = 'active'
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    userId: String(r.user_id),
    name: String(r.name),
    email: String(r.email),
    credential: String(r.credential),
    role: r.role as PracticeRole,
    status: r.status as MembershipStatus,
    joinedAt: toIso(r.joined_at),
  };
}

async function countOwners(practiceId: string): Promise<number> {
  const rows = await sql()`
    SELECT count(*)::int AS n
    FROM practice_members
    WHERE practice_id = ${practiceId} AND status = 'active' AND role = 'owner'
  `;
  return Number(rows[0]?.n ?? 0);
}

/**
 * Guard rails shared by role change and removal:
 *  - an admin may not demote or remove an owner,
 *  - nobody may demote or remove the last remaining owner.
 */
async function assertCanTouch(
  practiceId: string,
  target: PracticeMemberRecord,
  actorRole: PracticeRole,
  action: "demote" | "remove",
): Promise<string | null> {
  if (target.role === "owner") {
    if (actorRole !== "owner") {
      return `An admin cannot ${action} a practice owner.`;
    }
    if ((await countOwners(practiceId)) <= 1) {
      return `You cannot ${action} the last owner of the practice. Promote another owner first.`;
    }
  }
  return null;
}

/** Change a member's permission level. */
export async function changeMemberRole(
  practiceId: string,
  targetUserId: string,
  newRole: PracticeRole,
  actorRole: PracticeRole,
  actorEmail: string,
): Promise<MemberMutationResult> {
  if (!isPracticeRole(newRole)) {
    return { ok: false, error: "Choose a valid role." };
  }
  const target = await getMember(practiceId, targetUserId);
  if (!target) return { ok: false, error: "That member was not found." };

  if (target.role === newRole) return { ok: true };

  if (target.role === "owner" && newRole !== "owner") {
    const blocked = await assertCanTouch(practiceId, target, actorRole, "demote");
    if (blocked) return { ok: false, error: blocked };
  }
  // Promoting someone to owner is only an owner's call.
  if (newRole === "owner" && actorRole !== "owner") {
    return { ok: false, error: "Only an owner can promote another owner." };
  }

  await sql()`
    UPDATE practice_members SET role = ${newRole}
    WHERE practice_id = ${practiceId} AND user_id = ${targetUserId}
  `;
  await auditChange(
    practiceId,
    "practice_members",
    targetUserId,
    "UPDATE",
    actorEmail,
    { email: target.email, role: target.role },
    { email: target.email, role: newRole },
  );
  return { ok: true };
}

/** Remove a member from the practice. Their access ends on their next request. */
export async function removeMember(
  practiceId: string,
  targetUserId: string,
  actorRole: PracticeRole,
  actorEmail: string,
): Promise<MemberMutationResult> {
  const target = await getMember(practiceId, targetUserId);
  if (!target) return { ok: false, error: "That member was not found." };

  const blocked = await assertCanTouch(practiceId, target, actorRole, "remove");
  if (blocked) return { ok: false, error: blocked };

  await sql()`
    UPDATE practice_members SET status = 'removed'
    WHERE practice_id = ${practiceId} AND user_id = ${targetUserId}
  `;
  await auditChange(
    practiceId,
    "practice_members",
    targetUserId,
    "DELETE",
    actorEmail,
    { email: target.email, role: target.role, status: "active" },
    { email: target.email, status: "removed" },
  );
  return { ok: true };
}

/** Whether `userId` is an active member of `practiceId`. */
export async function isActiveMember(
  practiceId: string,
  userId: string,
): Promise<boolean> {
  const rows = await sql()`
    SELECT 1 FROM practice_members
    WHERE practice_id = ${practiceId} AND user_id = ${userId} AND status = 'active'
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Plan label for display next to the practice name on the members page. */
export function practicePlanLabel(plan: string): string {
  return getPlan(plan)?.name ?? planLabel(plan);
}
