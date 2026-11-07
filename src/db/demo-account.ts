// ClearView ABA Suite — Demo account identity (shared constant)
//
// The demo account is a shared, fictional practice used for demos and sales
// calls. Its rows are flagged `is_demo` so they can be removed again.
// Kept in its own module so the seed script and the tenancy backfill agree on
// which account owns the demo practice (no circular imports).

export const DEMO_EMAIL = "demo@clearviewaba.com";
export const DEMO_PASSWORD = "demo123456";
