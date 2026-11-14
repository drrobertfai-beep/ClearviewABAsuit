// ClearView ABA Suite — Practice switcher server functions
//
// One login can work across several practices. The choice is stored on the
// SESSION (`sessions.active_practice_id`), not on the user, so two devices can
// sit in different practices and a removed membership is dropped automatically
// on the next request (see getActiveMembership in ~/db/practices).
//
// The caller's practice is still never accepted from the client: `switchPracticeFn`
// only *verifies* the requested practice against practice_members and records the
// choice on the caller's own session. Every other handler keeps reading the
// practice from the session via requireSession().
//
// Server-only DB modules are imported lazily inside each handler (see the note at
// the top of ~/server/auth.ts) so nothing reaches the browser bundle.

import { createServerFn } from "@tanstack/react-start";
import { requireSession } from "~/server/auth-guard";
import type { PracticeRole } from "~/db/types";

/** One entry in the header switcher. */
export interface SwitchablePractice {
  practiceId: string;
  practiceName: string;
  practiceRole: PracticeRole;
}

export interface PracticeSwitcherPayload {
  /** Practice the current session is acting in (null when signed out). */
  activePracticeId: string | null;
  practices: SwitchablePractice[];
}

/**
 * getPracticeSwitcherFn — what the header needs to render the switcher.
 *
 * Returns an empty list when signed out, and the UI only shows a switcher when
 * there is more than one entry, so a single-practice account sees nothing.
 */
export const getPracticeSwitcherFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PracticeSwitcherPayload> => {
    let ctx;
    try {
      ctx = await requireSession();
    } catch {
      return { activePracticeId: null, practices: [] };
    }

    const { listPracticesForUser } = await import("~/db/practices");
    const rows = await listPracticesForUser(ctx.user.id);

    return {
      activePracticeId: ctx.practiceId,
      practices: rows.map((p) => ({
        practiceId: p.practiceId,
        practiceName: p.practiceName,
        practiceRole: p.practiceRole,
      })),
    };
  },
);

/**
 * switchPracticeFn — move this session into another practice.
 *
 * Refuses any practice where the caller has no ACTIVE membership. The refusal
 * is the same message for "no such practice" and "not a member", so the endpoint
 * never reveals whether a practice exists. Roles are never changed here: the
 * role in the new practice is whatever the membership says, and every subsequent
 * request re-reads it (requirePracticeRole therefore applies in the new practice).
 */
export const switchPracticeFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { practiceId?: unknown })
  .handler(async ({ data }) => {
    const ctx = await requireSession();
    const requested = typeof data?.practiceId === "string" ? data.practiceId : "";

    const practicesDb = await import("~/db/practices");
    const memberships = await practicesDb.listPracticesForUser(ctx.user.id);

    const target = memberships.find((p) => p.practiceId === requested);
    if (!requested || !target) {
      // Deliberately identical for "unknown practice" and "not a member".
      throw new Error("Practice not found.");
    }

    const { setSessionActivePractice } = await import("~/db/auth");
    await setSessionActivePractice(ctx.sessionId, target.practiceId);

    // Audit the switch against the practice being LEFT (the context the action
    // was authorised in). Ids and names only — no client data.
    const previous = memberships.find((p) => p.practiceId === ctx.practiceId);
    const { auditChange } = await import("~/db/audit");
    await auditChange(
      ctx.practiceId,
      "sessions",
      ctx.sessionId,
      "UPDATE",
      ctx.user.id,
      previous
        ? { activePracticeId: previous.practiceId, activePracticeName: previous.practiceName }
        : null,
      {
        activePracticeId: target.practiceId,
        activePracticeName: target.practiceName,
      },
    );

    return {
      ok: true as const,
      practiceId: target.practiceId,
      practiceName: target.practiceName,
      practiceRole: target.practiceRole,
    };
  });
