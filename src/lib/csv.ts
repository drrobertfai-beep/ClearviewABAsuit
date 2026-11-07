// ClearView ABA Suite — minimal, dependency-free CSV reader
//
// Used by the client-import flow (browser preview) and re-used on the server so
// both sides agree on what a file means. Handles the things real-world caseload
// exports contain: a UTF-8 BOM, CRLF or CR line endings, quoted fields with
// embedded commas / newlines, and doubled quotes as an escape.
//
// It deliberately does NOT try to be clever: no type coercion, no header
// normalisation, no delimiter guessing beyond the first line.

/** Thrown when the text cannot be read as CSV. Message is safe to show a user. */
export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

export interface ParsedCsv {
  /** Header cells, trimmed of surrounding whitespace. Never empty. */
  headers: string[];
  /** Data rows. A row may be shorter than `headers` (missing trailing cells). */
  rows: string[][];
  /** Delimiter that was detected and used. */
  delimiter: string;
}

const DELIMITERS = [",", ";", "\t", "|"] as const;

/**
 * Pick the delimiter by counting candidates outside quotes on the first line.
 * Excel on a European locale writes `;`, and pasting out of a spreadsheet can
 * produce tabs, so neither is exotic enough to reject.
 */
function detectDelimiter(text: string): string {
  const firstBreak = text.search(/\r\n|\n|\r/);
  const firstLine = firstBreak === -1 ? text : text.slice(0, firstBreak);

  let best = ",";
  let bestCount = 0;
  for (const candidate of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const ch = firstLine[i];
      if (ch === '"') {
        if (inQuotes && firstLine[i + 1] === '"') i++;
        else inQuotes = !inQuotes;
      } else if (ch === candidate && !inQuotes) {
        count++;
      }
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parse CSV text into headers + data rows.
 *
 * Throws {@link CsvParseError} with a user-facing message when the text is not
 * CSV at all (empty file, unterminated quote). Never throws a raw stack trace
 * at the caller.
 */
export function parseCsv(input: string): ParsedCsv {
  let text = input;
  // Strip a UTF-8 BOM — Excel writes one and it would otherwise become part of
  // the first header name.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  if (!text.trim()) {
    throw new CsvParseError(
      "This file is empty. Export your caseload as CSV and try again.",
    );
  }

  const delimiter = detectDelimiter(text);

  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = () => {
    record.push(fieldWasQuoted ? field : field.trim());
    field = "";
    fieldWasQuoted = false;
  };
  const endRecord = () => {
    endField();
    // Drop rows that are entirely empty (trailing newline, blank separator).
    if (record.some((cell) => cell.trim() !== "")) records.push(record);
    record = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field.trim() === "") {
      // Opening quote — only meaningful at the start of a field.
      inQuotes = true;
      fieldWasQuoted = true;
      field = "";
      continue;
    }

    if (ch === delimiter) {
      endField();
      continue;
    }

    if (ch === "\r") {
      // CRLF or a lone CR both end the record.
      if (text[i + 1] === "\n") i++;
      endRecord();
      continue;
    }

    if (ch === "\n") {
      endRecord();
      continue;
    }

    field += ch;
  }

  if (inQuotes) {
    throw new CsvParseError(
      "This file has an unclosed quotation mark, so it could not be read as CSV. Fix the quoted cell and try again.",
    );
  }

  if (field !== "" || record.length > 0) endRecord();

  if (records.length === 0) {
    throw new CsvParseError(
      "This file is empty. Export your caseload as CSV and try again.",
    );
  }

  const headers = records[0].map((h, index) =>
    h.trim() === "" ? `Column ${index + 1}` : h.trim(),
  );
  if (headers.length === 0) {
    throw new CsvParseError("This file has no header row.");
  }

  return { headers, rows: records.slice(1), delimiter };
}
