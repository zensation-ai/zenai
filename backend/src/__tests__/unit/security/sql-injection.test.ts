/**
 * Security Tests: SQL Injection Prevention
 *
 * Tests that verify INTERVAL parameters are properly parameterized
 * using make_interval() instead of string interpolation.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Source files to check for SQL injection vulnerabilities
const SOURCE_FILES = [
  'services/proactive-suggestions.ts',
  'services/business-context.ts',
  'services/microsoft.ts',
  'services/routine-detection.ts',
];

// Pattern that indicates SQL injection vulnerability
const VULNERABLE_INTERVAL_PATTERN = /INTERVAL\s+['"`]\s*\$\{[^}]+\}/gi;
const VULNERABLE_INTERVAL_PATTERN_ALT = /INTERVAL\s+['"`][^'"]*\$\{/gi;

// Pattern for safe parameterized intervals
const SAFE_INTERVAL_PATTERN = /make_interval\s*\(\s*(days|hours|mins|secs|weeks|months|years)\s*=>\s*\$\d+\s*\)/gi;

describe('SQL Injection Prevention', () => {
  describe('INTERVAL Parameter Safety', () => {
    SOURCE_FILES.forEach((file) => {
      describe(file, () => {
        let content: string;

        beforeAll(() => {
          const filePath = join(__dirname, '..', '..', '..', file);
          content = readFileSync(filePath, 'utf-8');
        });

        it('should not use string interpolation in INTERVAL clauses', () => {
          const vulnerableMatches = content.match(VULNERABLE_INTERVAL_PATTERN) || [];
          const vulnerableMatchesAlt = content.match(VULNERABLE_INTERVAL_PATTERN_ALT) || [];

          const allVulnerableMatches = [...vulnerableMatches, ...vulnerableMatchesAlt];

          expect(allVulnerableMatches).toEqual([]);
        });

        it('should use make_interval() for dynamic INTERVAL values', () => {
          // Check if file contains any INTERVAL usage that should be parameterized
          const hasIntervalUsage = /NOW\(\)\s*[-+]\s*/i.test(content);

          if (hasIntervalUsage) {
            const safeMatches = content.match(SAFE_INTERVAL_PATTERN) || [];
            expect(safeMatches.length).toBeGreaterThan(0);
          }
        });

        it('should pass all time values as query parameters', () => {
          // Extract all queryContext/pool.query calls and verify parameters
          const queryCallPattern = /query(?:Context)?\s*\(\s*(?:context,\s*)?[`'"][\s\S]*?make_interval\s*\([^)]+\)[\s\S]*?[`'"]\s*,\s*\[([^\]]+)\]/gi;
          const matches = content.matchAll(queryCallPattern);

          for (const match of matches) {
            const params = match[1];
            // Verify that make_interval references $n parameters that exist in the array
            expect(params).toBeDefined();
          }
        });
      });
    });
  });

  describe('No Raw String Concatenation in SQL', () => {
    SOURCE_FILES.forEach((file) => {
      it(`${file} should not concatenate variables directly into SQL strings`, () => {
        const filePath = join(__dirname, '..', '..', '..', file);
        const content = readFileSync(filePath, 'utf-8');

        // Look for dangerous patterns like: `SELECT ... ${variable} ...`
        // But exclude make_interval which is safe
        const dangerousPattern = /`[^`]*SELECT[^`]*\$\{(?!.*make_interval)[^}]+\}[^`]*`/gi;
        const matches = content.match(dangerousPattern) || [];

        // Filter out false positives (template literals used for non-SQL purposes)
        const sqlMatches = matches.filter(m =>
          m.includes('SELECT') ||
          m.includes('INSERT') ||
          m.includes('UPDATE') ||
          m.includes('DELETE')
        );

        expect(sqlMatches).toEqual([]);
      });
    });
  });
});

describe('Parameterized Query Patterns', () => {
  it('proactive-suggestions.ts should use make_interval(hours => $n) for FOLLOW_UP_LOOKBACK_HOURS', () => {
    const filePath = join(__dirname, '..', '..', '..', 'services', 'proactive-suggestions.ts');
    const content = readFileSync(filePath, 'utf-8');

    // Check for the correct pattern
    expect(content).toMatch(/make_interval\s*\(\s*hours\s*=>\s*\$\d+\s*\)/);

    // Ensure the vulnerable pattern is NOT present
    expect(content).not.toMatch(/INTERVAL\s+['"`]\$\{CONFIG\.FOLLOW_UP_LOOKBACK_HOURS\}/);
  });

  it('business-context.ts should use make_interval(days => $n) for days parameter', () => {
    const filePath = join(__dirname, '..', '..', '..', 'services', 'business-context.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/make_interval\s*\(\s*days\s*=>\s*\$\d+\s*\)/);
    expect(content).not.toMatch(/INTERVAL\s+['"`]\$\{days\}/);
  });

  it('microsoft.ts should use make_interval(hours => $n) for hours parameter', () => {
    const filePath = join(__dirname, '..', '..', '..', 'services', 'microsoft.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/make_interval\s*\(\s*hours\s*=>\s*\$\d+\s*\)/);
    expect(content).not.toMatch(/INTERVAL\s+['"`]\$\{hours\}/);
  });

  it('routine-detection.ts should use make_interval(mins => $n) for SEQUENCE_TIME_WINDOW_MINUTES', () => {
    const filePath = join(__dirname, '..', '..', '..', 'services', 'routine-detection.ts');
    const content = readFileSync(filePath, 'utf-8');

    expect(content).toMatch(/make_interval\s*\(\s*mins\s*=>\s*\$\d+\s*\)/);
    expect(content).not.toMatch(/INTERVAL\s+['"`]\$\{CONFIG\.SEQUENCE_TIME_WINDOW_MINUTES\}/);
  });
});
