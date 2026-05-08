/**
 * Persona-Aware Retrieval — Letta-pattern persona block assembly.
 *
 * Phase H sprint reference: spec § H3 task 6.
 *
 * Why Persona-Aware Retrieval lifts Cat 4
 * ---------------------------------------
 * Letta's published trick on multi-speaker corpora: cluster facts by
 * speaker, render each speaker's clustered facts as a compact
 * "Persona block", and ALWAYS prepend the relevant persona block
 * alongside the retrieved evidence. The result is the answerer
 * sees `{persona-of-the-speaker-the-question-is-about} + {evidence}`
 * not just `{evidence}`. Two effects:
 *
 *   1. **Anchoring** — when the question is "what does Caroline do?"
 *      and one of the retrieved evidence chunks is "she works at
 *      Stanford", without a persona block "she" has no antecedent
 *      from the model's POV. The persona block disambiguates.
 *   2. **Background grounding** — long-running facts about a person
 *      (occupation, location, relationships) get included even when
 *      they don't match the query lexically. The model can then use
 *      them to validate or contextualise the evidence.
 *
 * What this module does
 * ---------------------
 * Three pure functions:
 *   - `clusterFactsBySpeaker(facts)` — group an `AtomicFact[]` into
 *     `SpeakerCluster[]`, one per distinct speaker.
 *   - `renderPersonaBlock(cluster, options)` — serialise a single
 *     cluster into a compact text block ("About Caroline: ..."),
 *     suitable for prompt injection alongside evidence.
 *   - `assemblePersonaAwareContext({ personaBlocks, evidence })` —
 *     format combined context with persona blocks first, evidence
 *     after, separated cleanly so the answerer can distinguish.
 *
 * No DB, no LLM, no I/O. The caller owns retrieval; this module
 * shapes what the caller already has into the Letta-pattern surface.
 *
 * @module services/memory/persona-block-builder
 */

import { factToSentence, type AtomicFact } from './atomic-fact-extractor';

// ===========================================================================
// Types
// ===========================================================================

/** A group of facts that share a speaker. */
export interface SpeakerCluster {
  /** Speaker identifier ("Caroline", "agent:researcher", etc.). */
  speaker: string;
  /** Facts in input order, deduped by (subject, verb, object). */
  facts: AtomicFact[];
}

export interface PersonaBlockOptions {
  /** Maximum facts per persona block. Default 8 — enough to cover the
   *  common case (location + occupation + relationships + 2-3
   *  preferences) without dominating the answerer's context budget.
   *  Excess facts are dropped from the right (caller should pre-sort
   *  by importance / recency). */
  maxFacts?: number;
  /** Persona-block header. Default `"About {{speaker}}:"`. The
   *  variable is substituted via String.replace. Top-level constant
   *  exported for byte-equal eval-harness comparison. */
  header?: string;
  /** Per-fact bullet character. Default `"- "` (dash + space). */
  bullet?: string;
}

export interface AssemblyOptions {
  /** Section title for the persona blocks. Default `"PERSONA CONTEXT"`. */
  personaSectionTitle?: string;
  /** Section title for the evidence chunks. Default `"EVIDENCE"`. */
  evidenceSectionTitle?: string;
  /** Separator between sections. Default a blank line. */
  sectionSeparator?: string;
}

// ===========================================================================
// Constants
// ===========================================================================

/** Verbatim persona-block header template. Variable substituted via
 *  String.replace (parity with H0 verbatim convention). */
export const PERSONA_BLOCK_HEADER_TEMPLATE = 'About {{speaker}}:';

const DEFAULT_MAX_FACTS_PER_BLOCK = 8;
const DEFAULT_BULLET = '- ';
const DEFAULT_PERSONA_SECTION_TITLE = 'PERSONA CONTEXT';
const DEFAULT_EVIDENCE_SECTION_TITLE = 'EVIDENCE';

// ===========================================================================
// Clustering
// ===========================================================================

/**
 * Group facts by speaker. Facts with no speaker (`undefined` /
 * empty string) are bucketed under the empty-string key — caller
 * decides whether to include or skip that cluster.
 *
 * Order:
 *   - Cluster order is FIRST-APPEARANCE order in the input. This
 *     keeps deterministic output without needing an explicit sort.
 *   - Fact order WITHIN a cluster is also input order.
 *
 * Dedup: facts with identical (subject, verb, object) lowercased
 * are deduped within a cluster. First occurrence wins.
 */
export function clusterFactsBySpeaker(
  facts: ReadonlyArray<AtomicFact>,
): SpeakerCluster[] {
  const order: string[] = [];
  const groups = new Map<string, { facts: AtomicFact[]; seen: Set<string> }>();

  for (const f of facts) {
    if (!f) continue;
    const speaker = (f.speaker ?? '').trim();
    if (!groups.has(speaker)) {
      order.push(speaker);
      groups.set(speaker, { facts: [], seen: new Set() });
    }
    const g = groups.get(speaker)!;
    const key = `${f.subject.toLowerCase()}|${f.verb.toLowerCase()}|${f.object.toLowerCase()}`;
    if (g.seen.has(key)) continue;
    g.seen.add(key);
    g.facts.push(f);
  }

  return order.map((speaker) => ({
    speaker,
    facts: groups.get(speaker)!.facts,
  }));
}

// ===========================================================================
// Rendering
// ===========================================================================

/**
 * Render a single cluster as a persona block. Returns the empty string
 * when the cluster has no speaker AND no facts (caller can pipe through
 * any cluster without conditional logic).
 */
export function renderPersonaBlock(
  cluster: SpeakerCluster,
  options: PersonaBlockOptions = {},
): string {
  const speaker = (cluster.speaker ?? '').trim();
  const facts = cluster.facts ?? [];
  if (!speaker && facts.length === 0) return '';

  const max = options.maxFacts ?? DEFAULT_MAX_FACTS_PER_BLOCK;
  const headerTpl = options.header ?? PERSONA_BLOCK_HEADER_TEMPLATE;
  const bullet = options.bullet ?? DEFAULT_BULLET;

  const header = headerTpl.replace('{{speaker}}', speaker || '(unknown speaker)');
  const slice = facts.slice(0, max);
  if (slice.length === 0) {
    return header;
  }
  const lines = [header, ...slice.map((f) => `${bullet}${factToSentence(f)}`)];
  return lines.join('\n');
}

/**
 * Render multiple clusters as a single persona-context section.
 * Empty clusters and the empty-speaker bucket are skipped.
 */
export function renderAllPersonaBlocks(
  clusters: ReadonlyArray<SpeakerCluster>,
  options: PersonaBlockOptions = {},
): string {
  const blocks: string[] = [];
  for (const c of clusters) {
    if (!c.speaker?.trim()) continue;
    if (!c.facts || c.facts.length === 0) continue;
    blocks.push(renderPersonaBlock(c, options));
  }
  return blocks.join('\n\n');
}

// ===========================================================================
// Assembly
// ===========================================================================

/**
 * Compose persona blocks + evidence into the Letta-pattern context
 * surface. Sections are titled and separated so the answerer can
 * distinguish background-grounding from query-relevant evidence.
 *
 * Returns the empty string when both lists are empty. When only one
 * list has content, the section title is omitted (no point in a
 * "PERSONA CONTEXT" header followed by nothing).
 */
export function assemblePersonaAwareContext(
  input: {
    personaBlocks: ReadonlyArray<string>;
    evidence: ReadonlyArray<string>;
  },
  options: AssemblyOptions = {},
): string {
  const personaTitle = options.personaSectionTitle ?? DEFAULT_PERSONA_SECTION_TITLE;
  const evidenceTitle = options.evidenceSectionTitle ?? DEFAULT_EVIDENCE_SECTION_TITLE;
  const sep = options.sectionSeparator ?? '\n\n';

  const personaText = (input.personaBlocks ?? []).filter((b) => b && b.trim()).join('\n\n');
  const evidenceText = (input.evidence ?? []).filter((e) => e && e.trim()).join('\n\n');

  if (!personaText && !evidenceText) return '';
  if (!personaText) return `${evidenceTitle}\n${evidenceText}`;
  if (!evidenceText) return `${personaTitle}\n${personaText}`;

  return `${personaTitle}\n${personaText}${sep}${evidenceTitle}\n${evidenceText}`;
}

// ===========================================================================
// Convenience: end-to-end one-shot
// ===========================================================================

/**
 * One-shot pipeline: cluster facts → render persona blocks → assemble
 * with evidence. The most common caller-shape — feed the speaker-
 * relevant facts and the retrieved evidence chunks, get back a
 * formatted context block ready for prompt injection.
 */
export function buildPersonaAwareContext(
  input: {
    facts: ReadonlyArray<AtomicFact>;
    evidence: ReadonlyArray<string>;
    /** Optional speaker filter — when supplied, only facts about this
     *  speaker (and the empty-speaker bucket) are clustered. Useful
     *  when the caller knows the question's subject. */
    focusSpeaker?: string;
  },
  options: PersonaBlockOptions & AssemblyOptions = {},
): string {
  const focus = input.focusSpeaker?.trim().toLowerCase();
  const filtered = focus
    ? input.facts.filter((f) => (f.speaker ?? '').trim().toLowerCase() === focus)
    : input.facts;
  const clusters = clusterFactsBySpeaker(filtered);
  const blocks: string[] = [];
  for (const c of clusters) {
    if (!c.speaker?.trim()) continue; // skip empty-speaker bucket
    blocks.push(renderPersonaBlock(c, options));
  }
  return assemblePersonaAwareContext(
    { personaBlocks: blocks, evidence: input.evidence },
    options,
  );
}
