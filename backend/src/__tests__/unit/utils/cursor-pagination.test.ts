import {
  encodeCursor,
  decodeCursor,
  buildCursorWhere,
  buildCursorResponse,
} from '../../../utils/cursor-pagination';

describe('cursor-pagination', () => {
  describe('encodeCursor / decodeCursor round-trip', () => {
    it('encodes and decodes cursor correctly', () => {
      const timestamp = '2026-04-08T10:00:00.000Z';
      const id = 'abc-123';
      const cursor = encodeCursor(timestamp, id);
      const decoded = decodeCursor(cursor);
      expect(decoded).not.toBeNull();
      expect(decoded!.t).toBe(timestamp);
      expect(decoded!.i).toBe(id);
    });

    it('round-trips with numeric-like id', () => {
      const timestamp = '2025-01-01T00:00:00.000Z';
      const id = '99999';
      const cursor = encodeCursor(timestamp, id);
      const decoded = decodeCursor(cursor);
      expect(decoded).not.toBeNull();
      expect(decoded!.t).toBe(timestamp);
      expect(decoded!.i).toBe(id);
    });
  });

  describe('decodeCursor', () => {
    it('returns null for invalid input', () => {
      const result = decodeCursor('not-valid-base64url!!!');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = decodeCursor('');
      expect(result).toBeNull();
    });

    it('returns null for valid base64url that is not JSON', () => {
      const notJson = Buffer.from('hello world').toString('base64url');
      const result = decodeCursor(notJson);
      expect(result).toBeNull();
    });

    it('returns null for JSON missing required fields', () => {
      const missingFields = Buffer.from(JSON.stringify({ x: 1 })).toString('base64url');
      const result = decodeCursor(missingFields);
      expect(result).toBeNull();
    });
  });

  describe('buildCursorWhere', () => {
    it('generates correct WHERE clause with cursor', () => {
      const cursor = encodeCursor('2026-04-08T10:00:00.000Z', 'row-id-1');
      const result = buildCursorWhere(cursor, 'created_at', 'id', 1);
      expect(result.where).toBeTruthy();
      expect(result.where).toContain('created_at');
      expect(result.where).toContain('id');
      expect(result.params).toHaveLength(2);
      expect(result.params[0]).toBe('2026-04-08T10:00:00.000Z');
      expect(result.params[1]).toBe('row-id-1');
    });

    it('returns empty where without cursor', () => {
      const result = buildCursorWhere(null, 'created_at', 'id', 1);
      expect(result.where).toBe('');
      expect(result.params).toHaveLength(0);
    });

    it('returns empty where for invalid cursor', () => {
      const result = buildCursorWhere('invalid-cursor-!!', 'created_at', 'id', 1);
      expect(result.where).toBe('');
      expect(result.params).toHaveLength(0);
    });

    it('respects startParamIndex for param placeholders', () => {
      const cursor = encodeCursor('2026-04-08T10:00:00.000Z', 'row-id-1');
      const result = buildCursorWhere(cursor, 'created_at', 'id', 3);
      expect(result.where).toContain('$3');
      expect(result.where).toContain('$4');
    });
  });

  describe('buildCursorResponse', () => {
    const makeRows = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `id-${i}`,
        created_at: `2026-04-08T${String(i).padStart(2, '0')}:00:00.000Z`,
        value: `item ${i}`,
      }));

    it('includes nextCursor when hasMore (rows.length > limit)', () => {
      const rows = makeRows(11); // limit=10, extra row signals more
      const result = buildCursorResponse(rows, 10, 'created_at', 'id');
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
      expect(result.data).toHaveLength(10);
    });

    it('has no nextCursor when !hasMore (rows.length <= limit)', () => {
      const rows = makeRows(5);
      const result = buildCursorResponse(rows, 10, 'created_at', 'id');
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.data).toHaveLength(5);
    });

    it('has no nextCursor when rows exactly equal limit', () => {
      const rows = makeRows(10);
      const result = buildCursorResponse(rows, 10, 'created_at', 'id');
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
      expect(result.data).toHaveLength(10);
    });

    it('nextCursor encodes the last row of returned data', () => {
      const rows = makeRows(11);
      const result = buildCursorResponse(rows, 10, 'created_at', 'id');
      // nextCursor should encode the 10th row (index 9), not the 11th
      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded).not.toBeNull();
      expect(decoded!.i).toBe('id-9');
    });
  });
});
