// ClearView ABA Suite — SafeUser (pure module, no server-only imports)
//
// Kept free of database/server imports so the client bundle can import the type
// and the mapper without pulling server code (or node: built-ins) into it.

import type { PracticeContext, PracticeRole, User } from "~/db/types";

/** The authenticated user as returned to the browser: no password hash, plus
 * the practice they are acting in and their permission level inside it. */
export type SafeUser = Omit<User, "password_hash"> & {
  practiceId: string | null;
  practiceRole: PracticeRole | null;
  practiceName: string | null;
};

export function toSafeUser(
  user: User,
  practice: PracticeContext | null,
): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    trial_ends_at: user.trial_ends_at,
    stripe_customer_id: user.stripe_customer_id,
    account_status: user.account_status,
    created_at: user.created_at,
    practiceId: practice?.practiceId ?? null,
    practiceRole: practice?.practiceRole ?? null,
    practiceName: practice?.practiceName ?? null,
  };
}
