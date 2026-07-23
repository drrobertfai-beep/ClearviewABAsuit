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
  created_at: string;
  updated_at: string;
}

export type TreatmentPlanStatus = "draft" | "review" | "approved" | "active" | "completed";

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
}

export type UserRole = "bcba" | "bcaba" | "admin" | "parent";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password_hash: string;
  created_at: string;
}
