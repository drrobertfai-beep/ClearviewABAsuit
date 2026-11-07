-- ClearView ABA Suite — Database Schema
-- Migration v1: MVP tables

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PRACTICES (multi-tenant root)
-- ============================================================================
-- A practice is the tenant boundary: every client, assessment, treatment plan
-- and audit entry belongs to exactly one practice. `plan` is the billing tier
-- for the whole practice and is kept in sync with the owning user's
-- `users.plan` (see syncPracticePlan in src/db/practices.ts).
CREATE TABLE IF NOT EXISTS practices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'solo', 'practice', 'clinic')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- CLIENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    date_of_birth DATE,
    gender TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    referral_source TEXT,
    diagnoses JSONB DEFAULT '[]'::jsonb,
    setting TEXT CHECK (setting IN ('home', 'school', 'clinic', 'other')),
    insurance_info JSONB DEFAULT '{}'::jsonb,
    consent_flags JSONB DEFAULT '{}'::jsonb,
    privacy_notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    practice_id UUID REFERENCES practices(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_status ON clients (status);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (name);

-- ----------------------------------------------------------------------------
-- Tenancy column on clients (idempotent, re-runnable)
-- ----------------------------------------------------------------------------
-- `CREATE TABLE IF NOT EXISTS clients` above is a no-op on a database where the
-- table already exists, so the column is re-asserted here. It is added nullable
-- on purpose: the backfill in src/db/migrate.ts assigns existing rows a practice
-- and only then sets NOT NULL, so the migration never fails on a live database.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS practice_id UUID REFERENCES practices(id);
CREATE INDEX IF NOT EXISTS idx_clients_practice_id ON clients (practice_id);

-- ============================================================================
-- USERS (minimal — role-based access)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'bcba' CHECK (role IN ('bcba', 'bcaba', 'admin', 'parent')),
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial', 'solo', 'practice', 'clinic')),
    trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days'),
    stripe_customer_id TEXT,
    account_status TEXT NOT NULL DEFAULT 'trial' CHECK (account_status IN ('trial', 'active', 'past_due', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- ----------------------------------------------------------------------------
-- Billing columns on users (idempotent, re-runnable)
-- ----------------------------------------------------------------------------
-- `CREATE TABLE IF NOT EXISTS users` above is a no-op on a database where the
-- table already exists, so the billing columns are re-asserted here. This is
-- what makes the plan/checkout work deployable to an existing database.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '14 days');
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'trial';

-- If `plan` predates this migration it may be nullable; backfill and tighten so
-- every account always has a plan tier (the billing page reads this column).
UPDATE users SET plan = 'trial' WHERE plan IS NULL;
ALTER TABLE users ALTER COLUMN plan SET DEFAULT 'trial';
ALTER TABLE users ALTER COLUMN plan SET NOT NULL;

-- ============================================================================
-- PRACTICE MEMBERSHIPS
-- ============================================================================
-- Who can see a practice's data, and at what permission level.
--
-- NOTE: `practice_members.role` (permission level) is a DIFFERENT concept from
-- `users.role` (clinical credential: bcba / bcaba / admin / parent). Both are
-- kept: a BCaBA (users.role) can be the `owner` of their own practice
-- (practice_members.role), or a `clinician` inside a colleague's practice.
CREATE TABLE IF NOT EXISTS practice_members (
    practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'clinician', 'viewer')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT practice_members_practice_id_user_id_key UNIQUE (practice_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_practice_members_user_id ON practice_members (user_id);
CREATE INDEX IF NOT EXISTS idx_practice_members_practice_id ON practice_members (practice_id);

-- ============================================================================
-- PRACTICE INVITES (schema only — the accept flow ships in phase 2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS practice_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practice_id UUID NOT NULL REFERENCES practices(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'clinician', 'viewer')),
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_practice_invites_practice_id ON practice_invites (practice_id);
CREATE INDEX IF NOT EXISTS idx_practice_invites_email ON practice_invites (lower(email));

-- ============================================================================
-- ASSESSMENTS
-- ============================================================================
CREATE TABLE IF NOT EXISTS assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL CHECK (tool_name IN ('VB-MAPP', 'ABLLS-R', 'AFLS', 'PEAK', 'Other')),
    tool_version TEXT,
    assessment_date DATE NOT NULL,
    assessor_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed')),
    raw_scores JSONB DEFAULT '{}'::jsonb,
    summary_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessments_client_id ON assessments (client_id);
CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments (status);
CREATE INDEX IF NOT EXISTS idx_assessments_tool_name ON assessments (tool_name);
CREATE INDEX IF NOT EXISTS idx_assessments_date ON assessments (assessment_date);

-- ============================================================================
-- TREATMENT PLANS
-- ============================================================================
CREATE TABLE IF NOT EXISTS treatment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    assessment_id UUID REFERENCES assessments(id) ON DELETE SET NULL,
    reason_for_referral TEXT,
    diagnosis TEXT,
    treatment_history TEXT,
    concurrent_services JSONB DEFAULT '[]'::jsonb,
    family_history TEXT,
    school_info TEXT,
    maladaptive_behaviors JSONB DEFAULT '[]'::jsonb,
    behavior_intervention_plan TEXT,
    skill_acquisition_goals JSONB DEFAULT '[]'::jsonb,
    assessment_outcomes TEXT,
    parent_training_goals JSONB DEFAULT '[]'::jsonb,
    service_coordination_goals JSONB DEFAULT '[]'::jsonb,
    discharge_criteria TEXT,
    requested_services JSONB DEFAULT '[]'::jsonb,
    therapy_schedule JSONB DEFAULT '{}'::jsonb,
    clinical_justification TEXT,
    authorization_start_date DATE,
    authorization_end_date DATE,
    authorization_number TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'active', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treatment_plans_client_id ON treatment_plans (client_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_status ON treatment_plans (status);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_assessment_id ON treatment_plans (assessment_id);

-- Authorization request fields. `requested_services` and `therapy_schedule`
-- above already exist on every database; these four are new, so existing
-- databases get them through idempotent ALTERs. The two jsonb columns keep
-- their old shape for plans written before this change — the app normalizes
-- both shapes on read (src/lib/treatment-plan-authz.ts) and writes the new
-- shape, so no data migration is required or wanted.
ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS clinical_justification TEXT;
ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS authorization_start_date DATE;
ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS authorization_end_date DATE;
ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS authorization_number TEXT;

-- ============================================================================
-- SIGNATURES
-- ============================================================================
CREATE TABLE IF NOT EXISTS signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type TEXT NOT NULL CHECK (document_type IN ('assessment', 'treatment_plan')),
    document_id UUID NOT NULL,
    signer_name TEXT NOT NULL,
    signer_role TEXT NOT NULL CHECK (signer_role IN ('bcba', 'parent_guardian', 'admin')),
    signature_data TEXT,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_signatures_document ON signatures (document_type, document_id);

-- ============================================================================
-- AUDIT LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE')),
    changed_by TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    old_values JSONB,
    new_values JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_changed_at ON audit_log (changed_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);

-- Tenancy column on the audit trail. Audit rows reference records in several
-- tables (including signatures, which have no client_id of their own), so the
-- practice is stamped on the row instead of being derived per query.
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS practice_id UUID REFERENCES practices(id);
CREATE INDEX IF NOT EXISTS idx_audit_log_practice_id ON audit_log (practice_id);

-- ============================================================================
-- DEMO DATA MARKER
-- ============================================================================
-- Rows created by `bun src/db/seed-demo.ts` are flagged is_demo = TRUE so the
-- demo practice can be identified and deleted again (`bun src/db/seed-demo.ts
-- --remove`) without touching real records. Existing databases get the column
-- through these ALTERs (CREATE TABLE IF NOT EXISTS above is a no-op there).
ALTER TABLE clients ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE treatment_plans ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_clients_is_demo ON clients (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_assessments_is_demo ON assessments (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_treatment_plans_is_demo ON treatment_plans (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_signatures_is_demo ON signatures (is_demo) WHERE is_demo;
CREATE INDEX IF NOT EXISTS idx_audit_log_is_demo ON audit_log (is_demo) WHERE is_demo;

-- ============================================================================
-- Row-Level Security (RLS) — foundation for HIPAA compliance
-- ============================================================================
-- Enable RLS on all tables; policies can be refined as auth matures.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE practice_invites ENABLE ROW LEVEL SECURITY;

-- For now, allow authenticated users full access (tighten as auth system matures).
-- This keeps the MVP functional while maintaining the RLS scaffolding.
DROP POLICY IF EXISTS clients_all_access ON clients;
CREATE POLICY clients_all_access ON clients FOR ALL USING (true);
DROP POLICY IF EXISTS assessments_all_access ON assessments;
CREATE POLICY assessments_all_access ON assessments FOR ALL USING (true);
DROP POLICY IF EXISTS treatment_plans_all_access ON treatment_plans;
CREATE POLICY treatment_plans_all_access ON treatment_plans FOR ALL USING (true);
DROP POLICY IF EXISTS signatures_all_access ON signatures;
CREATE POLICY signatures_all_access ON signatures FOR ALL USING (true);
DROP POLICY IF EXISTS audit_log_all_access ON audit_log;
CREATE POLICY audit_log_all_access ON audit_log FOR ALL USING (true);
DROP POLICY IF EXISTS users_all_access ON users;
CREATE POLICY users_all_access ON users FOR ALL USING (true);
DROP POLICY IF EXISTS practices_all_access ON practices;
CREATE POLICY practices_all_access ON practices FOR ALL USING (true);
DROP POLICY IF EXISTS practice_members_all_access ON practice_members;
CREATE POLICY practice_members_all_access ON practice_members FOR ALL USING (true);
DROP POLICY IF EXISTS practice_invites_all_access ON practice_invites;
CREATE POLICY practice_invites_all_access ON practice_invites FOR ALL USING (true);

-- ============================================================================
-- SESSIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (token);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_all_access ON sessions;
CREATE POLICY sessions_all_access ON sessions FOR ALL USING (true);
