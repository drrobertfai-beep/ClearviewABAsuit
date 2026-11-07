// ClearView ABA Suite — Domain Types
// Shared types for client ↔ server data contracts.

export type ClientStatus = "active" | "inactive" | "archived";
export type ClientSetting = "home" | "school" | "clinic" | "other";

export interface Client {
  id: string;
  name: string;
  date_of_birth: string | null;
  gender: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  referral_source: string | null;
  diagnoses: unknown;
  setting: ClientSetting | null;
  insurance_info: unknown;
  consent_flags: unknown;
  privacy_notes: string | null;
  status: ClientStatus;
  /** Tenant this client belongs to. Resolved server-side; never from the client. */
  practice_id?: string;
  /** TRUE for rows created by the demo seed script. */
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export type AssessmentTool = "VB-MAPP" | "ABLLS-R" | "AFLS" | "PEAK" | "Other";
export type AssessmentStatus = "draft" | "in_progress" | "completed";

export interface Assessment {
  id: string;
  client_id: string;
  tool_name: AssessmentTool;
  tool_version: string | null;
  assessment_date: string;
  assessor_name: string;
  status: AssessmentStatus;
  raw_scores: unknown;
  summary_notes: string | null;
  /** TRUE for rows created by the demo seed script. */
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export type TreatmentPlanStatus =
  | "draft"
  | "review"
  | "approved"
  | "active"
  | "completed";

export interface ConcurrentService {
  service: string;
  provider: string;
}

export interface SkillAcquisitionGoal {
  domain: string;
  description: string;
  measurement: string;
  target_date: string;
}

export interface RequestedService {
  service_name: string;
  cpt_code: string;
  frequency: string;
  duration: string;
}

export interface TreatmentPlan {
  id: string;
  client_id: string;
  assessment_id: string | null;
  reason_for_referral: string | null;
  diagnosis: string | null;
  treatment_history: string | null;
  concurrent_services: unknown;
  family_history: string | null;
  school_info: string | null;
  maladaptive_behaviors: unknown;
  behavior_intervention_plan: string | null;
  skill_acquisition_goals: unknown;
  assessment_outcomes: string | null;
  parent_training_goals: unknown;
  service_coordination_goals: unknown;
  discharge_criteria: string | null;
  requested_services: unknown;
  therapy_schedule: unknown;
  status: TreatmentPlanStatus;
  /** TRUE for rows created by the demo seed script. */
  is_demo?: boolean;
  created_at: string;
  updated_at: string;
}

export type SignerRole = "bcba" | "parent_guardian" | "admin";
export type DocumentType = "assessment" | "treatment_plan";

export interface Signature {
  id: string;
  document_type: DocumentType;
  document_id: string;
  signer_name: string;
  signer_role: SignerRole;
  signature_data: string | null;
  signed_at: string;
  ip_address: string | null;
  /** TRUE for rows created by the demo seed script. */
  is_demo?: boolean;
}

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

export interface AuditEntry {
  id: string;
  table_name: string;
  record_id: string;
  action: AuditAction;
  changed_by: string | null;
  changed_at: string;
  old_values: unknown;
  new_values: unknown;
  /** Tenant the audited record belongs to. */
  practice_id?: string | null;
  /** TRUE for entries written by the demo seed script. */
  is_demo?: boolean;
}

export type UserRole = "bcba" | "bcaba" | "admin" | "parent";
export type PlanTier = "trial" | "solo" | "practice" | "clinic";
export type AccountStatus = "trial" | "active" | "past_due" | "cancelled";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password_hash: string;
  plan: PlanTier;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  account_status: AccountStatus;
  created_at: string;
}

// ============================================================================
// PRACTICES / MEMBERSHIPS (multi-tenancy)
// ============================================================================
//
// `practice_members.role` is the PERMISSION level inside a practice. It is a
// different axis from `User.role`, which is the clinical credential
// (bcba / bcaba / admin / parent). Do not merge the two.
export type PracticeRole = "owner" | "admin" | "clinician" | "viewer";
export type MembershipStatus = "active" | "removed";

export interface Practice {
  id: string;
  name: string;
  plan: PlanTier;
  created_at: string;
}

export interface PracticeMember {
  practice_id: string;
  user_id: string;
  role: PracticeRole;
  status: MembershipStatus;
  joined_at: string;
}

export interface PracticeInvite {
  id: string;
  practice_id: string;
  email: string;
  role: PracticeRole;
  token: string;
  expires_at: string | null;
  accepted_at: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * The caller's tenancy context, resolved server-side from the session cookie on
 * every request. Never accept these values from the browser.
 */
export interface PracticeContext {
  practiceId: string;
  practiceRole: PracticeRole;
  practiceName: string;
  practicePlan: PlanTier;
}
