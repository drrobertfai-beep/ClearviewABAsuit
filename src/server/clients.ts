// ClearView ABA Suite — Client server functions
// All data mutations happen server-side via createServerFn.
// Wraps the db.ts CRUD helpers with audit logging (changedBy = "system" for MVP).

import { createServerFn } from "@tanstack/react-start";
import {
  getClient,
  listClients,
  createClient,
  updateClient,
  deleteClient,
} from "~/db";
import type { Client, ClientStatus } from "~/db/types";

// ---------------------------------------------------------------------------
// List clients (with optional status filter)
// ---------------------------------------------------------------------------
export const listClientsFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { status?: string } | undefined)
  .handler(async ({ data }) => {
    const opts: { status?: ClientStatus } = {};
    if (data?.status && ["active", "inactive", "archived"].includes(data.status)) {
      opts.status = data.status as ClientStatus;
    }
    return listClients(opts);
  });

// ---------------------------------------------------------------------------
// Get a single client by ID
// ---------------------------------------------------------------------------
export const getClientFn = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    return getClient(data.id);
  });

// ---------------------------------------------------------------------------
// Create a new client
// ---------------------------------------------------------------------------
export const createClientFn = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as Omit<Client, "id" | "created_at" | "updated_at">,
  )
  .handler(async ({ data }) => {
    return createClient(data, "system");
  });

// ---------------------------------------------------------------------------
// Update an existing client
// ---------------------------------------------------------------------------
export const updateClientFn = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        id: string;
        data: Partial<Omit<Client, "id" | "created_at" | "updated_at">>;
      },
  )
  .handler(async ({ data }) => {
    return updateClient(data.id, data.data, "system");
  });

// ---------------------------------------------------------------------------
// Delete a client
// ---------------------------------------------------------------------------
export const deleteClientFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    return deleteClient(data.id, "system");
  });
