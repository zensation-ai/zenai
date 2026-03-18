import { validateContext, getContextFromRequest } from '../../../types/context';

describe('AIContext validation', () => {
  test('accepts valid contexts', () => {
    expect(validateContext('personal')).toBe('personal');
    expect(validateContext('work')).toBe('work');
    expect(validateContext('learning')).toBe('learning');
    expect(validateContext('creative')).toBe('creative');
  });
  test('rejects invalid context', () => {
    expect(() => validateContext('invalid')).toThrow('Invalid context');
  });
  test('getContextFromRequest extracts context', () => {
    const req = { params: { context: 'work' } };
    expect(getContextFromRequest(req)).toBe('work');
  });
  test('getContextFromRequest throws on missing', () => {
    const req = { params: {} };
    expect(() => getContextFromRequest(req)).toThrow('missing');
  });
});
