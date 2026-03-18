/**
 * Safe JSON Serialization
 *
 * Handles circular references and BigInt values that would cause
 * JSON.stringify to throw. Uses WeakSet for efficient cycle detection.
 *
 * @module utils/safe-stringify
 */

/**
 * Safely serialize a value to JSON, handling:
 * - Circular references (replaced with "[Circular]")
 * - BigInt values (converted to string)
 * - Undefined values (standard JSON behavior)
 *
 * @param value - The value to serialize
 * @param space - Optional indentation (same as JSON.stringify)
 * @returns JSON string
 */
export function safeStringify(value: unknown, space?: number): string {
  const seen = new WeakSet();

  return JSON.stringify(value, (_key: string, val: unknown) => {
    // Handle BigInt
    if (typeof val === 'bigint') {
      return val.toString();
    }

    // Handle circular references
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val);
    }

    return val;
  }, space);
}
