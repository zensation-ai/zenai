/**
 * Tests for Error Message Sanitization
 */

import { sanitizeError } from '../../../utils/sanitize-error';

describe('sanitizeError', () => {
  it('returns generic message in production', () => {
    const error = new Error('Database connection failed at postgres://user:pass@host:5432/db');
    const result = sanitizeError(error, 'production');
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.message).toBe('An internal error occurred');
    expect(result.message).not.toContain('Database');
    expect(result.message).not.toContain('postgres');
  });

  it('returns full details in development', () => {
    const error = new Error('Table "ideas" does not exist');
    const result = sanitizeError(error, 'development');
    expect(result.code).toBe('ERROR');
    expect(result.message).toBe('Table "ideas" does not exist');
  });

  it('handles PostgreSQL error codes in development', () => {
    const error = Object.assign(new Error('duplicate key'), { code: '23505' });
    const result = sanitizeError(error, 'development');
    expect(result.code).toBe('23505');
    expect(result.message).toBe('duplicate key');
  });

  it('handles non-Error values', () => {
    const result = sanitizeError('string error', 'development');
    expect(result.code).toBe('ERROR');
    expect(result.message).toBe('string error');
  });

  it('handles non-Error values in production', () => {
    const result = sanitizeError({ weird: 'object' }, 'production');
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.message).toBe('An internal error occurred');
  });
});
