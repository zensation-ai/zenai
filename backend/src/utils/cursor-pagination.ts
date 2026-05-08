/**
 * Cursor pagination utility.
 *
 * Encodes/decodes opaque Base64url cursors that carry a timestamp + id pair,
 * and provides helpers to translate a cursor into a SQL WHERE clause and to
 * build the standard `{ data, nextCursor, hasMore }` response shape.
 */

export interface DecodedCursor {
  /** ISO timestamp of the last seen row */
  t: string;
  /** Unique id of the last seen row */
  i: string;
}

// ---------------------------------------------------------------------------
// Encode / Decode
// ---------------------------------------------------------------------------

/**
 * Encode a (timestamp, id) pair into an opaque Base64url cursor string.
 */
export function encodeCursor(timestamp: string, id: string): string {
  const payload = JSON.stringify({ t: timestamp, i: id });
  return Buffer.from(payload).toString('base64url');
}

/**
 * Decode a cursor string.
 * Returns `null` if the input is empty, malformed, or missing required fields.
 */
export function decodeCursor(cursor: string | null | undefined): DecodedCursor | null {
  if (!cursor) return null;

  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.t === 'string' &&
      typeof parsed.i === 'string'
    ) {
      return { t: parsed.t, i: parsed.i };
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

export interface CursorWhereResult {
  /** SQL fragment to append after existing WHERE conditions (empty string = no filter) */
  where: string;
  /** Bind parameters matching the placeholders in `where` */
  params: string[];
}

/**
 * Build a keyset-pagination WHERE clause from a cursor.
 *
 * The generated clause uses the standard "tie-breaking" pattern:
 *   (timestampCol < $N  OR  (timestampCol = $N AND idCol < $M))
 *
 * This assumes descending-timestamp ordering with id as tie-breaker.
 * Adjust the comparison operators if your sort order differs.
 *
 * @param cursor          - Encoded cursor string (or null/undefined for first page)
 * @param timestampCol    - Quoted or unquoted column name for the timestamp
 * @param idCol           - Quoted or unquoted column name for the unique id
 * @param startParamIndex - The $N index for the first bind parameter (default: 1)
 */
export function buildCursorWhere(
  cursor: string | null | undefined,
  timestampCol: string,
  idCol: string,
  startParamIndex: number = 1,
): CursorWhereResult {
  const decoded = decodeCursor(cursor);
  if (!decoded) {
    return { where: '', params: [] };
  }

  const p1 = `$${startParamIndex}`;
  const p2 = `$${startParamIndex + 1}`;

  const where =
    `(${timestampCol} < ${p1} OR (${timestampCol} = ${p1} AND ${idCol} < ${p2}))`;

  return { where, params: [decoded.t, decoded.i] };
}

// ---------------------------------------------------------------------------
// Response builder
// ---------------------------------------------------------------------------

export interface CursorPageResponse<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Build the standard cursor-pagination response.
 *
 * Pass `rows` fetched with `LIMIT limit + 1`.  If more than `limit` rows are
 * returned the extra row is dropped and `hasMore` is set to `true`.
 *
 * @param rows         - Raw rows from the database (may be limit+1 long)
 * @param limit        - The page size requested by the caller
 * @param timestampCol - Name of the timestamp property on each row object
 * @param idCol        - Name of the id property on each row object
 */
export function buildCursorResponse<T extends Record<string, unknown>>(
  rows: T[],
  limit: number,
  timestampCol: string,
  idCol: string,
): CursorPageResponse<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;

  if (!hasMore || data.length === 0) {
    return { data, nextCursor: null, hasMore: false };
  }

  const lastRow = data[data.length - 1];
  const timestamp = String(lastRow[timestampCol] ?? '');
  const id = String(lastRow[idCol] ?? '');
  const nextCursor = encodeCursor(timestamp, id);

  return { data, nextCursor, hasMore: true };
}
