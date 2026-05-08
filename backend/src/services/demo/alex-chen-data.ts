/**
 * Alex Chen demo persona — richer "onboarding experience" data.
 *
 * Persona: Alex Chen, 32, product manager at a mid-size SaaS company in SF.
 * Uses ZenAI as a second brain for work + personal life. Lives in Mission
 * district, runs three times a week, vegetarian, dad to a 4-year-old.
 *
 * Scope (as per demo onboarding spec):
 *   - 4 core memory blocks (persona, preferences, goals, context)
 *   - 10 topics (work + personal)
 *   - 30 ideas (distributed across topics)
 *   - 150 learned_facts (biographical + preferences + work context)
 *   - ~200 episodic memories (light templated, no real embeddings)
 *
 * All data is generated deterministically from a seed so repeated seeds
 * produce identical content (useful for tests / demo reset consistency).
 */

// ─── IDs & User ───────────────────────────────────────────────────────

export const ALEX_USER_ID = '00000000-0000-0000-0000-000000000003';
export const ALEX_CONTEXT = 'demo'; // fits into existing 'demo' schema usage

// ─── Deterministic PRNG ───────────────────────────────────────────────

export function alexRng(seed = 1337): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function seededUuid(prefix: string, index: number): string {
  // Stable, deterministic UUID-like id (v4 format but not random) per entity.
  const hex = index.toString(16).padStart(12, '0');
  return `0${prefix}-0000-4000-8000-${hex}`;
}

// ─── Core Memory Blocks (4) ───────────────────────────────────────────

export interface AlexCoreBlock {
  block_type: 'persona' | 'preferences' | 'goals' | 'context';
  content: string;
}

export const ALEX_CORE_BLOCKS: AlexCoreBlock[] = [
  {
    block_type: 'persona',
    content:
      "User's name is Alex Chen. Age 32. Product Manager at a mid-size SaaS company in San Francisco. " +
      'Lives in the Mission district with partner Sam and their 4-year-old child Riley. Pronouns: they/them.',
  },
  {
    block_type: 'preferences',
    content:
      'Communication style: concise, bullet-heavy, loves diagrams. Avoids jargon. Prefers async work. ' +
      'Vegetarian since 2019. Runs three times a week (Tue / Thu / Sat). Morning person — schedule deep work before 11am. ' +
      'Uses Figma, Linear, Notion, Slack daily. Not a fan of status meetings.',
  },
  {
    block_type: 'goals',
    content:
      "2026 goals: (1) Ship v2 of internal analytics platform by Q3. (2) Mentor two junior PMs. " +
      "(3) Complete marathon in October. (4) Re-read 'Thinking, Fast and Slow' and journal weekly.",
  },
  {
    block_type: 'context',
    content:
      'Current work focus: analytics rebuild project. Stakeholders: Priya (Eng Lead), Diego (Design Lead), Meera (CS). ' +
      "Home context: Riley starts preschool September 2026. Partner Sam is a nurse, rotates night shifts. " +
      "Aunt Lin visiting from Taipei in June — planning weekend in Yosemite.",
  },
];

// ─── Topics (10) ──────────────────────────────────────────────────────

export interface AlexTopic {
  id: string;
  name: string;
  description: string;
  color: string;
  context: string;
  user_id: string;
}

const TOPIC_SEEDS: { name: string; description: string; color: string }[] = [
  { name: 'Analytics Rebuild', description: 'v2 of the internal analytics platform (Q3 target).', color: '#4f46e5' },
  { name: 'Mentorship', description: 'Mentoring two junior PMs, feedback notes, career conversations.', color: '#06b6d4' },
  { name: 'Running', description: 'Training log and race prep for October marathon.', color: '#16a34a' },
  { name: 'Reading', description: 'Book notes, highlights, and weekly journaling.', color: '#f59e0b' },
  { name: 'Family', description: 'Riley milestones, household planning, partner schedules.', color: '#ec4899' },
  { name: 'Home', description: 'Apartment maintenance, appointments, groceries, meal plans.', color: '#a855f7' },
  { name: 'Travel', description: 'Yosemite weekend planning, upcoming visits, bucket list.', color: '#0ea5e9' },
  { name: 'Team Ops', description: 'Sprint planning, 1:1 topics, team rituals.', color: '#64748b' },
  { name: 'Product Strategy', description: 'Competitor research, long-term roadmap, customer insights.', color: '#dc2626' },
  { name: 'Personal Health', description: 'Sleep, nutrition, stretching routine, mental load tracking.', color: '#059669' },
];

export const ALEX_TOPICS: AlexTopic[] = TOPIC_SEEDS.map((t, i) => ({
  id: seededUuid('topic', i + 1),
  name: t.name,
  description: t.description,
  color: t.color,
  context: ALEX_CONTEXT,
  user_id: ALEX_USER_ID,
}));

// ─── Ideas (30, distributed across topics) ────────────────────────────

export interface AlexIdea {
  id: string;
  title: string;
  summary: string;
  type: 'idea' | 'insight' | 'task' | 'note';
  category: 'technical' | 'business' | 'personal' | 'creative';
  priority: 'low' | 'medium' | 'high';
  is_archived: boolean;
  context: string;
  user_id: string;
  topic_id: string;
}

const IDEA_SEEDS: { title: string; summary: string; topicIdx: number; type: AlexIdea['type']; category: AlexIdea['category']; priority: AlexIdea['priority'] }[] = [
  // Analytics Rebuild (6)
  { title: 'Adopt column-oriented store for events', summary: 'DuckDB or ClickHouse for ad-hoc queries — saves >60% on dashboard latency per spike test.', topicIdx: 0, type: 'idea', category: 'technical', priority: 'high' },
  { title: 'Drop-off funnel widget MVP', summary: 'Single-chart widget comparing onboarding funnel WoW. Priya to review design.', topicIdx: 0, type: 'task', category: 'technical', priority: 'high' },
  { title: 'Event schema v2 — rename everything', summary: 'Consolidate 42 legacy event names; draft RFC shared in #data-platform channel.', topicIdx: 0, type: 'idea', category: 'technical', priority: 'medium' },
  { title: 'Customer retention cohort insight', summary: 'Users who hit dashboard in week 1 retain 3x longer. Run the query monthly.', topicIdx: 0, type: 'insight', category: 'business', priority: 'high' },
  { title: 'Vendor call: Snowflake vs Redshift', summary: 'Notes from discovery call; follow-up scheduled for April 22.', topicIdx: 0, type: 'note', category: 'technical', priority: 'medium' },
  { title: 'Self-serve drill-downs', summary: 'Users expect drill into any chart. Bring to Q2 OKR review.', topicIdx: 0, type: 'idea', category: 'business', priority: 'medium' },

  // Mentorship (3)
  { title: 'Coaching framework for juniors', summary: 'Use GROW model: Goal, Reality, Options, Will — scaffold weekly 1:1s.', topicIdx: 1, type: 'idea', category: 'personal', priority: 'medium' },
  { title: 'Mika 1:1 — focus topics this month', summary: 'Stakeholder management and cross-functional comms. Assign article + recap.', topicIdx: 1, type: 'note', category: 'personal', priority: 'medium' },
  { title: 'Write junior PM playbook', summary: 'Draft by end of May: discovery → synthesis → writing. Share w/ Priya for review.', topicIdx: 1, type: 'task', category: 'personal', priority: 'low' },

  // Running (3)
  { title: 'Marathon training plan — Pfitzinger 18/55', summary: 'Start block June 1. Log weekly mileage + heart-rate zones.', topicIdx: 2, type: 'idea', category: 'personal', priority: 'high' },
  { title: 'Running shoes rotation', summary: 'Mizuno Wave Sky for long runs, Saucony Endorphin for speed days.', topicIdx: 2, type: 'note', category: 'personal', priority: 'low' },
  { title: 'Post-run recovery protocol', summary: 'Protein + tart cherry juice within 30 min; foam roll glutes Monday / Wednesday.', topicIdx: 2, type: 'insight', category: 'personal', priority: 'medium' },

  // Reading (3)
  { title: 'Re-read TF&S — chapters 11-13 first', summary: 'Focus: availability + representativeness heuristics. Write one-pager per chapter.', topicIdx: 3, type: 'task', category: 'personal', priority: 'medium' },
  { title: 'Book queue Q2', summary: 'Then: Range (Epstein), The Mom Test, Designing Data-Intensive Apps — re-read.', topicIdx: 3, type: 'note', category: 'personal', priority: 'low' },
  { title: 'Weekly journal Sundays 7am', summary: 'Prompts: biggest lesson, one regret, one gratitude, one hypothesis for next week.', topicIdx: 3, type: 'idea', category: 'personal', priority: 'medium' },

  // Family (4)
  { title: 'Riley preschool registration — Sept', summary: 'Tour 3 options mid-May; confirm by June 30; remember sibling priority discount.', topicIdx: 4, type: 'task', category: 'personal', priority: 'high' },
  { title: 'Riley bedtime routine update', summary: 'Swap iPad story for board book by 7:30; lights off at 8.', topicIdx: 4, type: 'idea', category: 'personal', priority: 'medium' },
  { title: 'Share calendar with Sam', summary: 'Re-enable shared-calendar sync (broke after last OS update).', topicIdx: 4, type: 'task', category: 'personal', priority: 'low' },
  { title: 'Riley 5th birthday planning', summary: 'November 14. Theme: dinosaurs. Book golden-gate park spot early October.', topicIdx: 4, type: 'idea', category: 'personal', priority: 'low' },

  // Home (2)
  { title: 'Replace hallway fan', summary: 'Bearing is whining. Home Depot weekend task.', topicIdx: 5, type: 'task', category: 'personal', priority: 'low' },
  { title: 'Farmer market rotation', summary: 'Sundays Mission, Saturdays Ferry Plaza. Meera recommended the berry stand at FP.', topicIdx: 5, type: 'note', category: 'personal', priority: 'low' },

  // Travel (2)
  { title: 'Yosemite weekend with Aunt Lin', summary: 'June 14-16. Book Curry Village tent cabin. Half Dome trail reservations open 7 days out.', topicIdx: 6, type: 'idea', category: 'personal', priority: 'high' },
  { title: 'Bucket list: Japan with Riley in 2027', summary: 'Kyoto + Tokyo, 10 days. Start saving $300/mo dedicated line.', topicIdx: 6, type: 'idea', category: 'personal', priority: 'low' },

  // Team Ops (3)
  { title: 'Sprint ritual cleanup', summary: 'Kill Friday status. Merge monthly retro + quarterly planning.', topicIdx: 7, type: 'idea', category: 'business', priority: 'medium' },
  { title: 'Team OKRs Q2', summary: 'Three outcomes: analytics MVP, onboarding drop-off -20%, time-to-insight <10min.', topicIdx: 7, type: 'note', category: 'business', priority: 'high' },
  { title: 'Hiring loop revamp', summary: 'Add product-sense interview, drop outdated case study. Partner with Meera.', topicIdx: 7, type: 'idea', category: 'business', priority: 'medium' },

  // Product Strategy (2)
  { title: 'Competitor teardown — Mixpanel 2025 release', summary: 'Three features worth matching; two differentiators we should double down on.', topicIdx: 8, type: 'insight', category: 'business', priority: 'high' },
  { title: 'Customer interview quotes — April batch', summary: '12 interviews. Top pain: slow dashboards. Top delight: custom segments.', topicIdx: 8, type: 'note', category: 'business', priority: 'medium' },

  // Personal Health (2)
  { title: 'Sleep tracking — aim 7h30 median', summary: 'Oura data shows most nights 6h50. Try bed by 10:30pm for 2 weeks.', topicIdx: 9, type: 'task', category: 'personal', priority: 'medium' },
  { title: 'Stretching — 10 min post-run', summary: 'Hip flexors, hamstrings, calves. Add foam roll on Sundays.', topicIdx: 9, type: 'task', category: 'personal', priority: 'low' },
];

export const ALEX_IDEAS: AlexIdea[] = IDEA_SEEDS.map((s, i) => ({
  id: seededUuid('idea', i + 1),
  title: s.title,
  summary: s.summary,
  type: s.type,
  category: s.category,
  priority: s.priority,
  is_archived: false,
  context: ALEX_CONTEXT,
  user_id: ALEX_USER_ID,
  topic_id: ALEX_TOPICS[s.topicIdx].id,
}));

// ─── Learned Facts (150, generated) ───────────────────────────────────

export interface AlexLearnedFact {
  id: string;
  fact_type: 'biographical' | 'preference' | 'work' | 'health' | 'habit' | 'relationship';
  content: string;
  confidence: number;
  source: string;
  context: string;
  user_id: string;
}

const FACT_TEMPLATES: { type: AlexLearnedFact['fact_type']; content: string }[] = [
  // biographical
  { type: 'biographical', content: "User's name is Alex Chen." },
  { type: 'biographical', content: 'User is 32 years old.' },
  { type: 'biographical', content: 'User lives in the Mission district of San Francisco.' },
  { type: 'biographical', content: "User's pronouns are they/them." },
  { type: 'biographical', content: 'User was born in May.' },
  { type: 'biographical', content: 'User grew up in Vancouver.' },
  { type: 'biographical', content: 'User studied economics at UBC before moving into product management.' },
  { type: 'biographical', content: 'User has been in the US for seven years.' },
  { type: 'biographical', content: "User's parents live in Vancouver; visits twice a year." },
  { type: 'biographical', content: "User's aunt Lin lives in Taipei and visits annually in June." },
  // relationship
  { type: 'relationship', content: "User's partner is named Sam." },
  { type: 'relationship', content: 'Sam is a nurse and rotates night shifts.' },
  { type: 'relationship', content: "User and Sam have a 4-year-old child named Riley." },
  { type: 'relationship', content: "Riley's preschool starts September 2026." },
  { type: 'relationship', content: "Riley's 5th birthday is November 14." },
  { type: 'relationship', content: "Riley loves dinosaurs and the color teal." },
  { type: 'relationship', content: 'Priya is the engineering lead on the analytics project.' },
  { type: 'relationship', content: 'Diego is the design lead on the analytics project.' },
  { type: 'relationship', content: 'Meera leads customer success and recommended the Ferry Plaza farmer market berry stand.' },
  { type: 'relationship', content: 'Mika is one of two junior PMs Alex is mentoring.' },
  { type: 'relationship', content: 'Jordan is the second junior PM Alex is mentoring.' },
  { type: 'relationship', content: "Alex's best friend is Camille; they met at UBC." },
  // work
  { type: 'work', content: 'User is a product manager at a mid-size SaaS company.' },
  { type: 'work', content: 'Current work focus is the v2 analytics platform rebuild.' },
  { type: 'work', content: 'Q3 2026 is the analytics rebuild target delivery date.' },
  { type: 'work', content: 'The team is evaluating DuckDB and ClickHouse for event storage.' },
  { type: 'work', content: 'Users who hit the dashboard in their first week retain 3x longer than those who do not.' },
  { type: 'work', content: 'Event schema v2 requires renaming 42 legacy event names.' },
  { type: 'work', content: 'The team uses Linear for tracking work.' },
  { type: 'work', content: 'User lives in Figma throughout most design reviews.' },
  { type: 'work', content: 'User disliked the last vendor demo because it glossed over pricing.' },
  { type: 'work', content: 'User wants to kill the Friday status meeting.' },
  { type: 'work', content: 'Hiring loop should add a product-sense interview.' },
  { type: 'work', content: 'Mixpanel recently shipped three noteworthy features Alex is watching.' },
  { type: 'work', content: 'Customer interviews in April flagged slow dashboards as the top pain point.' },
  { type: 'work', content: 'Custom segments are the top delight from April customer interviews.' },
  { type: 'work', content: 'Team OKRs for Q2 are: analytics MVP, onboarding drop-off -20%, time-to-insight <10min.' },
  { type: 'work', content: 'Alex is writing a junior PM playbook by end of May.' },
  // preference
  { type: 'preference', content: 'User prefers concise, bullet-heavy communication.' },
  { type: 'preference', content: 'User dislikes unnecessary jargon.' },
  { type: 'preference', content: 'User prefers async work over sync meetings when possible.' },
  { type: 'preference', content: 'User is vegetarian since 2019.' },
  { type: 'preference', content: "User's favorite cuisine is Taiwanese and Japanese." },
  { type: 'preference', content: 'User drinks pour-over coffee in the morning; no coffee after 2pm.' },
  { type: 'preference', content: 'User prefers board books over screens for Riley at bedtime.' },
  { type: 'preference', content: 'User prefers reading physical books over e-readers.' },
  { type: 'preference', content: "User's favorite writing environment is cafes with ambient noise." },
  { type: 'preference', content: "User's preferred workout app is Strava." },
  { type: 'preference', content: 'User prefers Notion for personal notes and Linear for work tasks.' },
  { type: 'preference', content: 'User enjoys science fiction and non-fiction, especially behavioral economics.' },
  { type: 'preference', content: "User's favorite running route is through Golden Gate Park out to the ocean." },
  { type: 'preference', content: "User's preferred meeting length is 25 or 50 minutes, never 30 or 60." },
  { type: 'preference', content: "User dislikes 'circle back' and similar corporate phrasing." },
  // health
  { type: 'health', content: 'User runs three times a week: Tuesday, Thursday, Saturday.' },
  { type: 'health', content: 'User is training for a marathon in October.' },
  { type: 'health', content: 'User follows the Pfitzinger 18/55 plan starting June 1.' },
  { type: 'health', content: 'User rotates Mizuno Wave Sky (long runs) and Saucony Endorphin (speed days).' },
  { type: 'health', content: 'User aims for 7h30 median sleep per night.' },
  { type: 'health', content: "User's Oura data shows most nights are around 6h50." },
  { type: 'health', content: 'User recovers with protein + tart cherry juice within 30 min post-run.' },
  { type: 'health', content: 'User foam rolls glutes on Mondays and Wednesdays.' },
  { type: 'health', content: 'User stretches hip flexors, hamstrings, and calves for 10 min post-run.' },
  { type: 'health', content: 'User had a minor IT band issue in 2024 and watches for left-knee soreness.' },
  { type: 'health', content: 'User takes vitamin B12 daily (vegetarian diet).' },
  // habit
  { type: 'habit', content: 'User is a morning person and schedules deep work before 11am.' },
  { type: 'habit', content: 'User journals every Sunday at 7am.' },
  { type: 'habit', content: 'User runs farmer-market rotation: Sundays Mission, Saturdays Ferry Plaza.' },
  { type: 'habit', content: "User's evening wind-down starts at 9:45pm." },
  { type: 'habit', content: 'User avoids checking email before 8am.' },
  { type: 'habit', content: "User's weekly 1:1s with Sam happen Saturday morning over coffee." },
  { type: 'habit', content: 'User reviews the week every Friday at 4pm for 20 minutes.' },
  { type: 'habit', content: 'User sends a weekly note to the team every Friday afternoon.' },
  { type: 'habit', content: "User's morning walk with Riley to preschool starts at 8:15am." },
];

function generateFacts(seed: number, count: number): AlexLearnedFact[] {
  const rng = alexRng(seed);
  const result: AlexLearnedFact[] = [];
  // First: unique templates (up to count)
  const templates = [...FACT_TEMPLATES];
  const max = Math.min(count, templates.length);
  for (let i = 0; i < max; i++) {
    result.push({
      id: seededUuid('fact', i + 1),
      fact_type: templates[i].type,
      content: templates[i].content,
      confidence: 0.75 + rng() * 0.25,
      source: 'demo-seed',
      context: ALEX_CONTEXT,
      user_id: ALEX_USER_ID,
    });
  }
  // If more needed, fill with lightly varied duplicates keyed on index so they stay unique
  // (e.g., journal rotations, 1:1 notes that would exist in a real mature history)
  const EXTRAS: { type: AlexLearnedFact['fact_type']; content: (week: number) => string }[] = [
    { type: 'habit', content: (w) => `On week ${w} of the year, Alex logged a Sunday journal entry.` },
    { type: 'work', content: (w) => `Week ${w}: team sprint ${w} included analytics rebuild progress notes.` },
    { type: 'health', content: (w) => `Week ${w}: Alex completed ${18 + (w % 10)}km of running volume.` },
    { type: 'relationship', content: (w) => `Week ${w}: 1:1 with Mika covered topics on product discovery depth.` },
    { type: 'preference', content: (w) => `Week ${w}: preferred focus block was 9–11am.` },
  ];
  let extraIdx = 0;
  let week = 10;
  while (result.length < count) {
    const tpl = EXTRAS[extraIdx % EXTRAS.length];
    result.push({
      id: seededUuid('fact', result.length + 1),
      fact_type: tpl.type,
      content: tpl.content(week),
      confidence: 0.5 + rng() * 0.4,
      source: 'demo-seed',
      context: ALEX_CONTEXT,
      user_id: ALEX_USER_ID,
    });
    extraIdx++;
    if (extraIdx % EXTRAS.length === 0) week++;
  }
  return result;
}

export const ALEX_LEARNED_FACTS: AlexLearnedFact[] = generateFacts(1337, 150);

// ─── Episodic Memories (200, light-weight, no embeddings) ─────────────

export interface AlexEpisode {
  id: string;
  session_id: string;
  trigger: string;
  response: string;
  emotional_valence: number; // [-1, +1]
  emotional_arousal: number; // [0, 1]
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night';
  day_of_week: number; // 0-6
  is_weekend: boolean;
  context: string;
  user_id: string;
}

const TRIGGER_TEMPLATES: { trigger: string; response: string; valence: number; arousal: number }[] = [
  { trigger: 'How did the sprint review go?', response: 'The team shipped three of four planned items; Priya flagged a latency regression to investigate.', valence: 0.2, arousal: 0.4 },
  { trigger: "What's on my plate for tomorrow?", response: "Two 1:1s, a design review with Diego, and a push on the v2 spec draft.", valence: 0.1, arousal: 0.3 },
  { trigger: 'Remind me what Riley ate for lunch yesterday.', response: "Edamame pasta with cherry tomatoes — Riley asked for seconds.", valence: 0.6, arousal: 0.3 },
  { trigger: 'Did I run this morning?', response: 'Yes, 6.2 km easy effort along Panhandle. HR avg 142.', valence: 0.5, arousal: 0.5 },
  { trigger: 'Any new customer insights from today?', response: 'Two interviews; both flagged dashboard latency as the #1 pain point.', valence: 0.0, arousal: 0.5 },
  { trigger: 'What did I promise Mika at our last 1:1?', response: 'To share the Pichai memo and review her discovery doc by Friday.', valence: 0.2, arousal: 0.3 },
  { trigger: "What's the plan for the Yosemite trip?", response: 'Curry Village tent cabin June 14-16, Half Dome reservation request at 07:00 on June 7.', valence: 0.7, arousal: 0.6 },
  { trigger: 'Preschool tour notes?', response: 'Visited 3 options; Riley liked the one near Dolores Park; confirm by June 30.', valence: 0.4, arousal: 0.5 },
  { trigger: 'How was my week?', response: 'Strong: shipped funnel widget, 3 quality runs, journaled Sunday. Weak: sleep averaged 6h40.', valence: 0.3, arousal: 0.4 },
  { trigger: 'What should I read next?', response: 'Per your queue: finish re-read of TF&S chapters 11-13, then Range by David Epstein.', valence: 0.5, arousal: 0.2 },
];

function generateEpisodes(seed: number, count: number): AlexEpisode[] {
  const rng = alexRng(seed);
  const episodes: AlexEpisode[] = [];
  const TIMES = ['morning', 'afternoon', 'evening', 'night'] as const;
  for (let i = 0; i < count; i++) {
    const base = pick(rng, TRIGGER_TEMPLATES);
    const dow = Math.floor(rng() * 7);
    episodes.push({
      id: seededUuid('epis', i + 1),
      session_id: `demo-session-${Math.floor(i / 4) + 1}`, // ~4 episodes/session
      trigger: base.trigger,
      response: base.response,
      emotional_valence: base.valence + (rng() - 0.5) * 0.2,
      emotional_arousal: Math.max(0, Math.min(1, base.arousal + (rng() - 0.5) * 0.2)),
      time_of_day: TIMES[Math.floor(rng() * TIMES.length)],
      day_of_week: dow,
      is_weekend: dow === 0 || dow === 6,
      context: ALEX_CONTEXT,
      user_id: ALEX_USER_ID,
    });
  }
  return episodes;
}

export const ALEX_EPISODES: AlexEpisode[] = generateEpisodes(7919, 200);

// ─── Knowledge-Graph edges (topic <-> fact cross-links) ───────────────

export interface AlexKGEdge {
  id: string;
  source_type: 'idea' | 'fact' | 'topic';
  source_id: string;
  target_type: 'idea' | 'fact' | 'topic';
  target_id: string;
  relation: string;
  weight: number;
  context: string;
  user_id: string;
}

/** Generates a reasonable set of KG edges tying ideas to topics and facts together. */
export function buildAlexKG(): AlexKGEdge[] {
  const edges: AlexKGEdge[] = [];
  let idx = 0;

  // Every idea belongs to its topic
  for (const idea of ALEX_IDEAS) {
    edges.push({
      id: seededUuid('edge', ++idx),
      source_type: 'idea',
      source_id: idea.id,
      target_type: 'topic',
      target_id: idea.topic_id,
      relation: 'belongs_to',
      weight: 1.0,
      context: ALEX_CONTEXT,
      user_id: ALEX_USER_ID,
    });
  }

  // Connect health + habit facts to Personal Health topic (topic idx 9)
  const healthTopic = ALEX_TOPICS[9];
  for (const fact of ALEX_LEARNED_FACTS.filter((f) => f.fact_type === 'health' || f.fact_type === 'habit').slice(0, 20)) {
    edges.push({
      id: seededUuid('edge', ++idx),
      source_type: 'fact',
      source_id: fact.id,
      target_type: 'topic',
      target_id: healthTopic.id,
      relation: 'supports',
      weight: 0.8,
      context: ALEX_CONTEXT,
      user_id: ALEX_USER_ID,
    });
  }

  // Connect work facts to Analytics Rebuild (topic idx 0)
  const analyticsTopic = ALEX_TOPICS[0];
  for (const fact of ALEX_LEARNED_FACTS.filter((f) => f.fact_type === 'work').slice(0, 15)) {
    edges.push({
      id: seededUuid('edge', ++idx),
      source_type: 'fact',
      source_id: fact.id,
      target_type: 'topic',
      target_id: analyticsTopic.id,
      relation: 'supports',
      weight: 0.75,
      context: ALEX_CONTEXT,
      user_id: ALEX_USER_ID,
    });
  }

  // Relationship facts → Family topic
  const familyTopic = ALEX_TOPICS[4];
  for (const fact of ALEX_LEARNED_FACTS.filter((f) => f.fact_type === 'relationship').slice(0, 10)) {
    edges.push({
      id: seededUuid('edge', ++idx),
      source_type: 'fact',
      source_id: fact.id,
      target_type: 'topic',
      target_id: familyTopic.id,
      relation: 'supports',
      weight: 0.7,
      context: ALEX_CONTEXT,
      user_id: ALEX_USER_ID,
    });
  }

  return edges;
}

export const ALEX_KG_EDGES: AlexKGEdge[] = buildAlexKG();

// ─── Summary for /api/demo/status ─────────────────────────────────────

export interface AlexDemoSummary {
  persona: 'alex-chen';
  userId: string;
  coreBlocks: number;
  topics: number;
  ideas: number;
  facts: number;
  episodes: number;
  kgEdges: number;
}

export const ALEX_DEMO_SUMMARY: AlexDemoSummary = {
  persona: 'alex-chen',
  userId: ALEX_USER_ID,
  coreBlocks: ALEX_CORE_BLOCKS.length,
  topics: ALEX_TOPICS.length,
  ideas: ALEX_IDEAS.length,
  facts: ALEX_LEARNED_FACTS.length,
  episodes: ALEX_EPISODES.length,
  kgEdges: ALEX_KG_EDGES.length,
};
