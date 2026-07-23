// ClearView ABA Suite — VB-MAPP Assessment Data Definitions
// Defines the structure of all VB-MAPP components for the assessment form.

// ---- Milestones ----

export interface DomainItems {
  name: string;
  items: string[]; // item labels
}

export interface LevelDomains {
  [domainKey: string]: DomainItems;
}

export const VB_MAPP_MILESTONES: {
  level1: LevelDomains;
  level2: LevelDomains;
  level3: LevelDomains;
} = {
  level1: {
    mand: {
      name: "Mand",
      items: [
        "Emits 2 words/signs/pexs with echoic or imitative prompt, but may require supplemental prompting",
        "Emits 4 different mands without prompts (except, 'What do you want?') — the object can be present",
        "Generalizes 6 mands across 2 people, 2 settings, and 2 examples of a reinforcer",
        "Spontaneously emits 5-10 mands per day (no prompts, objects may be present)",
        "Emits 10 different mands without prompts (objects may be present)",
      ],
    },
    tact: {
      name: "Tact",
      items: [
        "Tacts 2 items that are reinforcing with echoic or imitative prompts",
        "Tacts any 4 items without echoic prompts",
        "Tacts 6 non-reinforcing items",
        "Spontaneously tacts 2 different items",
        "Tacts 10 items",
      ],
    },
    listener: {
      name: "Listener Responding",
      items: [
        "Attends to speaker's voice by making eye contact with the speaker 5 times",
        "Responds to hearing own name 5 times",
        "Looks at, touches, or points to the correct family member when named",
        "Performs 4 motor actions on command without visual prompt",
        "Selects correct item from an array of 3 when named",
      ],
    },
    vp_mts: {
      name: "Visual Perceptual / Match-to-Sample",
      items: [
        "Visually tracks moving stimuli for 2 seconds",
        "Picks up 1 item and places it in container (not forced)",
        "Visually attends to a toy or book for 30 seconds",
        "Places 3 items in container, stacks 3 blocks, or places 3 rings on peg",
        "Matches any 10 items that are identical",
      ],
    },
    play: {
      name: "Independent Play",
      items: [
        "Manipulates and explores objects for 30 seconds",
        "Shows variation in play by independently interacting with 5 different items",
        "Demonstrates generalized use of toys (plays with 5 items appropriately)",
        "Engages in movement play for 2 minutes",
        "Plays independently with cause-and-effect toys for 2 minutes",
      ],
    },
    social: {
      name: "Social Behavior / Social Play",
      items: [
        "Visually tracks and shows interest in people for 5 seconds",
        "Makes eye contact as a mand for social interaction 2 times",
        "Independently mands for others to participate in play or social routines 2 times",
        "Spontaneously engages in parallel play near other children for 2 minutes",
        "Spontaneously mands for peer to join in play 2 times",
      ],
    },
    motor_imitation: {
      name: "Motor Imitation",
      items: [
        "Imitates 2 gross motor movements with a prompt",
        "Imitates 4 gross motor movements without prompt",
        "Imitates 8 motor movements (some fine motor)",
        "Spontaneously imitates the motor behaviors of others 5 times",
        "Imitates 20 motor movements of any type",
      ],
    },
    echoic: {
      name: "Echoic",
      items: [
        "Emits 2 sounds on echoic demand",
        "Emits 5 sounds on echoic demand",
        "Emits 10 sounds or word approximations on echoic demand",
        "Emits 5 full words on echoic demand",
        "Emits 10 full words on echoic demand",
      ],
    },
    vocal: {
      name: "Spontaneous Vocal Behavior",
      items: [
        "Emits 5 sounds spontaneously per day",
        "Spontaneous sounds are speech-like with varied intonations",
        "Spontaneously emits 10 different speech-like sounds",
        "Spontaneously emits 5 words per day",
        "Spontaneously vocalizes with appropriate volume and intonation",
      ],
    },
  },

  level2: {
    mand: {
      name: "Mand",
      items: [
        "Mands for 20 different missing items without prompts",
        "Mands for others to perform 5 different actions",
        "Emits 5 different mands containing 2 words",
        "Spontaneously emits 15-20 mands per day",
        "Emits 10 novel mands without training",
      ],
    },
    tact: {
      name: "Tact",
      items: [
        "Tacts 25 items when asked 'What's that?'",
        "Tacts 25 pictures of items",
        "Tacts 10 ongoing actions",
        "Tacts items with 2 or more words (e.g., 'big dog')",
        "Tacts at least 50 items and/or pictures",
      ],
    },
    listener: {
      name: "Listener Responding",
      items: [
        "Selects correct item from array of 6 when named",
        "Follows 2 different 2-step instructions",
        "Selects items by feature (e.g., 'the one that's round')",
        "Selects items by function (e.g., 'the one you eat with')",
        "Selects items by class (e.g., 'the animal')",
      ],
    },
    vp_mts: {
      name: "Visual Perceptual / Match-to-Sample",
      items: [
        "Matches identical objects to pictures (2D-3D matching)",
        "Matches non-identical items (e.g., different types of cups)",
        "Matches associated items (e.g., sock to shoe)",
        "Sorts items by color, shape, or size",
        "Completes a 5-piece puzzle",
      ],
    },
    play: {
      name: "Independent Play",
      items: [
        "Plays with 5 different toys/activities appropriately for 5 minutes each",
        "Engages in pretend play (e.g., pretends to feed a doll)",
        "Completes play sequences with multiple steps",
        "Plays with toys designed for 18-30 month development",
        "Engages in independent constructive play (e.g., building with blocks)",
      ],
    },
    social: {
      name: "Social Behavior / Social Play",
      items: [
        "Initiates physical interaction with peer 2 times",
        "Spontaneously mands for peer to join in play 2 times",
        "Engages in sustained social play for 3 minutes with peer",
        "Responds to peer's initiations 5 times",
        "Takes turns with peer during simple games",
      ],
    },
    motor_imitation: {
      name: "Motor Imitation",
      items: [
        "Imitates 5 actions with objects (in context)",
        "Imitates 10 oral-motor movements",
        "Imitates novel 3-step motor sequences",
        "Imitates fine motor actions (e.g., finger play)",
        "Spontaneously imitates peer's motor behaviors 2 times",
      ],
    },
    echoic: {
      name: "Echoic",
      items: [
        "Echoes 2-syllable combinations",
        "Echoes 3-syllable combinations",
        "Echoes phrases of 3-5 words",
        "Echoes varied intonation patterns",
        "Echoes at appropriate volume and rate",
      ],
    },
    vocal: {
      name: "Spontaneous Vocal Behavior",
      items: [
        "Emits 10 spontaneous two-word phrases per day",
        "Vocalizes requests spontaneously",
        "Vocalizes comments about ongoing events",
        "Uses appropriate volume in different settings",
        "Emits varied intonation patterns spontaneously",
      ],
    },
    lrffc: {
      name: "Listener Responding by Function/Feature/Class",
      items: [
        "Selects item given 2 verbal components (e.g., feature + class)",
        "Selects item from array of 8 given function/feature/class",
        "Selects items given 3 verbal components",
        "Selects items when asked with 'which one' questions",
        "Selects the correct item from a scene or picture",
      ],
    },
    intraverbal: {
      name: "Intraverbal",
      items: [
        "Fills in words from songs/rhymes (e.g., 'Twinkle twinkle little…')",
        "Completes 10 fill-in-the-blank phrases with function/feature/class",
        "Answers 2 questions about self (e.g., 'What's your name?')",
        "Answers 5 questions about ongoing activities",
        "Answers 5 different 'what' questions",
      ],
    },
    classroom: {
      name: "Classroom Routines / Group Skills",
      items: [
        "Follows 2 group instructions (e.g., 'Everyone sit down')",
        "Sits in small group for 5 minutes without disruptive behavior",
        "Responds to individual instruction within group setting",
        "Transitions between activities with group",
        "Raises hand or uses other signal to get teacher's attention",
      ],
    },
  },

  level3: {
    mand: {
      name: "Mand",
      items: [
        "Mands for information using 'what', 'who', 'where' questions",
        "Mands for information using 'when', 'why', 'how' questions",
        "Mands for others to attend to self (e.g., 'Watch me!')",
        "Mands for missing items without having them present",
        "Mands using sentences with 5+ words",
      ],
    },
    tact: {
      name: "Tact",
      items: [
        "Tacts items using adjectives and prepositions",
        "Tacts items using class (e.g., 'That's a vehicle')",
        "Tacts 100+ items/pictures",
        "Tacts parts and features of items",
        "Tacts the function of items",
      ],
    },
    listener: {
      name: "Listener Responding",
      items: [
        "Follows 3-step instructions",
        "Selects items from larger arrays (10+ items)",
        "Selects items by multiple features/functions/classes",
        "Follows instructions involving prepositions",
        "Follows instructions involving pronouns",
      ],
    },
    vp_mts: {
      name: "Visual Perceptual / Match-to-Sample",
      items: [
        "Matches complex patterns/designs",
        "Completes 10+ piece puzzles",
        "Matches items by association (e.g., toothbrush to toothpaste)",
        "Sequences 4-6 pictures to tell a story",
        "Demonstrates spatial relations (above/below, left/right)",
      ],
    },
    play: {
      name: "Independent Play",
      items: [
        "Engages in complex pretend play (themes with multiple steps)",
        "Plays independently with constructive toys for 10+ minutes",
        "Completes multi-step arts/crafts activities",
        "Plays board games or structured games with rules",
        "Invents novel play themes or scenarios",
      ],
    },
    social: {
      name: "Social Behavior / Social Play",
      items: [
        "Engages in cooperative play with peer for 10+ minutes",
        "Responds to peer's conversational initiations 5 times",
        "Takes turns in conversation with peer",
        "Shares materials/toys with peer without prompting",
        "Initiates and maintains social interaction with peer for 5+ exchanges",
      ],
    },
    motor_imitation: {
      name: "Motor Imitation",
      items: [
        "Imitates complex motor sequences from video/model",
        "Imitates novel actions after brief observation",
        "Imitates peer during group activities",
        "Imitates actions from pictures/diagrams",
        "Imitates fine motor tasks (e.g., drawing shapes)",
      ],
    },
    echoic: {
      name: "Echoic",
      items: [
        "Echoes sentences of 6+ words",
        "Echoes with appropriate prosody and inflection",
        "Echoes novel word combinations",
        "Echoes at conversational rate",
        "Echoes with appropriate volume for setting",
      ],
    },
    vocal: {
      name: "Spontaneous Vocal Behavior",
      items: [
        "Spontaneously emits 20+ sentences per day",
        "Describes ongoing events in 3+ word sentences",
        "Asks spontaneous 'wh-' questions 5+ times per day",
        "Initiates conversation on varied topics",
        "Uses appropriate conversational voice volume",
      ],
    },
    intraverbal: {
      name: "Intraverbal",
      items: [
        "Answers 25 different 'what' questions",
        "Answers 25 different 'who/where' questions",
        "Answers 'when/why/how' questions",
        "Engages in conversation with 5+ verbal exchanges",
        "Tells stories with a beginning, middle, and end",
      ],
    },
    classroom: {
      name: "Classroom Routines / Group Skills",
      items: [
        "Follows multi-step group instructions",
        "Participates in group discussions (raises hand, waits turn)",
        "Works independently for 5+ minutes during group activity",
        "Completes assignments in group setting",
        "Follows classroom schedule independently",
      ],
    },
    reading: {
      name: "Reading",
      items: [
        "Matches letters to letter names",
        "Identifies own name in print",
        "Matches words to pictures",
        "Letters sounds for 10+ letters",
        "Reads 5+ sight words",
      ],
    },
    writing: {
      name: "Writing",
      items: [
        "Traces lines and shapes",
        "Copies straight lines and circles",
        "Copies letters of own name",
        "Writes own name independently",
        "Copies simple words",
      ],
    },
    math: {
      name: "Math",
      items: [
        "Counts objects to 5 with 1:1 correspondence",
        "Identifies written numbers 1-10",
        "Matches numbers to quantities 1-5",
        "Completes simple patterns (AB, ABC)",
        "Understands concepts of 'more' and 'less'",
      ],
    },
  },
};

// ---- Barriers ----

export const VB_MAPP_BARRIERS: { key: string; name: string; description: string }[] = [
  { key: "negative_behaviors", name: "Negative Behaviors", description: "Tantrums, aggression, self-injury, property destruction" },
  { key: "instructional_control", name: "Instructional Control", description: "Escape/avoidance of demands or instructional settings" },
  { key: "absent_mand", name: "Absence of Mand", description: "Limited requesting repertoire" },
  { key: "absent_tact", name: "Absence of Tact", description: "Limited labeling/reporting repertoire" },
  { key: "absent_motor_imitation", name: "Absence of Motor Imitation", description: "Difficulty imitating motor actions" },
  { key: "absent_echoic", name: "Absence of Echoic", description: "Difficulty repeating sounds/words" },
  { key: "absent_mts", name: "Absence of Matching-to-Sample", description: "Difficulty matching items or pictures" },
  { key: "absent_listener", name: "Absence of Listener", description: "Difficulty responding to speaker's verbal behavior" },
  { key: "absent_intraverbal", name: "Absence of Intraverbal", description: "Difficulty with conversational exchanges, answering questions" },
  { key: "absent_social", name: "Absence of Social Skills", description: "Limited social interaction and play skills" },
  { key: "prompt_dependency", name: "Prompt Dependency", description: "Over-reliance on prompts to emit correct responses" },
  { key: "scrolling", name: "Scrolling Responses", description: "Rapidly emitting multiple incorrect responses to a single trial" },
  { key: "impaired_scanning", name: "Impaired Scanning", description: "Failure to scan array of stimuli before responding" },
  { key: "conditional_discrim", name: "Failure to Make Conditional Discriminations", description: "Difficulty with conditional discrimination tasks" },
  { key: "generalization", name: "Failure to Generalize", description: "Skills not demonstrated across settings, people, materials" },
  { key: "weak_motivators", name: "Weak Motivators", description: "Limited or weak reinforcing stimuli" },
  { key: "response_weakens", name: "Response Requirement Weakens Motivator", description: "Value of reinforcer decreases when response requirement increases" },
  { key: "reinforcer_dependency", name: "Reinforcer Dependency", description: "Excessive dependence on tangible reinforcers" },
  { key: "self_stimulation", name: "Self-Stimulation", description: "Stereotypic or repetitive behaviors that interfere with learning" },
  { key: "articulation", name: "Articulation Problems", description: "Poor articulation/phonological skills" },
  { key: "ocd", name: "Obsessive-Compulsive Behavior", description: "Ritualistic or compulsive behaviors" },
  { key: "hyperactive", name: "Hyperactive Behavior", description: "Excessive motor activity that interferes with learning" },
  { key: "eye_contact", name: "Failure to Make Eye Contact", description: "Limited eye contact during social or instructional interactions" },
  { key: "sensory_defensiveness", name: "Sensory Defensiveness", description: "Over-sensitivity to sensory stimuli (sound, touch, light, etc.)" },
];

// ---- Transition ----

export const VB_MAPP_TRANSITION: { key: string; name: string }[] = [
  { key: "milestones_score", name: "Overall Milestones score is at least 60" },
  { key: "barriers_score", name: "Overall Barriers score is 15 or less" },
  { key: "negative_behaviors", name: "Negative behaviors do not impede learning" },
  { key: "classroom_routines", name: "Demonstrates classroom routines and group skills" },
  { key: "generalized_responding", name: "Generalized responding across settings and people" },
  { key: "rate_acquisition", name: "Rate of skill acquisition is sufficient" },
  { key: "retention", name: "Retention of previously learned skills" },
  { key: "natural_environment", name: "Learning occurs in natural environment" },
  { key: "transfer", name: "Transfer of skills without formal training" },
  { key: "adaptability", name: "Adaptability to change in routine/environment" },
  { key: "spontaneous_behavior", name: "Demonstrates spontaneous vocal and social behavior" },
  { key: "self_directed_leisure", name: "Engages in self-directed leisure activities" },
  { key: "toileting", name: "Toileting skills are age-appropriate" },
  { key: "eating", name: "Eating/feeding skills are age-appropriate" },
  { key: "social_play", name: "Engages in social play with peers" },
  { key: "independent_academic", name: "Works independently on academic tasks" },
  { key: "generalization_vb", name: "Verbal behavior generalizes across settings and people" },
  { key: "peer_reinforcement", name: "Peer attention functions as reinforcement" },
];

// ---- EESA ----

export const VB_MAPP_EESA_GROUPS: { key: string; name: string; targets: string[] }[] = [
  {
    key: "group1",
    name: "Group 1 — Simple Syllables & Vowel-Consonant",
    targets: [
      "ah", "oh", "ee", "oo", "mm",
      "bah", "pah", "mah", "dah", "tah",
    ],
  },
  {
    key: "group2",
    name: "Group 2 — 2-Syllable Combinations",
    targets: [
      "mama", "papa", "baba", "dada",
      "tata", "nana", "wawa", "yaya",
    ],
  },
  {
    key: "group3",
    name: "Group 3 — 3-Syllable & Varied Combinations",
    targets: [
      "bababa", "dadada", "mamama",
      "papapa", "tatata", "wawawa",
      "lalala", "nanana",
    ],
  },
  {
    key: "group4",
    name: "Group 4 — Consonant Clusters & Blends",
    targets: [
      "bl", "br", "cl", "dr", "fl",
      "gr", "pl", "st", "tr", "sp",
    ],
  },
  {
    key: "group5",
    name: "Group 5 — Multi-Syllabic Words & Phrases",
    targets: [
      "butterfly", "dinosaur", "elephant",
      "helicopter", "kangaroo", "motorcycle",
      "refrigerator", "television",
    ],
  },
];

// ---- Task Analysis Domains ----

export const VB_MAPP_TASK_ANALYSIS_DOMAINS: { key: string; name: string; skills: string[] }[] = [
  {
    key: "toileting",
    name: "Toileting Skills",
    skills: [
      "Indicates need to use bathroom",
      "Sits on toilet independently",
      "Urinates in toilet",
      "Has bowel movement in toilet",
      "Wipes independently after toileting",
      "Flushes toilet after use",
      "Washes hands after toileting",
      "Remains dry during day",
      "Remains dry during night",
      "Manages clothing during toileting",
    ],
  },
  {
    key: "dressing",
    name: "Dressing Skills",
    skills: [
      "Removes socks and shoes",
      "Puts on socks",
      "Puts on shoes",
      "Removes pants",
      "Puts on pants",
      "Removes shirt",
      "Puts on shirt",
      "Fastens Velcro closures",
      "Zips zipper",
      "Buttons buttons",
    ],
  },
  {
    key: "eating",
    name: "Eating/Feeding Skills",
    skills: [
      "Uses spoon independently",
      "Uses fork independently",
      "Drinks from open cup",
      "Drinks from straw",
      "Chews food appropriately",
      "Uses napkin to wipe face",
      "Sits at table for duration of meal",
      "Accepts variety of food textures",
      "Self-feeds finger foods",
      "Pours liquid from small pitcher",
    ],
  },
  {
    key: "communication",
    name: "Functional Communication",
    skills: [
      "Requests preferred items/activities",
      "Requests help when needed",
      "Requests break from task",
      "Protests/refuses appropriately",
      "Responds to yes/no questions",
      "Follows 1-step directions",
      "Follows 2-step directions",
      "Greets others appropriately",
      "Answers personal information questions",
      "Initiates social interaction",
    ],
  },
];

// ---- Helper to initialize empty scores ----

export function initMilestonesScores(): Record<string, Record<string, number[]>> {
  const scores: Record<string, Record<string, number[]>> = {};
  for (const [level, domains] of Object.entries(VB_MAPP_MILESTONES)) {
    scores[level] = {};
    for (const [domainKey, domain] of Object.entries(domains)) {
      scores[level][domainKey] = new Array(domain.items.length).fill(0);
    }
  }
  return scores;
}

export function initBarriersScores(): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const b of VB_MAPP_BARRIERS) {
    scores[b.key] = 0;
  }
  return scores;
}

export function initTransitionScores(): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const t of VB_MAPP_TRANSITION) {
    scores[t.key] = 0;
  }
  return scores;
}

export function initEESAScores(): Record<string, number[]> {
  const scores: Record<string, number[]> = {};
  for (const g of VB_MAPP_EESA_GROUPS) {
    scores[g.key] = new Array(g.targets.length).fill(0);
  }
  return scores;
}

export function initTaskAnalysisScores(): Record<string, number[]> {
  const scores: Record<string, number[]> = {};
  for (const d of VB_MAPP_TASK_ANALYSIS_DOMAINS) {
    scores[d.key] = new Array(d.skills.length).fill(0);
  }
  return scores;
}
