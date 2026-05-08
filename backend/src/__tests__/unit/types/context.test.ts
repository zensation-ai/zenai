import { validateContext, getContextFromRequest } from '../../../types/context';

describe('AIContext validation', () => {
  test('accepts valid contexts', () => {
    expect(validateContext('operations')).toBe('operations');
    expect(validateContext('finance')).toBe('finance');
    expect(validateContext('people')).toBe('people');
    expect(validateContext('strategy')).toBe('strategy');
  });
  test('rejects invalid context', () => {
    expect(() => validateContext('invalid')).toThrow('Invalid context');
  });
  test('getContextFromRequest extracts context', () => {
    const req = { params: { context: 'finance' } };
    expect(getContextFromRequest(req)).toBe('finance');
  });
  test('getContextFromRequest throws on missing', () => {
    const req = { params: {} };
    expect(() => getContextFromRequest(req)).toThrow('missing');
  });
});
