// Client CSV import — /clients/import
//
// Three steps: pick a file, map its columns onto client fields, then review and
// import. Nothing is written until the final button; the review step is a real
// server-side validation pass (same rules as the commit) so the counts shown
// before importing are the counts that happen.
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { importClientsFn, previewClientImportFn } from "~/server/clients";
import { CsvParseError, parseCsv } from "~/lib/csv";
import {
  IMPORT_FIELDS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  applyMapping,
  fieldLabel,
  guessMapping,
  validateRow,
} from "~/lib/client-import";
import type {
  ColumnMapping,
  ImportRowInput,
  RowError,
} from "~/lib/client-import";

export const Route = createFileRoute("/clients/import")({
  component: ImportClientsPage,
});

interface PreviewAnalysis {
  totalRows: number;
  validRows: number;
  invalid: { rowNumber: number; errors: RowError[] }[];
  duplicates: { rowNumber: number; name: string }[];
  importable: number;
}

interface ImportResult {
  imported: number;
  totalRows: number;
  skippedDuplicates: { rowNumber: number; name: string }[];
  failed: { rowNumber: number; errors: RowError[] }[];
}

type Step = "upload" | "map" | "review" | "done";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImportClientsPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [preview, setPreview] = useState<PreviewAnalysis | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Rows as the server will receive them, with the current mapping applied.
  const mappedRows: ImportRowInput[] = useMemo(
    () =>
      rows.map((row, index) => ({
        rowNumber: index + 2, // header is row 1, as in a spreadsheet
        values: applyMapping(row, mapping),
      })),
    [rows, mapping],
  );

  // Local, instant validation for the mapping step (the server re-runs it).
  const localStatus = useMemo(
    () => mappedRows.map((row) => validateRow(row)),
    [mappedRows],
  );
  const localReady = localStatus.filter((r) => r.data !== null).length;
  const localProblem = localStatus.length - localReady;

  const reset = () => {
    setStep("upload");
    setFileName("");
    setFileSize(0);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setPreview(null);
    setResult(null);

    if (file.size > MAX_IMPORT_BYTES) {
      setError(
        `That file is ${formatBytes(file.size)}. The limit is 5 MB — split the file and import it in parts.`,
      );
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setError("That file could not be read. Try saving it as CSV and again.");
      return;
    }

    try {
      const parsed = parseCsv(text);
      if (parsed.rows.length > MAX_IMPORT_ROWS) {
        setError(
          `That file has ${parsed.rows.length} rows. The limit is ${MAX_IMPORT_ROWS} rows per import — split it and import the parts.`,
        );
        return;
      }
      setFileName(file.name);
      setFileSize(file.size);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(guessMapping(parsed.headers));
      setStep("map");
    } catch (err) {
      setError(
        err instanceof CsvParseError
          ? err.message
          : "That file could not be read as CSV. Check that it is a comma-separated text file.",
      );
    }
  };

  const runPreview = async () => {
    if (!mapping.name && mapping.name !== 0) {
      setError("Choose which column holds the client name before continuing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await previewClientImportFn({
        data: { rows: mappedRows },
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setPreview(response.analysis as PreviewAnalysis);
      setStep("review");
    } catch {
      setError(
        "We could not check this file just now. Please try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await importClientsFn({
        data: { rows: mappedRows, fileName, skipDuplicates },
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult({
        imported: response.imported,
        totalRows: response.totalRows,
        skippedDuplicates: response.skippedDuplicates,
        failed: response.failed,
      });
      setStep("done");
      // The client list is a route loader; mark it stale so the new clients are
      // there when the user lands back on it instead of after a background
      // refresh.
      void router.invalidate();
    } catch {
      setError(
        "The import did not finish. No clients were added — please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const duplicateCount = preview?.duplicates.length ?? 0;
  const willImport = preview
    ? skipDuplicates
      ? preview.importable
      : preview.validRows
    : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link
          to="/clients"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          Clients
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Import clients</h1>
        <p className="mt-1 text-sm text-gray-500">
          Load an existing caseload from a CSV file instead of adding clients one
          at a time. Nothing is saved until you confirm.
        </p>
      </div>

      {/* Step indicator */}
      <ol className="mb-6 flex flex-wrap items-center gap-2 text-xs font-medium text-gray-500">
        {(
          [
            ["upload", "1. Choose file"],
            ["map", "2. Map columns"],
            ["review", "3. Review & import"],
          ] as [Step, string][]
        ).map(([key, label], index) => {
          const order: Step[] = ["upload", "map", "review", "done"];
          const current = order.indexOf(step);
          const mine = order.indexOf(key);
          const state =
            step === "done" || mine < current
              ? "done"
              : mine === current
                ? "current"
                : "todo";
          return (
            <li key={key} className="flex items-center gap-2">
              {index > 0 && <span className="text-gray-300">→</span>}
              <span
                className={
                  state === "current"
                    ? "rounded-full bg-indigo-600 px-3 py-1 text-white"
                    : state === "done"
                      ? "rounded-full bg-indigo-50 px-3 py-1 text-indigo-700"
                      : "rounded-full bg-gray-100 px-3 py-1 text-gray-500"
                }
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <svg
            className="mt-0.5 h-4 w-4 flex-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m0 3.75h.008v.008H12v-.008ZM21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 1 — upload                                                     */}
      {/* ------------------------------------------------------------------ */}
      {step === "upload" && (
        <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5">
          <h2 className="text-sm font-semibold text-gray-900">
            Choose a CSV file
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Comma-separated (.csv) or plain text (.txt), up to 5 MB and{" "}
            {MAX_IMPORT_ROWS.toLocaleString()} clients per file.
          </p>

          <div className="mt-4">
            <label
              htmlFor="csv-file"
              className="block text-sm font-medium text-gray-700"
            >
              Caseload file
            </label>
            <input
              ref={fileInput}
              id="csv-file"
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              onChange={(event) => handleFile(event.target.files?.[0])}
              className="mt-1 block w-full cursor-pointer rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600 file:mr-4 file:rounded-md file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </div>

          <div className="mt-6 rounded-md bg-gray-50 p-4">
            <p className="text-sm font-medium text-gray-900">
              Not sure how to lay the file out?
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Only a client name column is required. Recognised columns include
              Client, DOB, Diagnosis, Setting, Referral and Insurance — headers
              are matched automatically and you can adjust them on the next step.
            </p>
            <a
              href="/sample-clients.csv"
              download="clearview-sample-clients.csv"
              className="mt-3 inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
                />
              </svg>
              Download a sample CSV
            </a>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 2 — map columns                                                */}
      {/* ------------------------------------------------------------------ */}
      {step === "map" && (
        <div className="space-y-6">
          <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Map the file&rsquo;s columns
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  {fileName} · {formatBytes(fileSize)} ·{" "}
                  {rows.length.toLocaleString()} row
                  {rows.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="self-start rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Choose a different file
              </button>
            </div>

            {rows.length === 0 && (
              <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This file has a header row but no client rows, so there is
                nothing to import. Add your clients below the header and try
                again.
              </div>
            )}

            {rows.length > 0 && (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {IMPORT_FIELDS.map((field) => {
                  const selected = mapping[field.key];
                  return (
                    <div key={field.key}>
                      <label
                        htmlFor={`map-${field.key}`}
                        className="block text-sm font-medium text-gray-700"
                      >
                        {field.label}
                        {field.required && (
                          <span className="ml-1 text-red-600" aria-hidden="true">
                            *
                          </span>
                        )}
                      </label>
                      <select
                        id={`map-${field.key}`}
                        value={selected === undefined ? "" : String(selected)}
                        onChange={(event) => {
                          const value = event.target.value;
                          setMapping((previous) => {
                            const next: ColumnMapping = { ...previous };
                            if (value === "") delete next[field.key];
                            else next[field.key] = Number(value);
                            return next;
                          });
                        }}
                        className="input mt-1"
                      >
                        <option value="">
                          {field.required
                            ? "— select a column —"
                            : "— not in this file —"}
                        </option>
                        {headers.map((header, index) => (
                          <option key={`${header}-${index}`} value={index}>
                            {header}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-500">{field.hint}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  Preview of the first {Math.min(10, rows.length)} row
                  {Math.min(10, rows.length) !== 1 ? "s" : ""}
                </h2>
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-gray-900">{localReady}</span>{" "}
                  ready
                  {localProblem > 0 && (
                    <>
                      {" · "}
                      <span className="font-medium text-amber-700">
                        {localProblem}
                      </span>{" "}
                      need attention
                    </>
                  )}
                </p>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">
                        Row
                      </th>
                      {IMPORT_FIELDS.filter(
                        (field) => mapping[field.key] !== undefined,
                      ).map((field) => (
                        <th
                          key={field.key}
                          className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500"
                        >
                          {field.label}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {mappedRows.slice(0, 10).map((row, index) => {
                      const status = localStatus[index];
                      return (
                        <tr key={row.rowNumber}>
                          <td className="px-3 py-2 text-gray-500">
                            {row.rowNumber}
                          </td>
                          {IMPORT_FIELDS.filter(
                            (field) => mapping[field.key] !== undefined,
                          ).map((field) => (
                            <td
                              key={field.key}
                              className="max-w-[220px] truncate px-3 py-2 text-gray-700"
                            >
                              {row.values[field.key] ?? "—"}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            {status && status.errors.length > 0 ? (
                              <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                Needs attention
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                                Ready
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {rows.length > 10 && (
                <p className="mt-2 text-xs text-gray-500">
                  Showing the first 10 of {rows.length.toLocaleString()} rows.
                  Every row is checked before anything is saved.
                </p>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={reset}
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runPreview}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                {busy ? "Checking…" : "Check rows"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3 — review                                                     */}
      {/* ------------------------------------------------------------------ */}
      {step === "review" && preview && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryTile
              label="Rows in file"
              value={preview.totalRows}
              tone="neutral"
            />
            <SummaryTile
              label="Ready to import"
              value={skipDuplicates ? preview.importable : preview.validRows}
              tone="good"
            />
            <SummaryTile
              label="Will be skipped or fail"
              value={
                (skipDuplicates ? duplicateCount : 0) + preview.invalid.length
              }
              tone={
                (skipDuplicates ? duplicateCount : 0) + preview.invalid.length > 0
                  ? "warn"
                  : "neutral"
              }
            />
          </div>

          <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5">
            <h2 className="text-sm font-semibold text-gray-900">
              What happens to each row
            </h2>

            {preview.invalid.length === 0 && duplicateCount === 0 && (
              <p className="mt-2 text-sm text-green-800">
                Every row passed validation and none of them match a client
                already in this practice.
              </p>
            )}

            {preview.invalid.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-900">
                  {preview.invalid.length} row
                  {preview.invalid.length !== 1 ? "s" : ""} cannot be imported
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  These rows are left out. Fix them in the file and import them
                  separately — the rest of the file still goes in.
                </p>
                <ul className="mt-3 divide-y divide-gray-100 rounded-md border border-amber-200 bg-amber-50/50">
                  {preview.invalid.slice(0, 50).map((row) => (
                    <li key={row.rowNumber} className="px-4 py-2 text-sm">
                      <span className="font-medium text-gray-900">
                        Row {row.rowNumber}
                      </span>
                      <ul className="mt-1 space-y-0.5">
                        {row.errors.map((issue, index) => (
                          <li key={index} className="text-gray-700">
                            <span className="font-medium">
                              {fieldLabel(issue.field)}:
                            </span>{" "}
                            {issue.message}
                            {issue.value ? (
                              <span className="text-gray-500">
                                {" "}
                                (found “{issue.value}”)
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {preview.invalid.length > 50 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Showing the first 50 of {preview.invalid.length} problem
                    rows.
                  </p>
                )}
              </div>
            )}

            {duplicateCount > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-900">
                  {duplicateCount} row{duplicateCount !== 1 ? "s" : ""} match a
                  client already in this practice
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Matched on the client name and date of birth.
                </p>
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
                  {preview.duplicates.slice(0, 50).map((duplicate) => (
                    <li key={duplicate.rowNumber}>
                      Row {duplicate.rowNumber} — {duplicate.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <fieldset className="mt-6">
              <legend className="text-sm font-medium text-gray-900">
                If a row matches an existing client
              </legend>
              <div className="mt-2 space-y-2">
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="duplicates"
                    checked={skipDuplicates}
                    onChange={() => setSkipDuplicates(true)}
                    className="mt-0.5 h-4 w-4 text-indigo-600"
                  />
                  <span>
                    Skip them{" "}
                    <span className="text-gray-500">(recommended)</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="duplicates"
                    checked={!skipDuplicates}
                    onChange={() => setSkipDuplicates(false)}
                    className="mt-0.5 h-4 w-4 text-indigo-600"
                  />
                  <span>
                    Import them anyway{" "}
                    <span className="text-gray-500">
                      — use this when two clients genuinely share a name and
                      birthday
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setStep("map")}
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Back to mapping
            </button>
            <button
              type="button"
              onClick={runImport}
              disabled={busy || willImport === 0}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
            >
              {busy
                ? "Importing…"
                : `Import ${willImport} client${willImport !== 1 ? "s" : ""}`}
            </button>
          </div>
          {willImport === 0 && (
            <p className="text-right text-sm text-gray-500">
              There is nothing left to import from this file.
            </p>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 4 — result                                                     */}
      {/* ------------------------------------------------------------------ */}
      {step === "done" && result && (
        <div className="space-y-6">
          <div className="rounded-lg bg-white p-6 shadow ring-1 ring-black/5">
            <h2 className="text-lg font-semibold text-gray-900">
              Import finished
            </h2>
            <p className="mt-1 text-sm text-gray-500">{fileName}</p>

            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-md bg-green-50 px-4 py-3">
                <dt className="text-xs font-medium uppercase text-green-800">
                  Imported
                </dt>
                <dd className="mt-1 text-2xl font-bold text-green-900">
                  {result.imported}
                </dd>
              </div>
              <div className="rounded-md bg-gray-50 px-4 py-3">
                <dt className="text-xs font-medium uppercase text-gray-600">
                  Skipped as duplicates
                </dt>
                <dd className="mt-1 text-2xl font-bold text-gray-900">
                  {result.skippedDuplicates.length}
                </dd>
              </div>
              <div className="rounded-md bg-amber-50 px-4 py-3">
                <dt className="text-xs font-medium uppercase text-amber-800">
                  Failed
                </dt>
                <dd className="mt-1 text-2xl font-bold text-amber-900">
                  {result.failed.length}
                </dd>
              </div>
            </dl>

            {result.failed.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-medium text-gray-900">
                  Rows that were not imported
                </h3>
                <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-amber-200 bg-amber-50/50">
                  {result.failed.slice(0, 50).map((row) => (
                    <li key={row.rowNumber} className="px-4 py-2 text-sm">
                      <span className="font-medium text-gray-900">
                        Row {row.rowNumber}
                      </span>
                      <ul className="mt-1 space-y-0.5">
                        {row.errors.map((issue, index) => (
                          <li key={index} className="text-gray-700">
                            <span className="font-medium">
                              {fieldLabel(issue.field)}:
                            </span>{" "}
                            {issue.message}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
                {result.failed.length > 50 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Showing the first 50 of {result.failed.length} rows.
                  </p>
                )}
              </div>
            )}

            {result.skippedDuplicates.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-medium text-gray-900">
                  Skipped as duplicates
                </h3>
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700">
                  {result.skippedDuplicates.slice(0, 50).map((duplicate) => (
                    <li key={duplicate.rowNumber}>
                      Row {duplicate.rowNumber} — {duplicate.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                to="/clients"
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
              >
                Go to client list
              </Link>
              <button
                type="button"
                onClick={reset}
                className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Import another file
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "good" | "warn";
}) {
  const styles =
    tone === "good"
      ? "bg-green-50 text-green-900"
      : tone === "warn"
        ? "bg-amber-50 text-amber-900"
        : "bg-white text-gray-900";
  return (
    <div className={`rounded-lg px-4 py-3 shadow ring-1 ring-black/5 ${styles}`}>
      <p className="text-xs font-medium uppercase opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
