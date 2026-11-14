// ClearView ABA Suite — Reauthorization helpers
//
// A reauthorization is a treatment plan created from a prior plan. What links
// the two is the goal `id`: it lives inside each goal object in the goals jsonb
// column, so "this goal is the same goal as last period, and here is its
// progress" survives editing, saving and reloading.
//
// The rules this module enforces:
//   - An id is minted once per goal and never replaced. Minting a second id for
//     the same goal would break the link to the previous period.
//   - Progress is keyed by goal id, and a dropped goal keeps its progress
//     record (and its reason) even though it is no longer requested.
//   - The mastery criterion is the goal's own `measurement`. It is never
//     invented here: mastery varies by skill level and lives per goal.

/** Where a carried-forward goal got to during the prior authorization period. */
export const GOAL_PROGRESS_STATUSES = [
  "mastered",
  "progressing",
  "stalled",
  "discontinued",
] as const;
export type GoalProgressStatus = (typeof GOAL_PROGRESS_STATUSES)[number];

const STATUS_LABELS: Record<GoalProgressStatus, string> = {
  mastered: "Mastered",
  progressing: "Progressing",
  stalled: "Stalled",
  discontinued: "Discontinued",
};

export function goalProgressStatusLabel(status: string): string {
  return STATUS_LABELS[status as GoalProgressStatus] ?? status;
}

/** A skill-acquisition (or behavior reduction) goal carrying its stable id. */
export interface GoalWithId {
  id: string;
  domain: string;
  description: string;
  measurement: string;
  baseline: string;
  target: string;
  target_date: string;
  [key: string]: unknown;
}

/**
 * One goal's progress record for the reauthorization. `dropped` is the explicit
 * "not requested for the new period" action — the record (and `drop_reason`)
 * stays on the plan so the decision is on file.
 */
export interface GoalProgress {
  goal_id: string;
  baseline: string;
  current: string;
  status: GoalProgressStatus;
  note: string;
  dropped: boolean;
  drop_reason: string;
}

/** v4 uuid, from Web Crypto where available. */
export function newGoalId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[((Math.random() * 4) | 0) + 8];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Reads a goals jsonb column and guarantees every goal has a stable id.
 *
 * Goals written before ids existed keep their fields and gain one; goals that
 * already have an id are returned untouched. `minted` is the number of new ids,
 * which is what the migration and the create path use to decide whether the
 * row needs writing back.
 */
export function ensureGoalIds(raw: unknown): {
  goals: GoalWithId[];
  minted: number;
} {
  let minted = 0;
  const goals: GoalWithId[] = [];
  for (const entry of asArray(raw)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const goal = { ...(entry as Record<string, unknown>) };
    const existing = typeof goal.id === "string" ? goal.id.trim() : "";
    if (!existing) {
      goal.id = newGoalId();
      minted += 1;
    } else {
      goal.id = existing;
    }
    goals.push({
      ...goal,
      id: goal.id as string,
      domain: asText(goal.domain),
      description: asText(goal.description),
      measurement: asText(goal.measurement),
      baseline: asText(goal.baseline),
      target: asText(goal.target),
      target_date: asText(goal.target_date),
    });
  }
  return { goals, minted };
}

/**
 * Normalizes `treatment_plans.goal_progress` (jsonb). Entries without a goal id
 * cannot be matched to anything, so they are dropped rather than rendered.
 */
export function normalizeGoalProgress(raw: unknown): GoalProgress[] {
  const out: GoalProgress[] = [];
  const seen = new Set<string>();
  for (const entry of asArray(raw)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    const goalId = asText(rec.goal_id).trim();
    if (!goalId || seen.has(goalId)) continue;
    seen.add(goalId);
    const status = asText(rec.status);
    out.push({
      goal_id: goalId,
      baseline: asText(rec.baseline),
      current: asText(rec.current),
      status: (GOAL_PROGRESS_STATUSES as readonly string[]).includes(status)
        ? (status as GoalProgressStatus)
        : "progressing",
      note: asText(rec.note),
      dropped: rec.dropped === true,
      drop_reason: asText(rec.drop_reason),
    });
  }
  return out;
}

/** The progress record for one goal, if one was recorded. */
export function progressFor(
  progress: GoalProgress[],
  goalId: string,
): GoalProgress | undefined {
  return progress.find((p) => p.goal_id === goalId);
}

/** Goals still being requested — i.e. not explicitly dropped. */
export function requestedGoals(
  goals: GoalWithId[],
  progress: GoalProgress[],
): GoalWithId[] {
  return goals.filter((g) => !progressFor(progress, g.id)?.dropped);
}

/** Goals explicitly dropped from this request, with their reason on file. */
export function droppedGoals(
  goals: GoalWithId[],
  progress: GoalProgress[],
): { goal: GoalWithId; record: GoalProgress }[] {
  const out: { goal: GoalWithId; record: GoalProgress }[] = [];
  for (const goal of goals) {
    const record = progressFor(progress, goal.id);
    if (record?.dropped) out.push({ goal, record });
  }
  return out;
}
