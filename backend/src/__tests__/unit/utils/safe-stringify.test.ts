/**
 * Tests for Safe JSON Serialization
 */

import { safeStringify } from '../../../utils/safe-stringify';

describe('safeStringify', () => {
  it('serializes normal objects', () => {
    const obj = { name: 'test', value: 42 };
    expect(safeStringify(obj)).toBe(JSON.stringify(obj));
  });

  it('handles circular references', () => {
    const obj: Record<string, unknown> = { name: 'root' };
    obj.self = obj;
    const result = safeStringify(obj);
    expect(result).toContain('"self":"[Circular]"');
    expect(result).toContain('"name":"root"');
  });

  it('handles BigInt values', () => {
    const obj = { big: BigInt(9007199254740991) };
    const result = safeStringify(obj);
    expect(result).toContain('"big":"9007199254740991"');
  });

  it('handles nested circular references', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b', parent: a };
    a.child = b;
    b.grandchild = a;
    const result = safeStringify(a);
    expect(result).toContain('[Circular]');
    expect(result).not.toThrow;
  });

  it('handles null and undefined', () => {
    expect(safeStringify(null)).toBe('null');
    expect(safeStringify(undefined)).toBe(undefined);
    expect(safeStringify({ a: null, b: undefined })).toBe('{"a":null}');
  });

  it('handles arrays with circular refs', () => {
    const arr: unknown[] = [1, 2, 3];
    arr.push(arr);
    const result = safeStringify(arr);
    expect(result).toContain('[Circular]');
  });

  it('supports space parameter', () => {
    const obj = { a: 1 };
    const result = safeStringify(obj, 2);
    expect(result).toContain('\n');
  });
});
