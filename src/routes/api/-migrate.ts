// POST /api/migrate — run schema.sql against the database
// This is a protected administrative endpoint; in production, guard with auth.
//
// The splitting/execution logic lives in ~/db/migrate so the same code path is
// used by the CLI runner (`bun src/db/migrate.ts`).

import { createServerFn } from "@tanstack/react-start";
import { applySchema } from "~/db/migrate";

export const migrate = createServerFn({ method: "POST" }).handler(async () => {
  const result = await applySchema();
  return { success: result.success, message: result.message };
});
