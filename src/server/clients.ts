// ClearView ABA Suite — Client server functions
// All data mutations happen server-side via createServerFn.
//
// Every handler resolves the caller's practice from the session
// (requireSession) and passes it to the db layer, which constrains every query
// to that practice. A client id from another practice reads as "not found".

import { createServerFn } from "@tanstack/react-start";
import {
  getClient,
  listClients,
  createClient,
  updateClient,
  deleteClient,
} from "~/db";
import type { ClientInput, ClientStatus } from "~/db";
import { analyzeClientImport, commitClientImport } from "~/db/import";
import { sanitizeImportRows } from "~/lib/client-import";
import { requirePracticeRole, requireSession } from "~/server/auth-guard";

// ---------------------------------------------------------------------------
// List clients (with optional status filter)
// ---------------------------------------------------------------------------
export const listClientsFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { status?: string } | undefined)
  .handler(async ({ data }) => {
    const { practiceId } = await requireSession();
    const opts: { status?: ClientStatus } = {};
    if (data?.status && ["active", "inactive", "archived"].includes(data.status)) {
      opts.status = data.status as ClientStatus;
    }
    return listClients(practiceId, opts);
  });

// ---------------------------------------------------------------------------
// Get a single client by ID (null when it belongs to another practice)
// ---------------------------------------------------------------------------
export const getClientFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    const { practiceId } = await requireSession();
    return getClient(practiceId, data.id);
  });

// ---------------------------------------------------------------------------
// Create a new client — stamped with the caller's practice
// ---------------------------------------------------------------------------
export const createClientFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as ClientInput)
  .handler(async ({ data }) => {
    const { practiceId, user } = await requireSession();
    return createClient(practiceId, data, user.email);
  });

// ---------------------------------------------------------------------------
// Update an existing client
// ---------------------------------------------------------------------------
export const updateClientFn = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        id: string;
        data: Partial<ClientInput>;
      },
  )
  .handler(async ({ data }) => {
    const { practiceId, user } = await requireSession();
    return updateClient(practiceId, data.id, data.data, user.email);
  });

// ---------------------------------------------------------------------------
// Delete a client
// ---------------------------------------------------------------------------
export const deleteClientFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    const { practiceId, user } = await requireSession();
    return deleteClient(practiceId, data.id, user.email);
  });

// ---------------------------------------------------------------------------
// CSV import
//
// Two server functions over the same analysis:
//   previewClientImportFn — validates + flags duplicates, writes nothing.
//   importClientsFn       — re-validates and commits the valid, non-duplicate
//                           rows, with one summary audit entry.
//
// The practice always comes from the session; the request body can only ever
// describe rows, never say where they go. Row-level validation runs again on
// the server so a tampered request cannot insert an unvalidated client.
// ---------------------------------------------------------------------------
export const previewClientImportFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { rows?: unknown })
  .handler(async ({ data }) => {
    const { practiceId } = await requireSession();
    const { rows, error } = sanitizeImportRows(data?.rows);
    if (error) return { ok: false as const, error };

    const { analysis } = await analyzeClientImport(practiceId, rows);
    return {
      ok: true as const,
      analysis: {
        totalRows: analysis.totalRows,
        validRows: analysis.validRows,
        invalid: analysis.invalid,
        duplicates: analysis.duplicates,
        importable: analysis.importable,
      },
    };
  });

export const importClientsFn = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        rows?: unknown;
        fileName?: unknown;
        skipDuplicates?: unknown;
      },
  )
  .handler(async ({ data }) => {
    const { practiceId, user } = await requirePracticeRole([
      "owner",
      "admin",
      "clinician",
    ]);

    const { rows, error } = sanitizeImportRows(data?.rows);
    if (error) return { ok: false as const, error };

    const fileName =
      typeof data?.fileName === "string" && data.fileName.trim()
        ? data.fileName.trim().slice(0, 200)
        : "clients.csv";
    // Default ON: an accidental second import of the same file must not create
    // a second copy of the caseload.
    const skipDuplicates = data?.skipDuplicates !== false;

    const result = await commitClientImport(practiceId, rows, {
      fileName,
      skipDuplicates,
      changedBy: user.email,
    });

    return {
      ok: true as const,
      imported: result.imported,
      totalRows: result.totalRows,
      skippedDuplicates: result.skippedDuplicates,
      failed: result.failed,
    };
  });
