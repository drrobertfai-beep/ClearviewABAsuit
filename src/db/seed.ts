// ClearView ABA Suite — Seed data
// Run via: bun run src/db/seed.ts
//
// Seeds 2 clients, 1 VB-MAPP assessment, 1 draft treatment plan, and 2 users.
// Requires DATABASE_URL in the environment (or a .env file in the project root).

import { sql } from "./sql";
import {
  createClient,
  createAssessment,
  createTreatmentPlan,
} from "../db";
import { ensurePracticeForUser } from "./practices";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ── Helper: Split a multi-statement SQL string into individual statements ──
// Neon's serverless driver doesn't support multiple commands in one prepared
// statement, so we split on semicolons and execute each statement separately.
function splitSQL(sqlText: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];
    const next = sqlText[i + 1] ?? "";

    // Handle comments
    if (!inSingleQuote && !inDoubleQuote && !inBlockComment) {
      if (ch === "-" && next === "-" && !inLineComment) {
        inLineComment = true;
        current += ch;
        continue;
      }
      if (inLineComment && ch === "\n") {
        inLineComment = false;
        current += ch;
        continue;
      }
      if (inLineComment) {
        current += ch;
        continue;
      }
      if (ch === "/" && next === "*") {
        inBlockComment = true;
        current += ch;
        continue;
      }
      if (inBlockComment && ch === "*" && next === "/") {
        inBlockComment = false;
        current += ch + next;
        i++; // skip next char
        continue;
      }
    }

    if (inBlockComment) {
      current += ch;
      continue;
    }

    // Handle quotes
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    }

    // Statement separator
    if (ch === ";" && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        // Skip comment-only statements
        const lines = trimmed.split("\n");
        const isCommentOnly = lines.every(
          (line) => line.trim() === "" || line.trim().startsWith("--"),
        );
        if (!isCommentOnly) {
          statements.push(trimmed);
        }
      }
      current = "";
      continue;
    }

    current += ch;
  }

  // Don't forget trailing text (without semicolon)
  const trimmed = current.trim();
  if (trimmed.length > 0) {
    const lines = trimmed.split("\n");
    const isCommentOnly = lines.every(
      (line) => line.trim() === "" || line.trim().startsWith("--"),
    );
    if (!isCommentOnly) {
      statements.push(trimmed);
    }
  }

  return statements;
}

async function executeAll(sqlText: string): Promise<void> {
  const statements = splitSQL(sqlText);
  const neonClient = sql();
  for (const stmt of statements) {
    // Use unsafe() to bypass prepared-statement path. All schema SQL is
    // hardcoded — no user input — so this is safe.
    await neonClient.unsafe(stmt);
  }
}

async function seed() {
  console.log("🌱 Seeding ClearView ABA Suite database...\n");

  // Run schema first to ensure tables exist
  const schemaPath = join(process.cwd(), "src", "db", "schema.sql");
  const schema = await readFile(schemaPath, "utf-8");
  await executeAll(schema);
  console.log("✓ Schema applied");

  // Clear existing seed data (order matters for FK constraints)
  const neonClient = sql();
  await neonClient.query("DELETE FROM audit_log");
  await neonClient.query("DELETE FROM signatures");
  await neonClient.query("DELETE FROM treatment_plans");
  await neonClient.query("DELETE FROM assessments");
  await neonClient.query("DELETE FROM users");
  await neonClient.query("DELETE FROM clients");
  // practices are only referenced by clients + practice_members; memberships
  // cascade with the users deleted above.
  await neonClient.query("DELETE FROM practices");
  console.log("✓ Existing seed data cleared\n");

  // ── Users ────────────────────────────────────────────────────────────
  // Insert users one at a time via tagged template (prepared statement path,
  // single-row paramaterized INSERT which Neon handles fine).
  const user1Row = await sql()`INSERT INTO users (email, name, role, password_hash) VALUES ('dr.chen@clearviewaba.com', 'Dr. Sarah Chen', 'bcba', '$2b$10$placeholder_hash_chen') RETURNING id, email, name, role`;
  const user2Row = await sql()`INSERT INTO users (email, name, role, password_hash) VALUES ('parent.jones@email.com', 'Maria Jones', 'parent', '$2b$10$placeholder_hash_jones') RETURNING id, email, name, role`;
  const users = [...user1Row, ...user2Row];
  console.log("✓ Users seeded:");
  for (const u of users) {
    console.log(`  ${u.role}: ${u.name} <${u.email}>`);
  }

  // ── Practice (tenant) ────────────────────────────────────────────────
  // Every client must belong to a practice; the seed's BCBA owns this one.
  const practice = await ensurePracticeForUser(
    String(users[0].id),
    String(users[0].name),
    "trial",
  );
  const practiceId = practice.practiceId;
  console.log(`✓ Practice seeded: ${practice.practiceName} (${practiceId})`);

  // ── Clients ──────────────────────────────────────────────────────────
  const client1 = await createClient(practiceId, {
    name: "Liam O'Connor",
    date_of_birth: "2018-03-15",
    gender: "male",
    contact_email: "oconnor.family@email.com",
    contact_phone: "555-0101",
    address: "142 Maple Street, Springfield, IL 62701",
    referral_source: "Dr. Patel (Pediatrician)",
    diagnoses: ["Autism Spectrum Disorder (F84.0)", "Speech Delay"],
    setting: "home",
    insurance_info: {
      provider: "Blue Cross Blue Shield",
      policy_number: "BCBS-987654321",
      group_number: "GRP-5555",
      authorization_required: true,
      auth_number: "AUTH-2024-0042",
      auth_expiry: "2025-06-30",
    },
    consent_flags: {
      photo_release: false,
      telehealth_consent: true,
      data_sharing: true,
      parent_communication_email: true,
    },
    privacy_notes: "Mother prefers communication via email. Father travels for work — schedule updates on short notice possible.",
    status: "active",
  }, "seed-script");
  console.log(`\n✓ Client 1: ${client1.name} (${client1.id})`);

  const client2 = await createClient(practiceId, {
    name: "Sofia Martinez",
    date_of_birth: "2020-07-22",
    gender: "female",
    contact_email: "martinez.family@email.com",
    contact_phone: "555-0202",
    address: "78 Oak Avenue, Apt 3B, Springfield, IL 62702",
    referral_source: "Early Intervention Program",
    diagnoses: ["Autism Spectrum Disorder (F84.0)", "Global Developmental Delay"],
    setting: "clinic",
    insurance_info: {
      provider: "Aetna",
      policy_number: "AET-123456789",
      group_number: "GRP-8821",
      authorization_required: true,
      auth_number: "AUTH-2024-0156",
      auth_expiry: "2025-09-15",
    },
    consent_flags: {
      photo_release: true,
      telehealth_consent: true,
      data_sharing: false,
      parent_communication_email: true,
    },
    privacy_notes: "Bilingual family (Spanish/English). All written communication should be provided in both languages when possible.",
    status: "active",
  }, "seed-script");
  console.log(`✓ Client 2: ${client2.name} (${client2.id})`);

  // ── Assessment (VB-MAPP for Liam) ────────────────────────────────────
  const assessment = await createAssessment(practiceId, {
    client_id: client1.id,
    tool_name: "VB-MAPP",
    tool_version: "2.0",
    assessment_date: "2024-11-10",
    assessor_name: "Dr. Sarah Chen, BCBA-D",
    status: "completed",
    raw_scores: {
      milestones: {
        mand: { level1: 5, level2: 8, level3: 6, total: 19, max: 30 },
        tact: { level1: 5, level2: 6, level3: 4, total: 15, max: 30 },
        listener: { level1: 5, level2: 7, level3: 5, total: 17, max: 30 },
        vp_mts: { level1: 5, level2: 5, level3: 3, total: 13, max: 25 },
        play: { level1: 5, level2: 5, level3: 2, total: 12, max: 25 },
        social: { level1: 5, level2: 4, level3: 3, total: 12, max: 25 },
        imitation: { level1: 5, level2: 5, level3: 3, total: 13, max: 25 },
        echoic: { level1: 5, level2: 5, level3: 4, total: 14, max: 25 },
        vocal: { level1: 3, level2: 4, level3: 2, total: 9, max: 20 },
        intraverbal: { level1: 3, level2: 4, level3: 2, total: 9, max: 25 },
        listener_ffc: { level1: 3, level2: 4, level3: 2, total: 9, max: 20 },
        group: { level1: 3, level2: 3, level3: 1, total: 7, max: 20 },
        linguistic: { level1: 3, level2: 3, level3: 2, total: 8, max: 20 },
        math: { level1: 2, level2: 2, level3: 1, total: 5, max: 20 },
        reading: { level1: 2, level2: 2, level3: 0, total: 4, max: 20 },
        writing: { level1: 1, level2: 1, level3: 0, total: 2, max: 20 },
        self_care: { level1: 4, level2: 3, level3: 1, total: 8, max: 20 },
      },
      barriers: {
        behavior_problems: 2,
        instructional_control: 1,
        defective_mand: 2,
        defective_tact: 3,
        defective_motor_imitation: 1,
        defective_echoic: 1,
        defective_vp_mts: 2,
        defective_listener: 2,
        defective_intraverbal: 3,
        defective_social: 2,
        prompt_dependence: 2,
        scrolling: 1,
        defective_scanning: 1,
        defective_conditional_discrimination: 3,
        failure_to_generalize: 2,
        weak_motivators: 2,
        response_effort: 1,
        problem_behavior: 2,
        defective_articulation: 1,
        obsessive_compulsive: 0,
        hyperactive: 1,
        failure_to_make_eye_contact: 1,
        sensory_defensiveness: 1,
      },
      transitions: {
        transition_1: 12,
        transition_2: 8,
        transition_3: 4,
        total: 24,
        max: 30,
      },
      eesa: {
        group1: 4,
        group2: 4,
        group3: 3,
        group4: 2,
        group5: 1,
        total: 14,
        max: 25,
      },
      task_analysis: {
        mand_6m: { score: 2, max: 5 },
        mand_7m: { score: 3, max: 5 },
        tact_6m: { score: 2, max: 5 },
        ld_6m: { score: 4, max: 5 },
        vp_6m: { score: 2, max: 5 },
        play_6m: { score: 3, max: 5 },
        social_6m: { score: 2, max: 5 },
        imitation_6m: { score: 3, max: 5 },
        echoic_6m: { score: 4, max: 5 },
      },
    },
    summary_notes: "Liam demonstrates emerging verbal behavior across all domains. Milestones assessment places him at approximately Level 2 overall with strengths in manding (19/30) and listener responding (17/30). Barrier assessment indicates moderate challenges with defective intraverbal (3), tact (3), and conditional discrimination (3). Transition assessment score of 24/30 suggests readiness for less restrictive environment with continued support. Recommended: 25 hours/week comprehensive ABA with focus on intraverbal and social skill acquisition.",
  }, "seed-script");
  console.log(`\n✓ Assessment: ${assessment.tool_name} (${assessment.id})`);

  // ── Treatment Plan (Draft for Liam) ──────────────────────────────────
  const plan = await createTreatmentPlan(practiceId, {
    client_id: client1.id,
    assessment_id: assessment.id,
    reason_for_referral: "Liam was referred by Dr. Patel (pediatrician) following ASD diagnosis at age 3. Parents report delayed speech, limited social engagement with peers, repetitive play patterns, and difficulty following multi-step instructions. Standardized assessments confirm deficits in communication, social skills, and adaptive functioning consistent with Autism Spectrum Disorder.",
    diagnosis: "Autism Spectrum Disorder (F84.0), Level 2 severity. Speech Delay (R47.9).",
    treatment_history: "Liam has received Early Intervention services (speech therapy 2x/week, developmental therapy 1x/week) from age 2.5 to present. Parents report modest progress with speech therapy — single-word mands emerged at age 3.5. No prior ABA services. No history of psychotropic medication.",
    concurrent_services: [
      { service: "Speech Therapy", provider: "Springfield Children's Therapy Center — Jamie Wilson, MS, CCC-SLP", frequency: "2x/week" },
      { service: "Occupational Therapy", provider: "Springfield Children's Therapy Center — Dr. Rachel Kim, OTD", frequency: "1x/week" },
    ],
    family_history: "Liam lives with both parents (Michael and Sarah O'Connor) and a younger sister (age 2, typically developing). Maternal uncle has ASD (diagnosed at age 5, employed as software engineer). No known history of other genetic or neurological conditions. Family is English-speaking, middle-income, with private insurance. Both parents work full-time; grandmother provides childcare 2 days/week.",
    school_info: "Liam attends Sunshine Montessori Preschool (half-day program, 8:30 AM – 12:30 PM, Mon–Fri). Classroom has 16 children with 2 teachers. IEP is in development. Current accommodations include visual schedule and preferential seating. Teacher reports Liam plays parallel to peers but does not initiate social interactions. Parent-teacher conferences indicate difficulty transitioning between activities.",
    maladaptive_behaviors: [
      {
        behavior: "Tantrum (screaming, dropping to floor)",
        topography: "Vocal protest ≥ 80 dB, drops to floor, may kick legs. Duration: 2-10 min.",
        function: "Escape from non-preferred tasks; tangible (denied access)",
        frequency: "3-5 episodes/day",
        intensity: "Moderate — does not cause injury but disrupts activities",
        antecedents: "Presentation of non-preferred task, transition from preferred activity, denied access to iPad",
        consequences: "Task removed (escape); parent provides iPad (tangible)",
        current_intervention: "Parents use redirection and calming strategies inconsistently",
      },
      {
        behavior: "Elopement",
        topography: "Runs from designated area (home room, classroom rug) without permission",
        function: "Escape from demand; attention (parent/teacher chases)",
        frequency: "1-2 episodes/day",
        intensity: "Moderate — requires adult retrieval; safety concern in community settings",
        antecedents: "Presentation of demand, transition to non-preferred location",
        consequences: "Adult follows/retrieves (attention); activity paused (escape)",
        current_intervention: "Parents use door alarms at home; teacher assigns 1:1 aide during transitions",
      },
    ],
    behavior_intervention_plan: "Function-based intervention for tantrum and elopement behaviors. For tantrums maintained by escape: implement Functional Communication Training (FCT) — teach Liam to mand for 'break' or 'help' using vocal approximation or picture exchange. Use 3-step prompting with differential reinforcement of alternative behavior (DRA). For elopement: environmental modifications (seating away from door, visual 'stop' sign on door), non-contingent reinforcement (NCR) during transitions, and DRA for staying in designated area. Data collection: ABC data for all instances, frequency counts, and duration recording for tantrums. Review BIP every 30 days.",
    skill_acquisition_goals: [
      {
        domain: "Communication — Manding",
        description: "Liam will independently mand for 20+ different items/actions using 3+ word vocal approximations or picture exchange across 3 settings and 3 people.",
        measurement: "80% independence across 3 consecutive probe sessions; frequency count per session",
        target_date: "2025-05-10",
      },
      {
        domain: "Social Skills — Peer Interaction",
        description: "Liam will initiate a peer interaction (e.g., offering a toy, asking a question, joining parallel play within 3 feet) at least 3 times during a 30-minute free-play period.",
        measurement: "Frequency count during 30-min observation; 3 initiations across 3 consecutive observations",
        target_date: "2025-05-10",
      },
      {
        domain: "Listener Responding — Multi-Step Instructions",
        description: "Liam will follow 3-step novel instructions (e.g., 'put your shoes in the cubby, get your coat, and line up') with 80% accuracy.",
        measurement: "80% accuracy across 3 consecutive probe sessions; trial-by-trial data",
        target_date: "2025-05-10",
      },
      {
        domain: "Intraverbal — Fill-in and WH Questions",
        description: "Liam will answer 10 'what' and 'who' questions about familiar items and people (e.g., 'What do you wear on your feet?' → 'shoes').",
        measurement: "80% accuracy across 3 consecutive probe sessions; first-trial data only",
        target_date: "2025-05-10",
      },
      {
        domain: "Adaptive — Self-Care",
        description: "Liam will independently complete a 5-step hand-washing routine (turn on water, wet hands, pump soap, scrub 20 seconds, rinse, dry) without prompts.",
        measurement: "100% independence across 3 consecutive opportunities; task analysis data",
        target_date: "2025-05-10",
      },
    ],
    assessment_outcomes: "VB-MAPP Milestones assessment places Liam at Level 2 (approximately 30-month language level). Milestones total: 170/365. Barriers total score: 30 (moderate). Transition assessment: 24/30. EESA: 14/25. Liam's relative strengths are in manding, listener responding, and motor imitation. Significant deficits are in intraverbal behavior, social skills, and linguistic structure. Barrier assessment highlights defective intraverbal (3), defective conditional discrimination (3), and defective tact (3) as primary barriers to progress.",
    parent_training_goals: [
      {
        goal: "Behavior Management",
        description: "Parents will demonstrate correct implementation of 3-step prompting and differential reinforcement procedures for tantrum behavior with 90% fidelity during 2 consecutive observations.",
      },
      {
        goal: "Communication Facilitation",
        description: "Parents will contrive at least 5 manding opportunities per hour during natural environment teaching (NET) sessions at home, as measured by session notes and video review.",
      },
      {
        goal: "Data Collection",
        description: "Parents will independently record ABC data for target behaviors using the ClearView mobile app with at least 85% completeness across 7 consecutive days.",
      },
    ],
    service_coordination_goals: [
      {
        goal: "Speech Therapy Collaboration",
        description: "BCBA will coordinate with SLP (Jamie Wilson) monthly to align articulation goals with manding targets. Shared data review via ClearView platform.",
      },
      {
        goal: "School Consultation",
        description: "BCBA will provide 1 hour/month of school consultation at Sunshine Montessori to support IEP development and classroom behavior strategies.",
      },
    ],
    discharge_criteria: "Discharge from comprehensive ABA services will be considered when: (1) Liam demonstrates age-appropriate communication skills (manding, tacting, intraverbal), (2) maladaptive behaviors occur ≤ 1x/week and are managed independently by caregivers, (3) Liam successfully participates in general education classroom without 1:1 support for 80% of the school day, and (4) parent training goals are met with maintenance across 3 months. Transition to focused ABA (social skills group) or discharge to school-based services at that time.",
    requested_services: [
      {
        cpt_code: "97153",
        service_name: "Comprehensive ABA Therapy (Direct 1:1)",
        hours_per_week: 25,
        session_duration_minutes: 180,
        setting: "home",
        provider_type: "RBT",
      },
      {
        cpt_code: "97155",
        service_name: "BCBA Supervision & Protocol Modification",
        hours_per_week: 4,
        session_duration_minutes: 120,
        setting: "home",
        provider_type: "BCBA",
      },
      {
        cpt_code: "97156",
        service_name: "Parent Training (Individual)",
        hours_per_week: 1,
        session_duration_minutes: 60,
        setting: "telehealth",
        provider_type: "Parent/Caregiver Training",
      },
    ],
    therapy_schedule: [
      { day: "Monday", start_time: "09:00", end_time: "12:00", service: "97153", setting: "home", provider: "RBT" },
      { day: "Monday", start_time: "13:00", end_time: "16:00", service: "97153", setting: "clinic", provider: "RBT" },
      { day: "Tuesday", start_time: "09:00", end_time: "12:00", service: "97153", setting: "home", provider: "RBT" },
      { day: "Tuesday", start_time: "13:00", end_time: "15:00", service: "97155", setting: "home", provider: "BCBA" },
      { day: "Wednesday", start_time: "09:00", end_time: "12:00", service: "97153", setting: "clinic", provider: "RBT" },
      { day: "Wednesday", start_time: "13:00", end_time: "16:00", service: "97153", setting: "clinic", provider: "RBT" },
      { day: "Thursday", start_time: "09:00", end_time: "12:00", service: "97153", setting: "home", provider: "RBT" },
      { day: "Thursday", start_time: "13:00", end_time: "16:00", service: "97153", setting: "home", provider: "RBT" },
      { day: "Friday", start_time: "09:00", end_time: "12:00", service: "97153", setting: "clinic", provider: "RBT" },
      { day: "Friday", start_time: "13:00", end_time: "14:00", service: "97156", setting: "telehealth", provider: "Parent/Caregiver Training" },
    ],
    clinical_justification: "Liam meets medical necessity criteria for comprehensive ABA at 25 hours per week. His VB-MAPP milestones assessment (Level 2 overall) documents significant deficits in manding, tacting and intraverbal repertoires alongside a barrier score indicating defective conditional discrimination and prompt dependency. Maladaptive behavior (tantrums, elopement) occurs daily and places him at risk of exclusion from his preschool placement. Without intensive, protocol-driven intervention, these deficits are expected to widen as academic and social demands increase. The requested intensity reflects the standard of care for a child of this profile and will be reduced as skills generalize.",
    authorization_start_date: "2026-12-01",
    authorization_end_date: "2027-05-31",
    authorization_number: "AUTH-2026-004417",
    status: "draft",
  }, "seed-script");
  console.log(`\n✓ Treatment Plan: ${plan.id} (status: ${plan.status})`);

  console.log("\n✅ Seed complete!\n");
  console.log("Summary:");
  console.log("  Users:         2 (1 BCBA, 1 parent)");
  console.log("  Clients:       2 (Liam O'Connor, Sofia Martinez)");
  console.log("  Assessments:   1 (VB-MAPP for Liam)");
  console.log("  Treatment Plans: 1 (draft for Liam)");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
