/**
 * Auto Session Title Generator
 *
 * Generates concise session titles (3-6 words) based on the first
 * user message and assistant response in a session.
 *
 * Uses a heuristic approach (no API call) for fast, reliable titles.
 * Optionally fires a background Claude Haiku call for higher quality.
 *
 * @module services/general-chat/auto-title
 */

import { query } from '../../utils/database';
import { logger } from '../../utils/logger';

/**
 * Generate a heuristic title from user message.
 * Extracts key words, removes filler, creates a readable 3-6 word title.
 */
function heuristicTitle(userMessage: string): string {
  // Common German/English filler words to remove
  const fillerWords = new Set([
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'mir', 'mich', 'dir', 'dich',
    'ein', 'eine', 'einen', 'einem', 'einer', 'der', 'die', 'das', 'den', 'dem', 'des',
    'und', 'oder', 'aber', 'denn', 'weil', 'dass', 'wenn', 'als', 'ob', 'wie',
    'in', 'an', 'auf', 'aus', 'bei', 'mit', 'nach', 'seit', 'von', 'zu', 'um', 'fuer',
    'ist', 'sind', 'bin', 'war', 'hat', 'haben', 'wird', 'werden', 'kann', 'koennen',
    'muss', 'soll', 'will', 'darf', 'mag', 'moechte', 'bitte', 'mal',
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'shall', 'can', 'need', 'dare', 'ought', 'used',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'ours', 'theirs',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'whose',
    'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from', 'by', 'about', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither',
    'please', 'help', 'hilf', 'erklaere', 'erklaer', 'zeig', 'zeige', 'sag',
  ]);

  // Clean and tokenize
  const cleaned = userMessage
    .replace(/[?!.,;:()[\]{}"'`~@#$%^&*+=<>|\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned.split(' ').filter(w => {
    const lower = w.toLowerCase();
    return lower.length > 1 && !fillerWords.has(lower);
  });

  // Take first 6 meaningful words
  const titleWords = words.slice(0, 6);

  if (titleWords.length === 0) {
    // Fallback: just use first few words of the original message
    return Array.from(userMessage.trim()).slice(0, 40).join('');
  }

  // Capitalize first word
  titleWords[0] = titleWords[0].charAt(0).toUpperCase() + titleWords[0].slice(1);

  let title = titleWords.join(' ');

  // Ensure max 60 chars
  if (title.length > 60) {
    title = title.slice(0, 57) + '...';
  }

  return title;
}

/**
 * Generate and set a session title based on the first conversation exchange.
 *
 * This function is designed to be called fire-and-forget (do NOT await in
 * the streaming hot path). It will:
 * 1. Check if the session already has a title
 * 2. If not, generate a heuristic title from the user message
 * 3. Update the session with the generated title
 *
 * Errors are caught and logged — never thrown.
 */
export async function generateSessionTitle(
  sessionId: string,
  userMessage: string,
  _assistantResponse: string
): Promise<void> {
  try {
    // Check if session already has a title
    const sessionResult = await query(
      `SELECT title FROM general_chat_sessions WHERE id = $1 LIMIT 1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      logger.debug('Session not found for auto-title', { sessionId });
      return;
    }

    const existingTitle = sessionResult.rows[0].title;
    if (existingTitle && existingTitle.trim().length > 0) {
      return; // Already has a title
    }

    // Generate title heuristically
    const title = heuristicTitle(userMessage);

    // Update session
    await query(
      `UPDATE general_chat_sessions SET title = $2, updated_at = NOW() WHERE id = $1`,
      [sessionId, title]
    );

    logger.debug('Auto-generated session title', { sessionId, title });
  } catch (error) {
    // Fire-and-forget: never let title generation break the chat flow
    logger.warn('Auto-title generation failed', {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
