// ClearView ABA Suite — Practice members & invites server functions
//
// The caller's practice and permission level ALWAYS come from
// `requireSession()` (resolved from the session cookie joined to
// practice_members). No handler accepts a `practiceId` from the client, so a
// request can only ever act on the practice the caller is signed in to.
//
// Mutations require owner/admin. Reads require any active membership.
//
// Server-only DB modules are imported lazily inside each handler: a static
// top-level import would be pulled into the browser bundle by the Start
// compiler (see the note at the top of ~/server/auth.ts).

import { createServerFn } from "@tanstack/react-start";
import { requirePracticeRole, requireSession } from "~/server/auth-guard";
import { seatUsageLabel } from "~/lib/plans";
import type { PracticeRole } from "~/db/types";

const MANAGE_ROLES: PracticeRole[] = ["owner", "admin"];

// ---------------------------------------------------------------------------
// getPracticeMembersFn — the members page payload
// ---------------------------------------------------------------------------
export const getPracticeMembersFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { practiceId, practiceRole, user } = await requireSession();
    const db = await import("~/db/practice-members");

    const [practice, members, seatStatus] = await Promise.all([
      db.getPracticeSummary(practiceId),
      db.listMembers(practiceId),
      db.getSeatStatus(practiceId),
    ]);

    const canManage = MANAGE_ROLES.includes(practiceRole);
    // Invite tokens are management data: only owners/admins receive them.
    const invites = canManage ? await db.listPendingInvites(practiceId) : [];

    return {
      practice: {
        id: practice?.id ?? practiceId,
        name: practice?.name ?? "Practice",
        plan: seatStatus.plan,
        planName: seatStatus.planName,
      },
      me: { userId: user.id, email: user.email, role: practiceRole },
      canManage,
      seat: {
        used: seatStatus.seatsUsed,
        pending: seatStatus.seatsPending,
        limit: seatStatus.seats,
        available: seatStatus.available,
        usageLabel: seatUsageLabel(seatStatus.seatsUsed, seatStatus.seats),
      },
      members,
      invites,
    };
  },
);

// ---------------------------------------------------------------------------
// createPracticeInviteFn — email + role → invite link
//
// There is no outbound email in this app. The token is returned to the caller
// so the UI can show a copyable link; nothing here claims an email was sent.
// ---------------------------------------------------------------------------
export const createPracticeInviteFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { email?: unknown; role?: unknown })
  .handler(async ({ data }) => {
    const { practiceId, user } = await requirePracticeRole(MANAGE_ROLES);
    const db = await import("~/db/practice-members");

    const email = typeof data?.email === "string" ? data.email : "";
    const role = data?.role;
    if (!db.isPracticeRole(role)) {
      return { ok: false as const, error: "Choose a role for the invite." };
    }

    return db.createInvite(practiceId, email, role, user.id, user.email);
  });

// ---------------------------------------------------------------------------
// cancelPracticeInviteFn
// ---------------------------------------------------------------------------
export const cancelPracticeInviteFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id?: unknown })
  .handler(async ({ data }) => {
    const { practiceId, user } = await requirePracticeRole(MANAGE_ROLES);
    const db = await import("~/db/practice-members");

    const id = typeof data?.id === "string" ? data.id : "";
    if (!id) return { ok: false as const, error: "Missing invite id." };

    const cancelled = await db.cancelInvite(practiceId, id, user.email);
    return cancelled
      ? { ok: true as const }
      : { ok: false as const, error: "That invite no longer exists." };
  });

// ---------------------------------------------------------------------------
// changeMemberRoleFn
// ---------------------------------------------------------------------------
export const changeMemberRoleFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { userId?: unknown; role?: unknown })
  .handler(async ({ data }) => {
    const { practiceId, practiceRole, user } = await requirePracticeRole(
      MANAGE_ROLES,
    );
    const db = await import("~/db/practice-members");

    const userId = typeof data?.userId === "string" ? data.userId : "";
    const role = data?.role;
    if (!userId || !db.isPracticeRole(role)) {
      return { ok: false as const, error: "Choose a valid member and role." };
    }

    return db.changeMemberRole(
      practiceId,
      userId,
      role,
      practiceRole,
      user.email,
    );
  });

// ---------------------------------------------------------------------------
// removePracticeMemberFn
//
// Sets the membership to `removed`; the very next request from that account no
// longer resolves this practice (the session lookup only joins active rows).
// ---------------------------------------------------------------------------
export const removePracticeMemberFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { userId?: unknown })
  .handler(async ({ data }) => {
    const { practiceId, practiceRole, user } = await requirePracticeRole(
      MANAGE_ROLES,
    );
    const db = await import("~/db/practice-members");

    const userId = typeof data?.userId === "string" ? data.userId : "";
    if (!userId) return { ok: false as const, error: "Missing member id." };

    return db.removeMember(practiceId, userId, practiceRole, user.email);
  });

// ---------------------------------------------------------------------------
// getInviteInfoFn — PUBLIC (works signed out)
//
// Returns only what the invite page needs: the practice name, the offered role,
// the invited address and whether the link is still usable. Never any client
// data, never the practice's other members.
// ---------------------------------------------------------------------------
export const getInviteInfoFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { token?: unknown })
  .handler(async ({ data }) => {
    const token = typeof data?.token === "string" ? data.token : "";
    const db = await import("~/db/practice-members");
    const invite = await db.getInviteByToken(token);

    if (!invite || invite.status !== "pending") {
      return { valid: false as const, status: invite?.status ?? "unknown" };
    }
    return {
      valid: true as const,
      status: "pending" as const,
      practiceName: invite.practiceName,
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt,
    };
  });

// ---------------------------------------------------------------------------
// acceptPracticeInviteFn — signed in
// ---------------------------------------------------------------------------
export const acceptPracticeInviteFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { token?: unknown })
  .handler(async ({ data }) => {
    const { user } = await requireSession();
    const token = typeof data?.token === "string" ? data.token : "";
    const db = await import("~/db/practice-members");

    const invite = await db.getInviteByToken(token);
    if (!invite || invite.status !== "pending") {
      const reason = invite?.status === "used" ? "used" : invite?.status === "expired" ? "expired" : "invalid";
      return {
        ok: false as const,
        reason: reason as "invalid" | "used" | "expired",
        error:
          reason === "used"
            ? "This invite has already been used. Ask for a new one."
            : reason === "expired"
              ? "This invite has expired. Ask for a new one."
              : "This invite is no longer valid.",
      };
    }

    // An invite grants access to client records, so it is bound to the address
    // it was issued for: a forwarded link must not hand the wrong person a seat.
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return {
        ok: false as const,
        reason: "email_mismatch" as const,
        error:
          `This invite was issued for ${invite.email}. ` +
          `You are signed in as ${user.email}. ` +
          `Sign in with the invited address, or ask a practice owner to invite ${user.email}.`,
      };
    }

    return db.acceptInvite(token, user.id, user.email);
  });
