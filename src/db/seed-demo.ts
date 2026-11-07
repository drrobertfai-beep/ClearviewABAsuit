// ClearView ABA Suite — Demo practice seed
//
// Populates a complete, obviously-fictional demo practice so every screen of
// the app shows real content: 6 clients, 4 VB-MAPP assessments (completed /
// in progress / draft), 3 treatment plans, signatures and a matching audit log.
//
//   bun src/db/seed-demo.ts            # create / refresh the demo practice
//   bun src/db/seed-demo.ts --remove   # delete only the demo practice
//
// Every row this script writes is flagged `is_demo = TRUE` (see the "DEMO DATA
// MARKER" block in schema.sql). The script is idempotent: it deletes the rows it
// created last time and re-inserts them, so running it twice leaves exactly the
// same number of rows. It never touches non-demo rows, and it never deletes
// clients/assessments/plans that were not created by this script.
//
// All names, contact details, insurers and providers are invented. Client names
// are initials only, phone numbers use the reserved 555-01xx range, e-mail
// addresses use example.com, and postal addresses use the fictional "Demo" form.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { sql } from "./sql";
import { applySchema } from "./migrate";
import { hashPassword, verifyPassword } from "~/server/password";
import { computeVBMAPPScoring } from "../lib/vbmapp-scoring";
import {
  VB_MAPP_MILESTONES,
  VB_MAPP_BARRIERS,
  VB_MAPP_TRANSITION,
  VB_MAPP_EESA_GROUPS,
  VB_MAPP_TASK_ANALYSIS_DOMAINS,
} from "../components/VBMAPPData";

// ---------------------------------------------------------------------------
// Demo account
// ---------------------------------------------------------------------------
// The identity lives in ./demo-account so the tenancy backfill in migrate.ts
// and this seed agree on which account owns the demo practice.

import { DEMO_EMAIL, DEMO_PASSWORD } from "./demo-account";
import { ensurePracticeForUser } from "./practices";

export { DEMO_EMAIL, DEMO_PASSWORD };

// ---------------------------------------------------------------------------
// Deterministic IDs — keeps /clients/<id> and /treatment-plans/<id> links stable
// across re-seeds so demo links can be bookmarked or put in documentation.
// ---------------------------------------------------------------------------

const demoId = (n: number) =>
  `de000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const CLIENT_IDS = [1, 2, 3, 4, 5, 6].map((i) => demoId(100 + i));
const ASSESSMENT_IDS = [1, 2, 3, 4].map((i) => demoId(200 + i));
const PLAN_IDS = [1, 2, 3].map((i) => demoId(300 + i));
const SIGNATURE_IDS = [1, 2, 3].map((i) => demoId(400 + i));

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

/** A timestamp `days` ago (plus `hours`), so the demo always looks current. */
function daysAgo(days: number, hours = 9): Date {
  return new Date(Date.now() - days * DAY + hours * 60 * 60 * 1000);
}

/** ISO date (YYYY-MM-DD) `days` ago. */
function isoDaysAgo(days: number): string {
  return daysAgo(days).toISOString().slice(0, 10);
}

/** Birth date for someone who is exactly `age` years old today. */
function dobForAge(age: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - (age * 12 + 2));
  return d.toISOString().slice(0, 10);
}

/** Fill `length` VB-MAPP milestone items so that `target` of them are credited. */
function fillItems(length: number, target: number): number[] {
  const out: number[] = [];
  let remaining = Math.max(0, Math.min(target, length));
  for (let i = 0; i < length; i++) {
    if (remaining >= 1) {
      out.push(1);
      remaining -= 1;
    } else if (remaining > 0) {
      out.push(0.5); // partially met milestone — a normal VB-MAPP score
      remaining = 0;
    } else {
      out.push(0);
    }
  }
  return out;
}

/**
 * Build a full `raw_scores` object from a compact profile.
 * `milestones` is keyed `"level1.mand": 4.5` (items credited), barriers are
 * 0–4 each, transition 0–2 each, EESA/task analysis count mastered targets.
 */
function buildRawScores(profile: {
  milestones: Record<string, number>;
  barriers: Record<string, number>;
  transition: Record<string, number>;
  eesa: Record<string, number>;
  taskAnalysis: Record<string, number>;
}): Record<string, unknown> {
  const milestones: Record<string, Record<string, number[]>> = {};
  for (const [level, domains] of Object.entries(VB_MAPP_MILESTONES)) {
    milestones[level] = {};
    for (const [key, def] of Object.entries(domains)) {
      milestones[level][key] = fillItems(
        def.items.length,
        profile.milestones[`${level}.${key}`] ?? 0,
      );
    }
  }

  const barriers: Record<string, number> = {};
  for (const b of VB_MAPP_BARRIERS)
    barriers[b.key] = profile.barriers[b.key] ?? 0;

  const transition: Record<string, number> = {};
  for (const t of VB_MAPP_TRANSITION)
    transition[t.key] = profile.transition[t.key] ?? 1;

  const eesa: Record<string, number[]> = {};
  for (const g of VB_MAPP_EESA_GROUPS) {
    eesa[g.key] = fillItems(g.targets.length, profile.eesa[g.key] ?? 0);
  }

  const taskAnalysis: Record<string, number[]> = {};
  for (const d of VB_MAPP_TASK_ANALYSIS_DOMAINS) {
    taskAnalysis[d.key] = fillItems(
      d.skills.length,
      profile.taskAnalysis[d.key] ?? 0,
    );
  }

  const raw: Record<string, unknown> = {
    milestones,
    barriers,
    transition,
    eesa,
    task_analysis: taskAnalysis,
  };

  return { ...raw, _computed: computeVBMAPPScoring(raw) };
}

/** A fake-but-plausible handwritten signature, as a data URL. */
function signatureImage(seed: number): string {
  const paths = [
    "M12 62 C 44 12, 62 88, 92 44 S 138 8, 168 58 S 214 84, 252 38",
    "M14 70 C 52 30, 70 74, 104 36 S 150 76, 186 30 S 232 66, 262 44",
    "M10 58 C 40 22, 66 82, 98 52 S 144 14, 178 62 S 224 80, 258 34",
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="96"><path d="${paths[seed % paths.length]}" stroke="#1f2937" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// ---------------------------------------------------------------------------
// Client fixtures (6 clients, clearly fictional)
// ---------------------------------------------------------------------------

const CLIENTS = [
  {
    id: CLIENT_IDS[0],
    name: "A.R. (Demo Client A)",
    age: 6,
    gender: "male",
    email: "guardian-a@example.com",
    phone: "555-0101",
    address: "100 Demo Lane, Springfield, ST 00000",
    referral: "Demo Pediatrics — Dr. Sample (pediatrician)",
    diagnoses: ["Autism Spectrum Disorder (F84.0)", "Speech Delay"],
    setting: "home",
    insurance: {
      provider: "DemoCare Health (fictional)",
      policy_number: "DEMO-0001",
      group_number: "DEMO-GRP-01",
      authorization_required: true,
      auth_number: "DEMO-AUTH-1001",
    },
    consent: {
      photo_release: false,
      telehealth_consent: true,
      data_sharing: true,
    },
    notes:
      "DEMO DATA — fictional client created by seed-demo.ts. Safe to delete.",
    status: "active",
  },
  {
    id: CLIENT_IDS[1],
    name: "J.M. (Demo Client B)",
    age: 4,
    gender: "male",
    email: "guardian-b@example.com",
    phone: "555-0102",
    address: "101 Demo Lane, Springfield, ST 00000",
    referral: "Demo Early Intervention Program",
    diagnoses: ["Autism Spectrum Disorder (F84.0)"],
    setting: "clinic",
    insurance: {
      provider: "Example Mutual (fictional)",
      policy_number: "DEMO-0002",
      group_number: "DEMO-GRP-02",
      authorization_required: true,
      auth_number: "DEMO-AUTH-1002",
    },
    consent: {
      photo_release: true,
      telehealth_consent: true,
      data_sharing: false,
    },
    notes:
      "DEMO DATA — fictional client created by seed-demo.ts. Safe to delete.",
    status: "active",
  },
  {
    id: CLIENT_IDS[2],
    name: "K.T. (Demo Client C)",
    age: 7,
    gender: "female",
    email: "guardian-c@example.com",
    phone: "555-0103",
    address: "102 Demo Lane, Springfield, ST 00000",
    referral: "Demo Unified School District — Student Services",
    diagnoses: ["Autism Spectrum Disorder (F84.0)", "ADHD"],
    setting: "school",
    insurance: {
      provider: "DemoCare Health (fictional)",
      policy_number: "DEMO-0003",
      group_number: "DEMO-GRP-01",
      authorization_required: true,
      auth_number: "DEMO-AUTH-1003",
    },
    consent: {
      photo_release: true,
      telehealth_consent: false,
      data_sharing: true,
    },
    notes:
      "DEMO DATA — fictional client created by seed-demo.ts. Safe to delete.",
    status: "active",
  },
  {
    id: CLIENT_IDS[3],
    name: "L.B. (Demo Client D)",
    age: 9,
    gender: "male",
    email: "guardian-d@example.com",
    phone: "555-0104",
    address: "103 Demo Lane, Springfield, ST 00000",
    referral: "Demo Developmental Clinic — Dr. Placeholder",
    diagnoses: ["Autism Spectrum Disorder (F84.0)", "Intellectual Disability"],
    setting: "clinic",
    insurance: {
      provider: "Example Mutual (fictional)",
      policy_number: "DEMO-0004",
      authorization_required: false,
    },
    consent: {
      photo_release: false,
      telehealth_consent: true,
      data_sharing: false,
    },
    notes:
      "DEMO DATA — fictional client created by seed-demo.ts. Services paused (family relocation).",
    status: "inactive",
  },
  {
    id: CLIENT_IDS[4],
    name: "M.S. (Demo Client E)",
    age: 3,
    gender: "female",
    email: "guardian-e@example.com",
    phone: "555-0105",
    address: "104 Demo Lane, Springfield, ST 00000",
    referral: "Demo Pediatrics — Dr. Sample (pediatrician)",
    diagnoses: [
      "Autism Spectrum Disorder (F84.0)",
      "Global Developmental Delay",
      "Speech Delay",
    ],
    setting: "home",
    insurance: {
      provider: "DemoCare Health (fictional)",
      policy_number: "DEMO-0005",
      group_number: "DEMO-GRP-01",
      authorization_required: true,
      auth_number: "DEMO-AUTH-1005",
    },
    consent: {
      photo_release: false,
      telehealth_consent: true,
      data_sharing: true,
    },
    notes:
      "DEMO DATA — fictional client created by seed-demo.ts. Safe to delete.",
    status: "active",
  },
  {
    id: CLIENT_IDS[5],
    name: "T.W. (Demo Client F)",
    age: 5,
    gender: "male",
    email: "guardian-f@example.com",
    phone: "555-0106",
    address: "105 Demo Lane, Springfield, ST 00000",
    referral: "Demo Community Health Center",
    diagnoses: [
      "Autism Spectrum Disorder (F84.0)",
      "Sensory Processing Disorder",
    ],
    setting: "other",
    insurance: {
      provider: "Example Mutual (fictional)",
      policy_number: "DEMO-0006",
      authorization_required: false,
    },
    consent: {
      photo_release: false,
      telehealth_consent: false,
      data_sharing: false,
    },
    notes:
      "DEMO DATA — fictional client created by seed-demo.ts. Case archived after discharge.",
    status: "archived",
  },
];

// ---------------------------------------------------------------------------
// Assessment fixtures (4 VB-MAPP assessments in different states)
// ---------------------------------------------------------------------------

const ASSESSMENTS = [
  {
    id: ASSESSMENT_IDS[0],
    client_id: CLIENT_IDS[0],
    status: "completed",
    date: isoDaysAgo(62),
    summary:
      "DEMO DATA. Milestones place the client at Level 2 with strengths in mand, listener responding and motor imitation. Primary barriers: absent intraverbal, conditional discrimination and prompt dependency. Transition score supports continued inclusion support with 1:1 fading targets.",
    raw: buildRawScores({
      milestones: {
        "level1.mand": 5,
        "level1.tact": 5,
        "level1.listener": 5,
        "level1.vp_mts": 5,
        "level1.play": 5,
        "level1.social": 5,
        "level1.motor_imitation": 5,
        "level1.echoic": 5,
        "level1.vocal": 5,
        "level2.mand": 4.5,
        "level2.tact": 4,
        "level2.listener": 4,
        "level2.vp_mts": 5,
        "level2.play": 4,
        "level2.social": 3.5,
        "level2.motor_imitation": 5,
        "level2.echoic": 4.5,
        "level2.vocal": 4,
        "level2.lrffc": 3.5,
        "level2.intraverbal": 2.5,
        "level2.classroom": 3,
        "level3.mand": 2,
        "level3.tact": 2,
        "level3.listener": 2,
        "level3.vp_mts": 2,
        "level3.play": 1.5,
        "level3.social": 1,
        "level3.motor_imitation": 2,
        "level3.echoic": 2,
        "level3.vocal": 1.5,
        "level3.intraverbal": 1,
        "level3.classroom": 1,
        "level3.reading": 1.5,
        "level3.writing": 1,
        "level3.math": 1,
      },
      barriers: {
        negative_behaviors: 2,
        instructional_control: 1,
        absent_intraverbal: 3,
        absent_social: 2,
        prompt_dependency: 2,
        scrolling: 1,
        conditional_discrim: 2,
        generalization: 2,
        weak_motivators: 1,
        response_weakens: 1,
        reinforcer_dependency: 2,
        self_stimulation: 1,
        articulation: 2,
        hyperactive: 1,
        eye_contact: 1,
        sensory_defensiveness: 1,
      },
      transition: {
        milestones_score: 2,
        barriers_score: 2,
        negative_behaviors: 1,
        classroom_routines: 2,
        generalized_responding: 1,
        rate_acquisition: 1,
        retention: 2,
        natural_environment: 1,
        transfer: 1,
        adaptability: 1,
        spontaneous_behavior: 2,
        self_directed_leisure: 2,
        toileting: 2,
        eating: 2,
        social_play: 1,
        independent_academic: 1,
        generalization_vb: 1,
        peer_reinforcement: 1,
      },
      eesa: { group1: 7, group2: 5, group3: 4, group4: 6, group5: 4 },
      taskAnalysis: { toileting: 7, dressing: 5, eating: 8, communication: 4 },
    }),
  },
  {
    id: ASSESSMENT_IDS[1],
    client_id: CLIENT_IDS[1],
    status: "completed",
    date: isoDaysAgo(28),
    summary:
      "DEMO DATA. Milestones are concentrated in Level 1 with emerging Level 2 manding and listener skills. Barriers indicate significant absent intraverbal, social and tact repertoires. Recommends comprehensive centre-based services with heavy emphasis on mand training and play skills.",
    raw: buildRawScores({
      milestones: {
        "level1.mand": 4,
        "level1.tact": 3,
        "level1.listener": 4,
        "level1.vp_mts": 4,
        "level1.play": 4,
        "level1.social": 2.5,
        "level1.motor_imitation": 4,
        "level1.echoic": 3,
        "level1.vocal": 2.5,
        "level2.mand": 1.5,
        "level2.tact": 1,
        "level2.listener": 1.5,
        "level2.vp_mts": 2,
        "level2.play": 1,
        "level2.social": 0.5,
        "level2.motor_imitation": 2,
        "level2.echoic": 1.5,
        "level2.vocal": 1,
        "level2.lrffc": 0.5,
        "level2.intraverbal": 0,
        "level2.classroom": 0.5,
        "level3.mand": 0.5,
        "level3.play": 0.5,
      },
      barriers: {
        negative_behaviors: 3,
        instructional_control: 2,
        absent_mand: 1,
        absent_tact: 2,
        absent_listener: 1,
        absent_intraverbal: 4,
        absent_social: 3,
        prompt_dependency: 3,
        conditional_discrim: 3,
        generalization: 2,
        weak_motivators: 2,
        response_weakens: 1,
        reinforcer_dependency: 2,
        self_stimulation: 2,
        articulation: 2,
        hyperactive: 1,
        eye_contact: 1,
        sensory_defensiveness: 1,
      },
      transition: {
        milestones_score: 1,
        barriers_score: 1,
        negative_behaviors: 0,
        classroom_routines: 1,
        generalized_responding: 0,
        rate_acquisition: 1,
        retention: 1,
        natural_environment: 0,
        transfer: 0,
        adaptability: 0,
        spontaneous_behavior: 1,
        self_directed_leisure: 1,
        toileting: 1,
        eating: 2,
        social_play: 0,
        independent_academic: 0,
        generalization_vb: 0,
        peer_reinforcement: 0,
      },
      eesa: { group1: 4, group2: 3, group3: 2, group4: 3, group5: 1 },
      taskAnalysis: { toileting: 4, dressing: 2, eating: 4, communication: 1 },
    }),
  },
  {
    id: ASSESSMENT_IDS[2],
    client_id: CLIENT_IDS[2],
    status: "in_progress",
    date: isoDaysAgo(9),
    summary:
      "DEMO DATA. Assessment in progress — Level 1 and most of Level 2 are scored; Levels 3, barriers, transition and EESA are still being collected across school and clinic sessions.",
    raw: buildRawScores({
      milestones: {
        "level1.mand": 5,
        "level1.tact": 5,
        "level1.listener": 5,
        "level1.vp_mts": 5,
        "level1.play": 4.5,
        "level1.social": 4,
        "level1.motor_imitation": 5,
        "level1.echoic": 5,
        "level1.vocal": 5,
        "level2.mand": 4,
        "level2.tact": 3.5,
        "level2.listener": 4,
        "level2.vp_mts": 4.5,
        "level2.play": 3,
        "level2.social": 2,
        "level2.motor_imitation": 4,
        "level2.echoic": 4,
        "level2.vocal": 3,
        "level2.lrffc": 2.5,
      },
      barriers: {
        negative_behaviors: 2,
        instructional_control: 2,
        absent_intraverbal: 3,
      },
      transition: {},
      eesa: {},
      taskAnalysis: {},
    }),
  },
  {
    id: ASSESSMENT_IDS[3],
    client_id: CLIENT_IDS[3],
    status: "completed",
    date: isoDaysAgo(120),
    summary:
      "DEMO DATA. Milestones cluster in Level 2 with partial Level 3 academic skills. Significant prompt dependency and conditional discrimination barriers remain. Reassessment recommended before services resume.",
    raw: buildRawScores({
      milestones: {
        "level1.mand": 5,
        "level1.tact": 5,
        "level1.listener": 5,
        "level1.vp_mts": 5,
        "level1.play": 5,
        "level1.social": 4,
        "level1.motor_imitation": 5,
        "level1.echoic": 5,
        "level1.vocal": 4.5,
        "level2.mand": 3.5,
        "level2.tact": 3,
        "level2.listener": 3.5,
        "level2.vp_mts": 4,
        "level2.play": 3,
        "level2.social": 2.5,
        "level2.motor_imitation": 3.5,
        "level2.echoic": 3,
        "level2.vocal": 2.5,
        "level2.lrffc": 3,
        "level2.intraverbal": 2,
        "level2.classroom": 3,
        "level3.mand": 1.5,
        "level3.tact": 1.5,
        "level3.listener": 1.5,
        "level3.vp_mts": 2,
        "level3.play": 1,
        "level3.social": 1,
        "level3.motor_imitation": 2,
        "level3.echoic": 1.5,
        "level3.vocal": 1,
        "level3.intraverbal": 1,
        "level3.classroom": 1.5,
        "level3.reading": 1,
        "level3.writing": 1,
        "level3.math": 1,
      },
      barriers: {
        negative_behaviors: 3,
        instructional_control: 2,
        absent_intraverbal: 3,
        absent_social: 2,
        prompt_dependency: 3,
        scrolling: 2,
        conditional_discrim: 3,
        generalization: 2,
        weak_motivators: 1,
        response_weakens: 2,
        reinforcer_dependency: 2,
        self_stimulation: 2,
        articulation: 1,
        hyperactive: 2,
        eye_contact: 1,
        sensory_defensiveness: 2,
      },
      transition: {
        milestones_score: 1,
        barriers_score: 1,
        negative_behaviors: 1,
        classroom_routines: 2,
        generalized_responding: 1,
        rate_acquisition: 1,
        retention: 2,
        natural_environment: 1,
        transfer: 1,
        adaptability: 1,
        spontaneous_behavior: 1,
        self_directed_leisure: 2,
        toileting: 2,
        eating: 2,
        social_play: 1,
        independent_academic: 1,
        generalization_vb: 1,
        peer_reinforcement: 0,
      },
      eesa: { group1: 6, group2: 5, group3: 4, group4: 5, group5: 3 },
      taskAnalysis: { toileting: 6, dressing: 5, eating: 7, communication: 3 },
    }),
  },
];

// ---------------------------------------------------------------------------
// Treatment plan fixtures (3 plans, 2 tied to completed assessments)
// ---------------------------------------------------------------------------

const PLANS = [
  {
    id: PLAN_IDS[0],
    client_id: CLIENT_IDS[0],
    assessment_id: ASSESSMENT_IDS[0],
    status: "approved",
    created: daysAgo(55, 10),
    reason_for_referral:
      "DEMO DATA. Referred by the family's pediatrician following an autism spectrum diagnosis at age 3. Caregivers report limited spontaneous requesting, frequent tantrums during transitions, and difficulty participating in peer play at preschool. A VB-MAPP completed as part of this assessment identifies Level 2 language skills with deficits in intraverbal and social repertoires.",
    diagnosis:
      "Autism Spectrum Disorder (F84.0), Level 2 severity. Speech Delay (R47.9).",
    treatment_history:
      "DEMO DATA. Two years of early intervention (speech therapy twice weekly, developmental therapy weekly). Single-word requesting emerged at age 4. No prior applied behavior analysis services and no history of psychotropic medication.",
    concurrent_services: [
      {
        service: "Speech Therapy",
        provider: "Demo Children's Therapy Center — Sample SLP, MS, CCC-SLP",
      },
      {
        service: "Occupational Therapy",
        provider: "Demo Children's Therapy Center — Sample OT, OTD",
      },
    ],
    family_history:
      "DEMO DATA. Lives with both caregivers and one typically developing sibling. Family is English-speaking with commercial insurance. Caregivers work full time; a grandparent provides childcare two days per week.",
    school_info:
      "DEMO DATA. Attends a half-day inclusive preschool with a visual schedule and preferential seating. Teacher reports parallel play and difficulty with transitions.",
    maladaptive_behaviors: [
      {
        behavior: "Tantrum (screaming, dropping to floor)",
        topography: "Vocal protest, drops to floor, may kick legs.",
        function: "Escape from non-preferred tasks; access to tangibles",
        frequency: "3–5 episodes per day",
        intensity: "Moderate — disrupts activities, no injury",
        duration: "2–10 minutes",
        antecedents:
          "Non-preferred task presented, transition, denied access to tablet",
        consequences: "Task removed; tablet provided intermittently",
        current_intervention: "Caregivers use redirection inconsistently",
      },
      {
        behavior: "Elopement",
        topography: "Leaves the designated area without permission.",
        function: "Escape from demands; adult attention",
        frequency: "1–2 episodes per day",
        intensity: "Moderate — safety concern in the community",
        duration: "Under 1 minute before retrieval",
        antecedents:
          "Demand presentation, transition to a non-preferred location",
        consequences: "Adult follows and returns the client",
        current_intervention:
          "Door alarms at home; 1:1 support during transitions at school",
      },
    ],
    behavior_intervention_plan:
      "DEMO DATA. Function-based intervention. Tantrums maintained by escape: functional communication training teaching a break request, three-step prompting, and differential reinforcement of alternative behavior. Elopement: environmental arrangement, non-contingent reinforcement during transitions, and differential reinforcement of staying in the designated area. ABC data collected for every episode; behavior intervention plan reviewed every 30 days.",
    skill_acquisition_goals: [
      {
        domain: "Communication — Manding",
        description:
          "Client will independently mand for 20 different items or activities using three-word vocal approximations across three settings and three people.",
        measurement:
          "Percent independent across 10-trial sessions; 80% across 3 consecutive probes",
        baseline: "9 independent mands",
        target: "20 independent mands",
        target_date: isoDaysAgo(-150),
      },
      {
        domain: "Social Skills — Peer Play",
        description:
          "Client will initiate a peer interaction (offer a toy, ask a question, or join play) at least three times during a 30-minute free-play period.",
        measurement: "Frequency count during 30-minute observation",
        baseline: "0.5 initiations per observation",
        target: "3 initiations per observation",
        target_date: isoDaysAgo(-150),
      },
      {
        domain: "Listener Responding — Multi-Step Instructions",
        description:
          "Client will follow novel three-step instructions with 80% accuracy across two instructors.",
        measurement:
          "Percent accuracy, first-trial data, 10 trials per session",
        baseline: "40% with two-step instructions",
        target: "80% with three-step instructions",
        target_date: isoDaysAgo(-150),
      },
      {
        domain: "Intraverbal — WH Questions",
        description:
          "Client will answer 10 'what' and 'who' questions about familiar items and people.",
        measurement: "Percent accuracy across 3 consecutive probe sessions",
        baseline: "2 questions",
        target: "10 questions",
        target_date: isoDaysAgo(-150),
      },
    ],
    assessment_outcomes:
      "DEMO DATA. VB-MAPP milestones place the client at approximately Level 2. Strengths: mand, listener responding and motor imitation. Primary barriers: absent intraverbal, conditional discrimination and prompt dependency. Transition assessment supports continued inclusion with systematic prompt fading.",
    parent_training_goals: [
      {
        goal: "Behavior management fidelity",
        method: "Caregiver coaching with a written checklist and video review",
        frequency: "2 sessions per month",
      },
      {
        goal: "Contrive 5 requesting opportunities per hour during daily routines",
        method: "Natural environment teaching during snack and play",
        frequency: "Daily, reviewed weekly",
      },
    ],
    service_coordination_goals: [
      {
        provider: "Demo Children's Therapy Center (SLP)",
        goal: "Align articulation targets with requesting goals",
        method: "Monthly case conference and shared data review",
      },
      {
        provider: "Demo Unified School District",
        goal: "Support IEP development and classroom behavior strategies",
        method: "One hour of school consultation per month",
      },
    ],
    discharge_criteria:
      "DEMO DATA. Discharge will be considered when the client independently requests needs across settings, problem behavior occurs no more than once per week and is managed by caregivers, and the client participates in the general education classroom with fading 1:1 support for 80% of the day.",
    requested_services: [
      {
        service_name: "Direct 1:1 ABA Therapy",
        cpt_code: "97153",
        frequency: "20 hours/week",
        duration: "6 months initial authorization",
        hours_per_week: 20,
      },
      {
        service_name: "BCBA Supervision",
        cpt_code: "97155",
        frequency: "3 hours/week",
        duration: "6 months initial authorization",
        hours_per_week: 3,
      },
      {
        service_name: "Caregiver Training",
        cpt_code: "97156",
        frequency: "2 hours/month",
        duration: "6 months initial authorization",
        hours_per_week: 0.5,
      },
    ],
    therapy_schedule: [
      {
        day: "Monday",
        time: "9:00 AM – 12:00 PM",
        location: "Home",
        service_type: "Direct 1:1",
      },
      {
        day: "Tuesday",
        time: "9:00 AM – 12:00 PM",
        location: "Clinic",
        service_type: "Direct 1:1",
      },
      {
        day: "Wednesday",
        time: "1:00 PM – 4:00 PM",
        location: "Home",
        service_type: "Direct 1:1",
      },
      {
        day: "Thursday",
        time: "9:00 AM – 11:00 AM",
        location: "Clinic",
        service_type: "BCBA Supervision",
      },
      {
        day: "Friday",
        time: "9:00 AM – 12:00 PM",
        location: "Home",
        service_type: "Direct 1:1",
      },
    ],
  },
  {
    id: PLAN_IDS[1],
    client_id: CLIENT_IDS[1],
    assessment_id: ASSESSMENT_IDS[1],
    status: "active",
    created: daysAgo(24, 14),
    reason_for_referral:
      "DEMO DATA. Referred by the regional early intervention program at age 3 following an autism spectrum diagnosis. Caregivers report few spontaneous requests, limited eye contact, and frequent self-stimulatory behavior that interferes with play and mealtimes.",
    diagnosis: "Autism Spectrum Disorder (F84.0), Level 3 severity.",
    treatment_history:
      "DEMO DATA. Six months of early intervention with a developmental specialist. No prior applied behavior analysis services.",
    concurrent_services: [
      {
        service: "Speech Therapy",
        provider: "Demo Speech Partners — Sample SLP, CCC-SLP",
      },
    ],
    family_history:
      "DEMO DATA. Lives with both caregivers and two older siblings. Family is bilingual; written materials are provided in both languages.",
    school_info:
      "DEMO DATA. Attends a centre-based early learning program three mornings per week with 1:1 support.",
    maladaptive_behaviors: [
      {
        behavior: "Self-stimulatory behavior (hand flapping, vocal stereotypy)",
        topography: "Repetitive hand movements and repetitive vocalizations.",
        function: "Automatic reinforcement",
        frequency: "Frequent throughout the day",
        intensity: "Mild to moderate — interferes with instruction",
        duration: "10–60 seconds per episode",
        antecedents: "Low stimulation, down time, difficult tasks",
        consequences: "Naturally maintained",
        current_intervention:
          "Response interruption and redirection during instruction",
      },
      {
        behavior: "Dropping to the floor",
        topography: "Lies down on the floor and refuses to move.",
        function: "Escape from demands",
        frequency: "4–6 episodes per day",
        intensity: "Moderate",
        duration: "1–5 minutes",
        antecedents: "Transition, demand presentation",
        consequences: "Demand delayed or removed",
        current_intervention:
          "Caregivers wait it out, then re-present the demand",
      },
    ],
    behavior_intervention_plan:
      "DEMO DATA. Request training is the primary intervention: high-density mand training with preferred items, prompt fading, and differential reinforcement. Dropping is addressed with transition warnings, first-then contingencies, and escape extinction paired with functional communication training. Data reviewed weekly with caregivers.",
    skill_acquisition_goals: [
      {
        domain: "Communication — Requesting",
        description:
          "Client will independently request 10 preferred items using a vocal approximation or picture exchange across two settings.",
        measurement: "Percent independent across 10-trial sessions",
        baseline: "2 requests",
        target: "10 requests",
        target_date: isoDaysAgo(-120),
      },
      {
        domain: "Play — Independent Play",
        description:
          "Client will play appropriately with five different toys for five minutes each.",
        measurement: "Duration recording per toy",
        baseline: "1 toy for 1 minute",
        target: "5 toys for 5 minutes",
        target_date: isoDaysAgo(-120),
      },
      {
        domain: "Listener Responding — One-Step Instructions",
        description:
          "Client will follow 10 one-step instructions with 80% accuracy.",
        measurement: "Percent accuracy across 3 consecutive probes",
        baseline: "3 instructions",
        target: "10 instructions",
        target_date: isoDaysAgo(-120),
      },
    ],
    assessment_outcomes:
      "DEMO DATA. VB-MAPP milestones are concentrated in Level 1 with emerging Level 2 requesting. Barriers are highest for absent intraverbal, absent social and conditional discrimination. Comprehensive centre-based services are recommended.",
    parent_training_goals: [
      {
        goal: "Implement requesting opportunities during meals and play",
        method: "Caregiver coaching with modelling and feedback",
        frequency: "Weekly, 60 minutes",
      },
    ],
    service_coordination_goals: [
      {
        provider: "Demo Speech Partners (SLP)",
        goal: "Coordinate picture exchange and vocal requesting targets",
        method: "Bi-weekly call and shared data sheet",
      },
    ],
    discharge_criteria:
      "DEMO DATA. Discharge will be considered when the client requests needs independently across settings, problem behavior is below one episode per week, and play and listener skills are age-appropriate.",
    requested_services: [
      {
        service_name: "Direct 1:1 ABA Therapy",
        cpt_code: "97153",
        frequency: "25 hours/week",
        duration: "6 months initial authorization",
        hours_per_week: 25,
      },
      {
        service_name: "BCBA Supervision",
        cpt_code: "97155",
        frequency: "4 hours/week",
        duration: "6 months initial authorization",
        hours_per_week: 4,
      },
    ],
    therapy_schedule: [
      {
        day: "Monday",
        time: "8:30 AM – 12:30 PM",
        location: "Clinic",
        service_type: "Direct 1:1",
      },
      {
        day: "Tuesday",
        time: "8:30 AM – 12:30 PM",
        location: "Clinic",
        service_type: "Direct 1:1",
      },
      {
        day: "Wednesday",
        time: "8:30 AM – 12:30 PM",
        location: "Clinic",
        service_type: "Direct 1:1",
      },
      {
        day: "Thursday",
        time: "8:30 AM – 12:30 PM",
        location: "Home",
        service_type: "Direct 1:1",
      },
      {
        day: "Friday",
        time: "8:30 AM – 11:30 AM",
        location: "Clinic",
        service_type: "BCBA Supervision",
      },
    ],
  },
  {
    id: PLAN_IDS[2],
    client_id: CLIENT_IDS[3],
    assessment_id: ASSESSMENT_IDS[3],
    status: "draft",
    created: daysAgo(6, 15),
    reason_for_referral:
      "DEMO DATA. Re-authorization plan drafted while services are paused for a family relocation. Caregivers requested an updated plan to submit with the new funding request.",
    diagnosis:
      "Autism Spectrum Disorder (F84.0), Level 2 severity. Intellectual Disability (F70).",
    treatment_history:
      "DEMO DATA. Three years of comprehensive applied behavior analysis services with gradual reduction to focused services. No hospitalizations.",
    concurrent_services: [],
    family_history:
      "DEMO DATA. Lives with both caregivers; one sibling with no diagnosed conditions.",
    school_info:
      "DEMO DATA. Attends a self-contained classroom with related services.",
    maladaptive_behaviors: [
      {
        behavior: "Property destruction",
        topography: "Throws materials and tears paper during difficult tasks.",
        function: "Escape from demands",
        frequency: "2–3 episodes per week",
        intensity: "Mild",
        duration: "Under 2 minutes",
        antecedents: "Difficult academic tasks",
        consequences: "Task removed",
        current_intervention: "Task interspersal and break requests",
      },
    ],
    behavior_intervention_plan:
      "DEMO DATA. Break requests taught and reinforced, task interspersal, and visual supports for difficult academic tasks. Data collected by the implementing technician and reviewed monthly.",
    skill_acquisition_goals: [
      {
        domain: "Adaptive — Daily Living",
        description:
          "Client will independently complete a hand-washing routine and a dressing routine.",
        measurement: "Task analysis percent independence",
        baseline: "40% independence",
        target: "90% independence",
        target_date: isoDaysAgo(-180),
      },
      {
        domain: "Academic — Reading",
        description: "Client will read 25 high-frequency sight words.",
        measurement: "Percent correct across 3 consecutive probes",
        baseline: "8 words",
        target: "25 words",
        target_date: isoDaysAgo(-180),
      },
    ],
    assessment_outcomes:
      "DEMO DATA. VB-MAPP milestones cluster in Level 2 with partial Level 3 academic skills. Prompt dependency and conditional discrimination remain the most significant barriers.",
    parent_training_goals: [
      {
        goal: "Use visual supports for morning routines",
        method: "Caregiver coaching with a written routine",
        frequency: "Monthly",
      },
    ],
    service_coordination_goals: [],
    discharge_criteria:
      "DEMO DATA. Discharge will be considered when adaptive and academic goals are met and problem behavior is managed by school staff without behavior-analytic support.",
    requested_services: [
      {
        service_name: "Direct 1:1 ABA Therapy",
        cpt_code: "97153",
        frequency: "10 hours/week",
        duration: "6 months",
        hours_per_week: 10,
      },
      {
        service_name: "BCBA Supervision",
        cpt_code: "97155",
        frequency: "2 hours/week",
        duration: "6 months",
        hours_per_week: 2,
      },
    ],
    therapy_schedule: [
      {
        day: "Monday",
        time: "3:30 PM – 5:30 PM",
        location: "Home",
        service_type: "Direct 1:1",
      },
      {
        day: "Wednesday",
        time: "3:30 PM – 5:30 PM",
        location: "Home",
        service_type: "Direct 1:1",
      },
      {
        day: "Friday",
        time: "3:30 PM – 5:30 PM",
        location: "Clinic",
        service_type: "BCBA Supervision",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/**
 * Delete every demo-marked row, and nothing else. Order respects the foreign
 * keys: children before parents. Treatment plans and assessments reference
 * clients (ON DELETE CASCADE), but deleting them explicitly keeps the counts
 * reported below honest.
 */
async function removeDemoData(): Promise<Record<string, number>> {
  const neon = sql();
  const removed: Record<string, number> = {};
  const tables = [
    "audit_log",
    "signatures",
    "treatment_plans",
    "assessments",
    "clients",
  ];
  for (const table of tables) {
    const rows = await neon.query(
      `DELETE FROM ${table} WHERE is_demo = TRUE RETURNING id`,
    );
    removed[table] = rows.length;
  }
  return removed;
}

// ---------------------------------------------------------------------------
// Demo user
// ---------------------------------------------------------------------------

async function ensureDemoUser(): Promise<{
  id: string;
  name: string;
  created: boolean;
  passwordReset: boolean;
}> {
  const neon = sql();
  const existing = await neon.query(
    "SELECT id, name, password_hash FROM users WHERE lower(email) = lower($1)",
    [DEMO_EMAIL],
  );

  if (existing.length > 0) {
    const user = existing[0] as {
      id: string;
      name: string;
      password_hash: string;
    };
    // Keep the account, but make sure it demonstrates an active paid plan.
    await neon.query(
      "UPDATE users SET plan = 'practice', account_status = 'active' WHERE id = $1",
      [user.id],
    );

    // The documented demo password must actually work for a demo. Only rewrite
    // the hash if the documented password does not already verify.
    //
    // `verifyPassword` (src/server/password.ts) is runtime-agnostic Node
    // `crypto.scrypt` and fails closed on hashes it cannot parse — including
    // the legacy Bun/argon2id strings written by older seeds. That is the
    // intended behaviour: an unverifiable hash gets replaced with a fresh
    // scrypt hash below, so the demo account always works after a seed.
    let passwordReset = false;
    const valid = await verifyPassword(DEMO_PASSWORD, user.password_hash);
    if (!valid) {
      await neon.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
        await hashPassword(DEMO_PASSWORD),
        user.id,
      ]);
      passwordReset = true;
    }
    return { id: user.id, name: user.name, created: false, passwordReset };
  }

  const inserted = await neon.query(
    `INSERT INTO users (email, name, role, password_hash, plan, account_status)
     VALUES ($1, $2, 'bcba', $3, 'practice', 'active')
     RETURNING id`,
    [
      DEMO_EMAIL,
      "Dr. Demo Practitioner",
      await hashPassword(DEMO_PASSWORD),
    ],
  );
  return {
    id: String((inserted[0] as { id: string }).id),
    name: "Dr. Demo Practitioner",
    created: true,
    passwordReset: false,
  };
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

interface AuditRow {
  n: number;
  table: string;
  recordId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  changedBy: string;
  changedAt: Date;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
}

async function insertAuditRows(
  rows: AuditRow[],
  practiceId: string,
): Promise<number> {
  const neon = sql();
  for (const row of rows) {
    await neon.query(
      `INSERT INTO audit_log (id, practice_id, table_name, record_id, action, changed_by, changed_at, old_values, new_values, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, TRUE)`,
      [
        demoId(500 + row.n),
        practiceId,
        row.table,
        row.recordId,
        row.action,
        row.changedBy,
        row.changedAt,
        row.oldValues ? JSON.stringify(row.oldValues) : null,
        row.newValues ? JSON.stringify(row.newValues) : null,
      ],
    );
  }
  return rows.length;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  const neon = sql();

  console.log("🌱 ClearView ABA Suite — demo practice seed\n");

  // 1. Schema (adds the is_demo marker columns on an existing database).
  const migration = await applySchema();
  console.log(`✓ Schema: ${migration.message}`);
  if (!migration.success)
    throw new Error("Schema migration failed — aborting seed.");

  // 2. Demo account.
  const user = await ensureDemoUser();
  console.log(
    `✓ Demo account: ${DEMO_EMAIL} (${user.created ? "created" : "kept"}, plan=practice, account_status=active)` +
      (user.passwordReset
        ? " — password reset to the documented demo password"
        : ""),
  );

  // 2b. The demo practice. `ensurePracticeForUser` reuses the practice the demo
  // account already owns (the one the tenancy backfill created) and only makes
  // a new one when the account has none — so re-seeding never duplicates it.
  const practice = await ensurePracticeForUser(user.id, user.name, "practice");
  const practiceId = practice.practiceId;
  await neon.query(`UPDATE practices SET plan = 'practice' WHERE id = $1`, [
    practiceId,
  ]);
  console.log(
    `✓ Demo practice: "${practice.practiceName}" (${practiceId}, plan=practice)`,
  );

  // 3. Remove the previous demo rows (idempotency: never duplicates).
  const removed = await removeDemoData();
  const removedTotal = Object.values(removed).reduce((a, b) => a + b, 0);
  console.log(
    removedTotal > 0
      ? `✓ Removed previous demo rows: ${Object.entries(removed)
          .filter(([, n]) => n > 0)
          .map(([t, n]) => `${t}=${n}`)
          .join(" ")}`
      : "✓ No previous demo rows to remove",
  );

  const changedBy = DEMO_EMAIL;
  const audit: AuditRow[] = [];
  let auditN = 0;
  const pushAudit = (row: Omit<AuditRow, "n">) =>
    audit.push({ n: ++auditN, ...row });

  // 4. Clients.
  for (const [i, c] of CLIENTS.entries()) {
    const createdAt = daysAgo(70 - i * 8, 9 + i);
    await neon.query(
      `INSERT INTO clients (
         id, name, date_of_birth, gender, contact_email, contact_phone, address,
         referral_source, diagnoses, setting, insurance_info, consent_flags,
         privacy_notes, status, created_at, updated_at, is_demo, practice_id
       ) VALUES (
         $1, $2, $3::date, $4, $5, $6, $7, $8, $9::jsonb, $10, $11::jsonb,
         $12::jsonb, $13, $14, $15, $15, TRUE, $16
       )`,
      [
        c.id,
        c.name,
        dobForAge(c.age),
        c.gender,
        c.email,
        c.phone,
        c.address,
        c.referral,
        JSON.stringify(c.diagnoses),
        c.setting,
        JSON.stringify(c.insurance),
        JSON.stringify(c.consent),
        c.notes,
        c.status,
        createdAt,
        practiceId,
      ],
    );
    pushAudit({
      table: "clients",
      recordId: c.id,
      action: "CREATE",
      changedBy,
      changedAt: createdAt,
      newValues: {
        name: c.name,
        status: c.status,
        setting: c.setting,
        diagnoses: c.diagnoses,
        referral_source: c.referral,
      },
    });
  }
  console.log(
    `✓ Clients: ${CLIENTS.length} inserted (active/inactive/archived mix)`,
  );

  // 5. Assessments.
  for (const a of ASSESSMENTS) {
    const createdAt = new Date(`${a.date}T15:20:00.000Z`);
    await neon.query(
      `INSERT INTO assessments (
         id, client_id, tool_name, tool_version, assessment_date, assessor_name,
         status, raw_scores, summary_notes, created_at, updated_at, is_demo
       ) VALUES (
         $1, $2, 'VB-MAPP', '2.0', $3::date, $4, $5, $6::jsonb, $7, $8, $8, TRUE
       )`,
      [
        a.id,
        a.client_id,
        a.date,
        "Dr. Demo Practitioner, BCBA-D",
        a.status,
        JSON.stringify(a.raw),
        a.summary,
        createdAt,
      ],
    );
    pushAudit({
      table: "assessments",
      recordId: a.id,
      action: "CREATE",
      changedBy,
      changedAt: createdAt,
      newValues: {
        tool_name: "VB-MAPP",
        status: "draft",
        assessment_date: a.date,
      },
    });
    if (a.status !== "draft") {
      pushAudit({
        table: "assessments",
        recordId: a.id,
        action: "UPDATE",
        changedBy,
        changedAt: new Date(createdAt.getTime() + 3 * 60 * 60 * 1000),
        oldValues: { status: "draft" },
        newValues: {
          status: a.status,
          raw_scores: "(VB-MAPP item scores saved)",
        },
      });
    }
  }
  console.log(
    `✓ Assessments: ${ASSESSMENTS.length} inserted (` +
      ASSESSMENTS.map((a) => a.status).join(", ") +
      ")",
  );

  // 6. Treatment plans.
  for (const p of PLANS) {
    await neon.query(
      `INSERT INTO treatment_plans (
         id, client_id, assessment_id, reason_for_referral, diagnosis,
         treatment_history, concurrent_services, family_history, school_info,
         maladaptive_behaviors, behavior_intervention_plan, skill_acquisition_goals,
         assessment_outcomes, parent_training_goals, service_coordination_goals,
         discharge_criteria, requested_services, therapy_schedule, status,
         created_at, updated_at, is_demo
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb, $11, $12::jsonb,
         $13, $14::jsonb, $15::jsonb, $16, $17::jsonb, $18::jsonb, $19, $20, $20, TRUE
       )`,
      [
        p.id,
        p.client_id,
        p.assessment_id,
        p.reason_for_referral,
        p.diagnosis,
        p.treatment_history,
        JSON.stringify(p.concurrent_services),
        p.family_history,
        p.school_info,
        JSON.stringify(p.maladaptive_behaviors),
        p.behavior_intervention_plan,
        JSON.stringify(p.skill_acquisition_goals),
        p.assessment_outcomes,
        JSON.stringify(p.parent_training_goals),
        JSON.stringify(p.service_coordination_goals),
        p.discharge_criteria,
        JSON.stringify(p.requested_services),
        JSON.stringify(p.therapy_schedule),
        p.status,
        p.created,
      ],
    );
    pushAudit({
      table: "treatment_plans",
      recordId: p.id,
      action: "CREATE",
      changedBy,
      changedAt: p.created,
      newValues: {
        status: "draft",
        diagnosis: p.diagnosis,
        assessment_id: p.assessment_id,
      },
    });
    if (p.status !== "draft") {
      pushAudit({
        table: "treatment_plans",
        recordId: p.id,
        action: "UPDATE",
        changedBy,
        changedAt: new Date(p.created.getTime() + 2 * DAY),
        oldValues: { status: "review" },
        newValues: { status: p.status },
      });
    }
  }
  console.log(
    `✓ Treatment plans: ${PLANS.length} inserted (` +
      PLANS.map((p) => p.status).join(", ") +
      ")",
  );

  // 7. Signatures — a fully-signed plan (BCBA + guardian) and a signed assessment.
  const signatures = [
    {
      id: SIGNATURE_IDS[0],
      document_type: "treatment_plan",
      document_id: PLAN_IDS[0],
      signer_name: "Dr. Demo Practitioner, BCBA-D",
      signer_role: "bcba",
      signedAt: new Date(PLANS[0].created.getTime() + 3 * DAY),
      n: 0,
    },
    {
      id: SIGNATURE_IDS[1],
      document_type: "treatment_plan",
      document_id: PLAN_IDS[0],
      signer_name: "Demo Guardian A (fictional)",
      signer_role: "parent_guardian",
      signedAt: new Date(PLANS[0].created.getTime() + 4 * DAY),
      n: 1,
    },
    {
      id: SIGNATURE_IDS[2],
      document_type: "assessment",
      document_id: ASSESSMENT_IDS[0],
      signer_name: "Dr. Demo Practitioner, BCBA-D",
      signer_role: "bcba",
      signedAt: new Date(`${ASSESSMENTS[0].date}T17:05:00.000Z`),
      n: 2,
    },
  ];
  for (const s of signatures) {
    await neon.query(
      `INSERT INTO signatures (
         id, document_type, document_id, signer_name, signer_role,
         signature_data, signed_at, ip_address, is_demo
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, '192.0.2.10', TRUE)`,
      [
        s.id,
        s.document_type,
        s.document_id,
        s.signer_name,
        s.signer_role,
        signatureImage(s.n),
        s.signedAt,
      ],
    );
    pushAudit({
      table: "signatures",
      recordId: s.id,
      action: "CREATE",
      changedBy: s.signer_name,
      changedAt: s.signedAt,
      newValues: {
        document_type: s.document_type,
        document_id: s.document_id,
        signer_role: s.signer_role,
        signer_name: s.signer_name,
      },
    });
  }
  console.log(
    `✓ Signatures: ${signatures.length} inserted (1 signed treatment plan, 1 signed assessment)`,
  );

  // 8. A status change on a client, so the audit log shows an UPDATE with a diff.
  pushAudit({
    table: "clients",
    recordId: CLIENT_IDS[3],
    action: "UPDATE",
    changedBy,
    changedAt: daysAgo(5, 11),
    oldValues: { status: "active" },
    newValues: { status: "inactive" },
  });

  const auditCount = await insertAuditRows(audit, practiceId);
  console.log(`✓ Audit log: ${auditCount} entries inserted`);

  // 9. Summary + idempotency check.
  console.log("\n📊 Row counts after this run:");
  const tables = [
    "users",
    "clients",
    "assessments",
    "treatment_plans",
    "signatures",
    "audit_log",
  ];
  for (const table of tables) {
    const [total] = await neon.query(`SELECT count(*)::int AS c FROM ${table}`);
    if (table === "users") {
      console.log(
        `   ${table.padEnd(16)} total=${String(total.c).padStart(3)}`,
      );
      continue;
    }
    const [demo] = await neon.query(
      `SELECT count(*)::int AS c FROM ${table} WHERE is_demo = TRUE`,
    );
    console.log(
      `   ${table.padEnd(16)} total=${String(total.c).padStart(3)}  demo=${String(demo.c).padStart(3)}`,
    );
  }

  console.log("\n🔑 Demo credentials:");
  console.log(`   URL:      /login`);
  console.log(`   Email:    ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log(`   Plan:     practice (account_status=active)`);

  console.log("\n🔗 Stable demo links (ids never change between runs):");
  console.log(`   /clients/${CLIENT_IDS[0]}`);
  console.log(`   /assessments/${ASSESSMENT_IDS[0]}`);
  console.log(`   /assessments/${ASSESSMENT_IDS[0]}/vb-mapp`);
  console.log(`   /treatment-plans/${PLAN_IDS[0]}`);
  console.log(
    "\n🧹 Remove the demo practice at any time: bun src/db/seed-demo.ts --remove",
  );
  console.log("\n✅ Demo seed complete.");
}

async function remove() {
  console.log("🧹 Removing ClearView ABA Suite demo practice\n");
  const removed = await removeDemoData();
  const total = Object.values(removed).reduce((a, b) => a + b, 0);
  for (const [table, n] of Object.entries(removed))
    console.log(`   ${table.padEnd(16)} ${n}`);
  console.log(
    total > 0
      ? "\n✅ Demo rows removed. The demo user account and its (now empty) practice were left in place, so the demo login still works."
      : "\n✅ Nothing to remove — no demo rows found.",
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

// The schema/`.env` lookups are relative to the project root, so make sure we
// run from there even if the script is invoked by absolute path.
if (!existsSync(join(process.cwd(), "src", "db", "schema.sql"))) {
  process.chdir(join(import.meta.dir, "..", ".."));
}

if (import.meta.main) {
  const isRemove = process.argv.includes("--remove");
  try {
    if (isRemove) await remove();
    else await seed();
    process.exit(0);
  } catch (err) {
    console.error(
      "\n❌ Demo seed failed:",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }
}
