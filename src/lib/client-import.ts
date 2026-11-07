// ClearView ABA Suite — client CSV import: field model, mapping + validation
//
// Pure functions only (no DOM, no database) so the exact same rules run in the
// browser preview and again inside the server function that writes the rows.
// The server run is the authoritative one — nothing the client computed is
// trusted at commit time.

import type { Client } from "~/db/types";

/** Largest file we accept, in bytes. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
/** Largest number of data rows we accept in one import. */
export const MAX_IMPORT_ROWS = 2000;

export type ImportFieldKey =
  | "name"
  | "date_of_birth"
  | "gender"
  | "contact_email"
  | "contact_phone"
  | "address"
  | "referral_source"
  | "diagnoses"
  | "setting"
  | "insurance_info"
  | "privacy_notes";

export type ClientSetting = "home" | "school" | "clinic" | "other";

export const SETTING_VALUES: ClientSetting[] = [
  "home",
  "school",
  "clinic",
  "other",
];

export interface ImportFieldDef {
  key: ImportFieldKey;
  label: string;
  hint: string;
  required: boolean;
  /** Header names that usually supply this field, already normalised. */
  aliases: string[];
  maxLength: number;
}

/** Target fields, in the order they appear in the mapping UI. */
export const IMPORT_FIELDS: ImportFieldDef[] = [
  {
    key: "name",
    label: "Client name",
    hint: "Required. Everything else can be left unmapped.",
    required: true,
    aliases: [
      "name",
      "client",
      "clientname",
      "fullname",
      "clientfullname",
      "lastfirst",
      "lastnamefirst",
      "firstlast",
      "firstnamelastname",
      "lastnamefirstname",
      "student",
      "studentname",
      "child",
      "childname",
      "patient",
      "patientname",
      "caseloadname",
    ],
    maxLength: 200,
  },
  {
    key: "date_of_birth",
    label: "Date of birth",
    hint: "YYYY-MM-DD, MM/DD/YYYY or M/D/YY.",
    required: false,
    aliases: [
      "dob",
      "dateofbirth",
      "birthdate",
      "birthday",
      "birth",
      "dateofbirthmmddyyyy",
      "clientdob",
    ],
    maxLength: 20,
  },
  {
    key: "gender",
    label: "Gender",
    hint: "Free text.",
    required: false,
    aliases: ["gender", "sex", "clientgender"],
    maxLength: 40,
  },
  {
    key: "contact_email",
    label: "Contact email",
    hint: "Parent / guardian email.",
    required: false,
    aliases: [
      "email",
      "emailaddress",
      "contactemail",
      "parentemail",
      "guardianemail",
      "caregiveremail",
      "primaryemail",
    ],
    maxLength: 200,
  },
  {
    key: "contact_phone",
    label: "Contact phone",
    hint: "Parent / guardian phone.",
    required: false,
    aliases: [
      "phone",
      "phonenumber",
      "contactphone",
      "telephone",
      "tel",
      "mobile",
      "cell",
      "cellphone",
      "parentphone",
      "guardianphone",
      "homephone",
    ],
    maxLength: 40,
  },
  {
    key: "address",
    label: "Address",
    hint: "Mailing or home address.",
    required: false,
    aliases: [
      "address",
      "streetaddress",
      "homeaddress",
      "mailingaddress",
      "clientaddress",
      "addressline1",
    ],
    maxLength: 400,
  },
  {
    key: "referral_source",
    label: "Referral source",
    hint: "Who referred the client.",
    required: false,
    aliases: [
      "referral",
      "referralsource",
      "referredby",
      "referralsource",
      "source",
      "referralagency",
    ],
    maxLength: 200,
  },
  {
    key: "diagnoses",
    label: "Diagnoses",
    hint: "Separate multiple diagnoses with a semicolon.",
    required: false,
    aliases: [
      "diagnosis",
      "diagnoses",
      "dx",
      "dxcode",
      "dxcodes",
      "icd10",
      "icd10code",
      "icdcode",
      "primarydiagnosis",
      "diagnosiscode",
    ],
    maxLength: 500,
  },
  {
    key: "setting",
    label: "Service setting",
    hint: "home, school, clinic or other.",
    required: false,
    aliases: [
      "setting",
      "servicesetting",
      "servicelocation",
      "location",
      "environment",
      "servicesite",
    ],
    maxLength: 20,
  },
  {
    key: "insurance_info",
    label: "Insurance",
    hint: "Payer / funder name.",
    required: false,
    aliases: [
      "insurance",
      "insuranceinfo",
      "insuranceprovider",
      "insurancename",
      "payer",
      "payername",
      "fundingsource",
      "funding",
    ],
    maxLength: 200,
  },
  {
    key: "privacy_notes",
    label: "Privacy notes",
    hint: "Internal notes kept with the client record.",
    required: false,
    aliases: [
      "privacynotes",
      "notes",
      "note",
      "privatenotes",
      "internalnotes",
      "comments",
      "comment",
    ],
    maxLength: 1000,
  },
];

export const FIELD_BY_KEY: Record<ImportFieldKey, ImportFieldDef> =
  Object.fromEntries(IMPORT_FIELDS.map((f) => [f.key, f])) as Record<
    ImportFieldKey,
    ImportFieldDef
  >;

export function fieldLabel(key: string): string {
  if (key === "row") return "Row";
  const def = FIELD_BY_KEY[key as ImportFieldKey];
  return def ? def.label : key;
}

/** A CSV column index for each target field we could map. */
export type ColumnMapping = Partial<Record<ImportFieldKey, number>>;

/** One CSV data row after the mapping has been applied (raw strings). */
export interface ImportRowInput {
  /** 1-based line number in the original file, header included. */
  rowNumber: number;
  values: Partial<Record<ImportFieldKey, string>>;
}

export interface RowError {
  /** Target field the value came from, or "row" for a whole-row problem. */
  field: ImportFieldKey | "row";
  message: string;
  /** The offending value, echoed back for display only (never logged). */
  value?: string;
}

/** Normalised client fields ready to insert. */
export interface ClientImportData {
  name: string;
  date_of_birth: string | null;
  gender: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  referral_source: string | null;
  diagnoses: string[];
  setting: ClientSetting | null;
  insurance_info: Record<string, unknown>;
  privacy_notes: string | null;
}

export interface ValidatedRow {
  rowNumber: number;
  data: ClientImportData | null;
  errors: RowError[];
}

// ---------------------------------------------------------------------------
// Header → field mapping
// ---------------------------------------------------------------------------

/** Lowercase, letters and digits only: "Date of Birth" → "dateofbirth". */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Headers that look like a name column but are somebody else's name. Without
 * this, "Parent Name" would be guessed as the client name.
 */
const NOT_A_CLIENT_NAME = [
  "parent",
  "guardian",
  "caregiver",
  "mother",
  "father",
  "emergency",
  "provider",
  "clinician",
  "referrer",
  "insurance",
  "payer",
  "staff",
  "contact",
];

function looksLikeOtherPersonsName(normalized: string): boolean {
  return NOT_A_CLIENT_NAME.some((word) => normalized.includes(word));
}

/**
 * Score how well a header name matches a field: 2 = exact alias, 1 = partial,
 * 0 = no match. Every alias is compared normalised.
 */
function scoreHeader(header: string, def: ImportFieldDef): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  if (def.aliases.includes(h)) return 2;
  if (def.key === "name" && looksLikeOtherPersonsName(h)) return 0;

  let best = 0;
  for (const alias of def.aliases) {
    if (alias.length < 4) continue;
    if (h.includes(alias) || (h.length >= 4 && alias.includes(h))) {
      best = 1;
      break;
    }
  }
  return best;
}

/**
 * Guess which CSV column supplies which field. Exact alias matches win over
 * partial ones, and no column is used for two fields.
 */
export function guessMapping(headers: string[]): ColumnMapping {
  const candidates: { key: ImportFieldKey; column: number; score: number }[] =
    [];

  for (const def of IMPORT_FIELDS) {
    headers.forEach((header, column) => {
      const score = scoreHeader(header, def);
      if (score > 0) candidates.push({ key: def.key, column, score });
    });
  }

  candidates.sort((a, b) => b.score - a.score);

  const mapping: ColumnMapping = {};
  const usedColumns = new Set<number>();
  for (const candidate of candidates) {
    if (mapping[candidate.key] !== undefined) continue;
    if (usedColumns.has(candidate.column)) continue;
    mapping[candidate.key] = candidate.column;
    usedColumns.add(candidate.column);
  }
  return mapping;
}

/** Apply a mapping to one raw CSV row, producing field-keyed values. */
export function applyMapping(
  row: string[],
  mapping: ColumnMapping,
): Partial<Record<ImportFieldKey, string>> {
  const values: Partial<Record<ImportFieldKey, string>> = {};
  for (const def of IMPORT_FIELDS) {
    const column = mapping[def.key];
    if (column === undefined || column < 0) continue;
    const raw = row[column];
    if (raw === undefined) continue;
    const trimmed = raw.trim();
    if (trimmed === "") continue;
    values[def.key] = trimmed;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Value parsing / validation
// ---------------------------------------------------------------------------

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

export interface DobResult {
  iso: string | null;
  error?: string;
}

/**
 * Parse a date of birth. Accepts YYYY-MM-DD, MM/DD/YYYY and M/D/YY (plus the
 * same shapes with dashes for the US order, which is what spreadsheets hand
 * over when someone types 5-4-19).
 */
export function parseDateOfBirth(raw: string | undefined): DobResult {
  if (!raw || !raw.trim()) return { iso: null };
  const value = raw.trim();

  let year: number, month: number, day: number;

  const isoMatch = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const usMatch = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (usMatch) {
    month = Number(usMatch[1]);
    day = Number(usMatch[2]);
    const y = usMatch[3];
    year = y.length === 2 ? (Number(y) <= 68 ? 2000 + Number(y) : 1900 + Number(y)) : Number(y);
  } else {
    return {
      iso: null,
      error: "Date of birth is not a date we can read (use YYYY-MM-DD or MM/DD/YYYY).",
    };
  }

  if (!isRealDate(year, month, day)) {
    return { iso: null, error: "Date of birth is not a real calendar date." };
  }

  const now = new Date();
  if (year < 1900) {
    return { iso: null, error: "Date of birth is before 1900." };
  }
  const candidate = Date.UTC(year, month - 1, day);
  if (candidate > Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) {
    return { iso: null, error: "Date of birth is in the future." };
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return { iso: `${year}-${pad(month)}-${pad(day)}` };
}

/** Rough but useful email shape check — enough to catch typos, not to gatekeep. */
export function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** "Home " / "IN-HOME" → "home"; unknown values stay unknown (null + error). */
export function parseSetting(raw: string | undefined): {
  setting: ClientSetting | null;
  error?: string;
} {
  if (!raw || !raw.trim()) return { setting: null };
  const value = raw.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (value === "in home" || value === "home based") return { setting: "home" };
  if (value === "school based" || value === "in school") return { setting: "school" };
  if (value === "center" || value === "centre" || value === "clinic based") {
    return { setting: "clinic" };
  }
  if (SETTING_VALUES.includes(value as ClientSetting)) {
    return { setting: value as ClientSetting };
  }
  return {
    setting: null,
    error: "Service setting must be home, school, clinic or other.",
  };
}

/** Split a diagnoses cell into a list ("ASD; ADHD" → ["ASD", "ADHD"]). */
export function splitDiagnoses(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;|]|\s,\s|,(?=\s)|,(?=\S)/)
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .slice(0, 25);
}

// ---------------------------------------------------------------------------
// Row validation
// ---------------------------------------------------------------------------

/** Validate one mapped row into insertable client data (or a list of errors). */
export function validateRow(row: ImportRowInput): ValidatedRow {
  const errors: RowError[] = [];
  const v = row.values ?? {};

  const tooLong = (key: ImportFieldKey) => {
    const def = FIELD_BY_KEY[key];
    const value = v[key];
    if (value && value.length > def.maxLength) {
      errors.push({
        field: key,
        message: `${def.label} is longer than ${def.maxLength} characters.`,
        value: value.slice(0, 60) + (value.length > 60 ? "…" : ""),
      });
      return true;
    }
    return false;
  };

  // name — the only required field
  const name = (v.name ?? "").trim();
  if (!name) {
    errors.push({
      field: "name",
      message: "Client name is required and this row has none.",
    });
  } else {
    tooLong("name");
  }

  // date of birth
  const dob = parseDateOfBirth(v.date_of_birth);
  if (dob.error) {
    errors.push({ field: "date_of_birth", message: dob.error, value: v.date_of_birth });
  }

  // gender
  tooLong("gender");

  // email
  const email = (v.contact_email ?? "").trim();
  if (email && !isLikelyEmail(email)) {
    errors.push({
      field: "contact_email",
      message: "Contact email does not look like an email address.",
      value: email,
    });
  } else if (email) {
    tooLong("contact_email");
  }

  // phone / address / referral / notes — length only
  tooLong("contact_phone");
  tooLong("address");
  tooLong("referral_source");
  tooLong("privacy_notes");

  // setting
  const setting = parseSetting(v.setting);
  if (setting.error) {
    errors.push({ field: "setting", message: setting.error, value: v.setting });
  }

  // diagnoses
  tooLong("diagnoses");
  const diagnoses = splitDiagnoses(v.diagnoses);

  // insurance
  const insurance = (v.insurance_info ?? "").trim();
  if (insurance) tooLong("insurance_info");

  if (errors.length > 0) {
    return { rowNumber: row.rowNumber, data: null, errors };
  }

  return {
    rowNumber: row.rowNumber,
    errors: [],
    data: {
      name,
      date_of_birth: dob.iso,
      gender: (v.gender ?? "").trim() || null,
      contact_email: email || null,
      contact_phone: (v.contact_phone ?? "").trim() || null,
      address: (v.address ?? "").trim() || null,
      referral_source: (v.referral_source ?? "").trim() || null,
      diagnoses,
      setting: setting.setting,
      insurance_info: insurance ? { provider: insurance } : {},
      privacy_notes: (v.privacy_notes ?? "").trim() || null,
    },
  };
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

/**
 * Name+DOB key used for duplicate detection. Names are compared with
 * punctuation, case and word order removed, so "Smith, Jane" and "Jane Smith"
 * count as the same client; the DOB keeps genuinely different children apart.
 */
export function duplicateKey(name: string, dateOfBirth: string | null): string {
  const tokens = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort();
  return `${tokens.join(" ")}|${dateOfBirth ?? ""}`;
}

/** Key for a client already stored in the practice. */
export function clientDuplicateKey(client: Pick<Client, "name" | "date_of_birth">): string {
  const dob = client.date_of_birth
    ? String(client.date_of_birth).slice(0, 10)
    : null;
  return duplicateKey(client.name, dob);
}

// ---------------------------------------------------------------------------
// Request payload hardening (server side)
// ---------------------------------------------------------------------------

export interface SanitizedRows {
  rows: ImportRowInput[];
  error?: string;
}

/**
 * Coerce whatever the browser sent into a bounded list of rows. Guards against
 * a tampered request: only known fields survive, values are strings, and the
 * row count / value length are capped.
 */
export function sanitizeImportRows(raw: unknown): SanitizedRows {
  if (!Array.isArray(raw)) {
    return { rows: [], error: "No rows were received." };
  }
  if (raw.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      error: `This import has more than ${MAX_IMPORT_ROWS} rows. Split the file and import it in parts.`,
    };
  }

  const rows: ImportRowInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const rowNumber =
      typeof record.rowNumber === "number" && Number.isFinite(record.rowNumber)
        ? Math.trunc(record.rowNumber)
        : rows.length + 2;
    const rawValues = record.values;
    const values: Partial<Record<ImportFieldKey, string>> = {};
    if (rawValues && typeof rawValues === "object") {
      for (const def of IMPORT_FIELDS) {
        const value = (rawValues as Record<string, unknown>)[def.key];
        if (typeof value === "string") {
          // Cap hard before anything else touches the value.
          values[def.key] = value.slice(0, 5000);
        } else if (typeof value === "number" && Number.isFinite(value)) {
          values[def.key] = String(value);
        }
      }
    }
    rows.push({ rowNumber, values });
  }

  if (rows.length === 0) {
    return { rows: [], error: "No rows were received." };
  }
  return { rows };
}
