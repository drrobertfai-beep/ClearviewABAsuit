// ============================================================================
// Treatment plan — authorization request shape
// ============================================================================
//
// Shared by the editor, the read-only view, the PDF generator and the demo
// seed. This module is deliberately pure (no db, no node built-ins) so it can
// be imported from client components and server code alike.
//
// BACKWARD COMPATIBILITY
// ----------------------
// `requested_services` and `therapy_schedule` are jsonb columns that predate
// the authorization fields. Plans written before this change hold:
//
//   requested_services: { service_name, cpt_code, frequency, duration,
//                         hours_per_week? }[]
//   therapy_schedule:   { day, time, location, service_type }[]
//
// (the column default is even `'{}'::jsonb`, an object rather than an array).
// Every read goes through `normalizeServiceLines` / `normalizeSchedule`, which
// accept both shapes and always return the new one. Writes always persist the
// new shape, so a plan is migrated the next time it is saved.

export const CPT_CODES = [
  { code: "97151", label: "Behavior identification assessment" },
  { code: "97152", label: "Behavior identification supporting assessment" },
  { code: "97153", label: "Adaptive behavior treatment by protocol" },
  { code: "97154", label: "Group adaptive behavior treatment by protocol" },
  { code: "97155", label: "Adaptive behavior treatment with protocol modification" },
  { code: "97156", label: "Family adaptive behavior treatment guidance" },
  { code: "97157", label: "Multiple-family group adaptive behavior treatment" },
  { code: "97158", label: "Group adaptive behavior treatment with protocol modification" },
  { code: "0362T", label: "Behavior identification supporting assessment (each 15 min)" },
  { code: "0373T", label: "Adaptive behavior treatment with protocol modification (each 15 min)" },
] as const;

export type CptCode = (typeof CPT_CODES)[number]["code"];

export const SERVICE_SETTINGS = [
  "home",
  "school",
  "clinic",
  "community",
  "telehealth",
] as const;
export type ServiceSetting = (typeof SERVICE_SETTINGS)[number];

export const PROVIDER_TYPES = [
  "BCBA",
  "BCaBA",
  "RBT",
  "Parent/Caregiver Training",
] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** One requested-service line: what we are asking the payer to authorize. */
export interface ServiceLine {
  /** CPT code as text — one of CPT_CODES, or a free-typed code via "Other". */
  cpt_code: string;
  /** Human-readable service description. */
  service_name: string;
  /** Authorized hours per week for this line. */
  hours_per_week: number | null;
  /** Typical session length in minutes. */
  session_duration_minutes: number | null;
  setting: ServiceSetting | "";
  provider_type: ProviderType | "";
}

/** One row of the weekly therapy schedule. */
export interface ScheduleEntry {
  day: string;
  start_time: string;
  end_time: string;
  /** Service delivered in this block (CPT code or description). */
  service: string;
  setting: ServiceSetting | "";
  provider: string;
}

// ---------------------------------------------------------------------------
// Small parsing helpers
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Pulls an array out of a jsonb value that may be an array, a JSON string, the
 * legacy `{}` default, or `{ entries: [...] }`. Returns [] for anything else.
 */
function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      return asArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  const rec = asRecord(value);
  if (rec) {
    if (Array.isArray(rec.entries)) return rec.entries;
    if (Array.isArray(rec.services)) return rec.services;
    // A day-keyed object ({ monday: [{ time, type, location }], ... }) was
    // written by the earliest seed script. Flatten it, stamping the day.
    const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
    const flat: unknown[] = [];
    for (const day of days) {
      const rows = rec[day];
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const r = asRecord(row);
          flat.push(r ? { day: day.charAt(0).toUpperCase() + day.slice(1), ...r } : row);
        }
      }
    }
    if (flat.length > 0) return flat;
  }
  return [];
}

/**
 * Coerces a stored value to one of SERVICE_SETTINGS. Legacy plans used free
 * text for the location ("Home", "Clinic", "In-home"), so anything we do not
 * recognize becomes "" rather than being shown as a fake setting.
 */
export function toSetting(value: string): ServiceSetting | "" {
  const v = value.trim().toLowerCase();
  if (!v) return "";
  if ((SERVICE_SETTINGS as readonly string[]).includes(v)) {
    return v as ServiceSetting;
  }
  if (v.includes("home")) return "home";
  if (v.includes("school")) return "school";
  if (v.includes("clinic")) return "clinic";
  if (v.includes("community")) return "community";
  if (v.includes("telehealth") || v.includes("virtual")) return "telehealth";
  return "";
}

/**
 * Minutes from a legacy free-text duration ("2 hours", "90 minutes", "1.5 hrs").
 */
export function parseDurationMinutes(text: string): number | null {
  const m = text.trim().match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = m[2].toLowerCase();
  return unit.startsWith("h") ? Math.round(value * 60) : Math.round(value);
}

/** Sessions per week from a legacy frequency string ("5x/week", "2 per week"). */
function parseSessionsPerWeek(text: string): number | null {
  const m = text.trim().match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Normalizers (read path — tolerant of every historical shape)
// ---------------------------------------------------------------------------

export function normalizeServiceLines(raw: unknown): ServiceLine[] {
  return asArray(raw)
    .map((item): ServiceLine | null => {
      const r = asRecord(item);
      if (!r) return null;
      const legacyDuration = str(r.duration);
      const legacyFrequency = str(r.frequency);

      let hours = num(r.hours_per_week);
      let minutes = num(r.session_duration_minutes);
      if (minutes == null) minutes = parseDurationMinutes(legacyDuration);
      if (hours == null) {
        // Derive hours/week from "5x/week" + "2 hours" when the old plan only
        // had free text. Better than showing an empty total for old plans.
        const sessions = parseSessionsPerWeek(legacyFrequency);
        if (sessions != null && minutes != null) {
          hours = Math.round((sessions * minutes * 10) / 60) / 10;
        }
      }

      return {
        cpt_code: str(r.cpt_code),
        service_name: str(r.service_name),
        hours_per_week: hours,
        session_duration_minutes: minutes,
        setting: toSetting(str(r.setting)),
        provider_type: (str(r.provider_type) as ProviderType) || "",
      } satisfies ServiceLine;
    })
    .filter((line): line is ServiceLine => line !== null);
}

export function normalizeSchedule(raw: unknown): ScheduleEntry[] {
  return asArray(raw)
    .map((item): ScheduleEntry | null => {
      const r = asRecord(item);
      if (!r) return null;
      // Legacy rows had a single free-text `time` and a `location` field.
      // Legacy rows had one free-text `time` holding a range:
      // "9:00 AM – 12:00 PM". Split it so the duration still computes.
      const legacyTime = str(r.time);
      let start = str(r.start_time);
      let end = str(r.end_time);
      if (!start && legacyTime) {
        const parts = legacyTime.split(/\s*[–—-]\s*/);
        start = parts[0] ?? "";
        end = parts[1] ?? "";
      }
      return {
        day: str(r.day),
        start_time: start,
        end_time: end,
        service: str(r.service) || str(r.service_type),
        setting: toSetting(str(r.setting) || str(r.location)),
        provider: str(r.provider),
      } satisfies ScheduleEntry;
    })
    .filter((entry): entry is ScheduleEntry => entry !== null);
}

// ---------------------------------------------------------------------------
// Computed totals
// ---------------------------------------------------------------------------

/** Total authorized hours per week across every service line. */
export function totalHoursPerWeek(lines: ServiceLine[]): number {
  const total = lines.reduce((sum, line) => sum + (line.hours_per_week ?? 0), 0);
  return Math.round(total * 10) / 10;
}

/** Duration of a schedule block in minutes; 0 when the times are unusable. */
export function scheduleDurationMinutes(entry: ScheduleEntry): number {
  const start = toMinutes(entry.start_time);
  const end = toMinutes(entry.end_time);
  if (start == null || end == null) return 0;
  const diff = end - start;
  return diff > 0 ? diff : 0;
}

/** "09:30" / "9:30 AM" -> minutes since midnight. */
export function toMinutes(value: string): number | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const suffix = m[3]?.toLowerCase();
  if (suffix === "pm" && hours < 12) hours += 12;
  if (suffix === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Total scheduled hours per week across the grid. */
export function scheduledHoursPerWeek(entries: ScheduleEntry[]): number {
  const total = entries.reduce(
    (sum, entry) => sum + scheduleDurationMinutes(entry),
    0,
  );
  return Math.round((total / 60) * 10) / 10;
}

export function formatDuration(minutes: number): string {
  if (!minutes) return "—";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr${hours === 1 ? "" : "s"}`;
  return `${hours} hr ${mins} min`;
}

export function formatHours(hours: number): string {
  return `${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)} hrs/wk`;
}

/** Label for a CPT code — falls back to the typed code itself. */
export function cptLabel(code: string): string {
  const match = CPT_CODES.find((c) => c.code === code);
  return match ? match.label : "";
}

export function isKnownCpt(code: string): boolean {
  return CPT_CODES.some((c) => c.code === code);
}

/** Day ordering for the schedule table, tolerant of unknown values. */
export function dayRank(day: string): number {
  const idx = WEEK_DAYS.findIndex(
    (d) => d.toLowerCase() === day.trim().toLowerCase(),
  );
  return idx === -1 ? WEEK_DAYS.length : idx;
}

export function sortSchedule(entries: ScheduleEntry[]): ScheduleEntry[] {
  return [...entries].sort((a, b) => {
    const byDay = dayRank(a.day) - dayRank(b.day);
    if (byDay !== 0) return byDay;
    return (toMinutes(a.start_time) ?? 0) - (toMinutes(b.start_time) ?? 0);
  });
}

// ---------------------------------------------------------------------------
// Authorization period
// ---------------------------------------------------------------------------

/** Formats a DATE column ("2026-11-01") without timezone drift. */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  const iso = value.slice(0, 10);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Whole weeks covered by the authorization period, or null if incomplete. */
export function authorizationWeeks(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const s = new Date(`${start.slice(0, 10)}T00:00:00Z`).getTime();
  const e = new Date(`${end.slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return Math.round(((e - s) / 86400000 / 7) * 10) / 10;
}
