/**
 * SQL utility helpers for safe query construction.
 */

/**
 * Escape special LIKE/ILIKE metacharacters in user input.
 * Prevents users from injecting `%` or `_` wildcards into search patterns.
 *
 * @example
 *   const safe = escapeLike(userInput);
 *   queryContext(ctx, `SELECT ... WHERE title ILIKE $1`, [`%${safe}%`]);
 */
export function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, '\\$&');
}
