-- ClearView ABA Suite — Database Schema
-- Migration v1: MVP tables

-- Enable pgcrypto for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_status ON clients (status);
CREATE INDEX idx_clients_name ON clients (name);

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

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_role ON users (role);

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

CREATE INDEX idx_assessments_client_id ON assessments (client_id);
CREATE INDEX idx_assessments_status ON assessments (status);
CREATE INDEX idx_assessments_tool_name ON assessments (tool_name);
CREATE INDEX idx_assessments_date ON assessments (assessment_date);

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
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'active', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_treatment_plans_client_id ON treatment_plans (client_id);
CREATE INDEX idx_treatment_plans_status ON treatment_plans (status);
CREATE INDEX idx_treatment_plans_assessment_id ON treatment_plans (assessment_id);

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

CREATE INDEX idx_signatures_document ON signatures (document_type, document_id);

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

CREATE INDEX idx_audit_log_table_record ON audit_log (table_name, record_id);
CREATE INDEX idx_audit_log_changed_at ON audit_log (changed_at);
CREATE INDEX idx_audit_log_action ON audit_log (action);

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

-- For now, allow authenticated users full access (tighten as auth system matures).
-- This keeps the MVP functional while maintaining the RLS scaffolding.
CREATE POLICY clients_all_access ON clients FOR ALL USING (true);
CREATE POLICY assessments_all_access ON assessments FOR ALL USING (true);
CREATE POLICY treatment_plans_all_access ON treatment_plans FOR ALL USING (true);
CREATE POLICY signatures_all_access ON signatures FOR ALL USING (true);
CREATE POLICY audit_log_all_access ON audit_log FOR ALL USING (true);
CREATE POLICY users_all_access ON users FOR ALL USING (true);

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

CREATE INDEX idx_sessions_token ON sessions (token);
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sessions_all_access ON sessions FOR ALL USING (true);
