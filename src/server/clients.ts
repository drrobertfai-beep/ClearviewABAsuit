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
import { requireSession } from "~/server/auth-guard";

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
