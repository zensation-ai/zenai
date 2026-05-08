/**
 * Shared types for LDNOOBW loader + build script.
 */

export type Severity = 'block' | 'soft';

export interface Entry {
  pattern: string;
  severity: Severity;
}
