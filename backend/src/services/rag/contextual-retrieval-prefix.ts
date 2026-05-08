/**
 * Contextual Retrieval Prefix — Anthropic-style chunk-prefix builder.
 *
 * Phase H sprint reference: spec § H3 task 2.
 *
 * Why prefix chunks
 * -----------------
 * Anthropic's "Contextual Retrieval" blog post (2024) reports a +49 %
 * retrieval-failure reduction by prepending each chunk with a short
 * sentence that situates it inside its surrounding document. For
 * conversational corpora like LoCoMo this becomes:
 *
 *   "From session 4 on 2023-05-08, Caroline said: <chunk text>"
 *
 * The boost comes from two effects:
 *
 *   1. **Embedding match** — questions like "what did Caroline say in
 *      May" share lexical overlap with the prefix tokens (`Caroline`,
 *      `May`), even when the chunk text doesn't.
 *   2. **BM25 match** — the same prefix tokens carry through to sparse
 *      retrieval and bridge the otherwise vocabulary-sparse chunk.
 *
 * Implementation
 * --------------
 * Pure function `buildContextualPrefix({ session, isoDate, speaker })`
 * → prefix string. Composable into any chunk-write path. Deliberately
 * stateless and zero-dependency so it can run during ingest without
 * touching DB / LLM / logger.
 *
 * The prefix wording is exported as a top-level constant
 * (`CONTEXTUAL_PREFIX_TEMPLATE`) so the eval harness can compare
 * variants byte-for-byte (matching the H0 verbatim-prompt convention).
 *
 * @module services/rag/contextual-retrieval-prefix
 */

// ===========================================================================
// Types
// ===========================================================================

/** Provenance information for a chunk. All fields optional — the
 *  builder produces a sensible prefix from whatever is provided. */
export interface ChunkContext {
  /** Numeric session index (e.g. session_4 → 4). */
  session?: number;
  /** ISO-8601 date string for the session (e.g. "2023-05-08").
   *  Use `services/memory/temporal-normalizer` to derive this from
   *  free-form date strings. */
  isoDate?: string;
  /** Speaker / actor / source identifier ("Caroline", "agent:researcher"). */
  speaker?: string;
  /** Optional turn index within the session. */
  turnIndex?: number;
  /** Optional document title for non-conversation chunks. */
  documentTitle?: string;
}

export interface PrefixOptions {
  /** Separator between the prefix and the chunk body. Default `" — "`
   *  (em-dash with surrounding spaces — distinct from any natural
   *  punctuation that might appear in the chunk). */
  separator?: string;
  /** Cap on the prefix length. Truncates with `…` if exceeded.
   *  Default 200 chars — short enough not to dominate the chunk
   *  embedding, long enough for full attribution. */
  maxPrefixLength?: number;
}

// ===========================================================================
// Templates (top-level for byte-equal comparison)
// ===========================================================================

/** The verbatim conversational-corpus template. Variables (substituted
 *  via String.replace, not format) — `{{session}}`, `{{isoDate}}`,
 *  `{{speaker}}`. Trailing colon belongs to the prefix; the caller
 *  appends the chunk after the separator. */
export const CONTEXTUAL_PREFIX_TEMPLATE_CONVERSATION =
  'From session {{session}} on {{isoDate}}, {{speaker}} said:';

/** Document-style fallback when no conversation metadata is available
 *  but a document title is. */
export const CONTEXTUAL_PREFIX_TEMPLATE_DOCUMENT =
  'From "{{documentTitle}}":';

/** Date-only fallback when neither speaker nor document is available. */
export const CONTEXTUAL_PREFIX_TEMPLATE_DATE_ONLY =
  'From {{isoDate}}:';

// ===========================================================================
// Builder
// ===========================================================================

/**
 * Build a contextual prefix from the supplied chunk context. Returns
 * the empty string when no useful context fields are present (caller
 * can `prefixChunk(...)` without checking).
 */
export function buildContextualPrefix(
  context: ChunkContext,
  options: PrefixOptions = {},
): string {
  const max = options.maxPrefixLength ?? 200;
  let prefix: string;

  // Pick the most-specific template the context fields support.
  if (context.session !== undefined && context.isoDate && context.speaker) {
    prefix = CONTEXTUAL_PREFIX_TEMPLATE_CONVERSATION
      .replace('{{session}}', String(context.session))
      .replace('{{isoDate}}', context.isoDate)
      .replace('{{speaker}}', context.speaker);
  } else if (context.isoDate && context.speaker) {
    // No session known — drop that fragment.
    prefix = `On ${context.isoDate}, ${context.speaker} said:`;
  } else if (context.documentTitle) {
    prefix = CONTEXTUAL_PREFIX_TEMPLATE_DOCUMENT
      .replace('{{documentTitle}}', context.documentTitle);
  } else if (context.isoDate) {
    prefix = CONTEXTUAL_PREFIX_TEMPLATE_DATE_ONLY
      .replace('{{isoDate}}', context.isoDate);
  } else if (context.speaker) {
    prefix = `${context.speaker} said:`;
  } else {
    return '';
  }

  // Truncate to max length with `…` trailer if needed.
  if (prefix.length > max) {
    prefix = `${prefix.slice(0, max - 1).trimEnd()}…`;
  }

  return prefix;
}

/**
 * Prepend the chunk with the contextual prefix. When no prefix can be
 * built (empty context), returns the chunk verbatim — caller can pipe
 * any chunk through this without conditional logic.
 */
export function prefixChunk(
  chunk: string,
  context: ChunkContext,
  options: PrefixOptions = {},
): string {
  const sep = options.separator ?? ' — ';
  const prefix = buildContextualPrefix(context, options);
  if (!prefix) return String(chunk ?? '');
  const body = String(chunk ?? '').trim();
  if (!body) return prefix;
  return `${prefix}${sep}${body}`;
}

// ===========================================================================
// Inverse (for display)
// ===========================================================================

/** Crude prefix detection: any of the known templates that begins the
 *  chunk. Used by display surfaces that want to render the chunk
 *  WITHOUT the prefix (e.g. when the UI already shows session +
 *  speaker out-of-band). */
export function stripContextualPrefix(prefixed: string, separator = ' — '): {
  body: string;
  prefix: string | null;
} {
  const text = String(prefixed ?? '');
  if (!text) return { body: '', prefix: null };
  // Anchored prefix patterns mirror the templates above. Keep these
  // loose — over-stripping is worse than missing one variant.
  const patterns: RegExp[] = [
    /^From session \d+ on \d{4}(?:-\d{2}(?:-\d{2})?)?, [^:]+ said:/,
    /^On \d{4}(?:-\d{2}(?:-\d{2})?)?, [^:]+ said:/,
    /^From "[^"]+":/,
    /^From \d{4}(?:-\d{2}(?:-\d{2})?)?:/,
    /^[^:\n]{1,80} said:/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (!m) continue;
    const prefixEnd = m[0].length;
    const sepIdx = text.indexOf(separator, prefixEnd);
    const bodyStart = sepIdx === prefixEnd ? sepIdx + separator.length : prefixEnd;
    return {
      body: text.slice(bodyStart).trimStart(),
      prefix: text.slice(0, prefixEnd),
    };
  }
  return { body: text, prefix: null };
}
