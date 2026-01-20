/**
 * Security Tests: SSL Certificate Validation
 *
 * Tests that verify SSL certificate validation is properly enabled
 * for database connections in production environments.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Database configuration files
const DATABASE_FILES = [
  'utils/database.ts',
  'utils/database-context.ts',
];

describe('SSL Certificate Validation', () => {
  describe('Production SSL Configuration', () => {
    DATABASE_FILES.forEach((file) => {
      describe(file, () => {
        let content: string;

        beforeAll(() => {
          const filePath = join(__dirname, '..', '..', '..', file);
          content = readFileSync(filePath, 'utf-8');
        });

        it('should have rejectUnauthorized: true for production', () => {
          // Check that the file contains the secure configuration
          expect(content).toMatch(/rejectUnauthorized:\s*true/);
        });

        it('should NOT have rejectUnauthorized: false for production', () => {
          // Ensure the vulnerable pattern is NOT present
          // Note: The pattern might exist in comments explaining the change,
          // so we check the actual configuration code
          const configPattern = /\?\s*\{\s*rejectUnauthorized:\s*false\s*\}/;
          expect(content).not.toMatch(configPattern);
        });

        it('should skip SSL for internal Railway connections', () => {
          // Internal Railway connections (.railway.internal) should not use SSL
          expect(content).toMatch(/isInternalRailway/);
          expect(content).toMatch(/\.railway\.internal/);
        });

        it('should mention NODE_EXTRA_CA_CERTS for custom certificates', () => {
          // Documentation should mention how to use custom CA certificates
          expect(content).toMatch(/NODE_EXTRA_CA_CERTS/i);
        });
      });
    });
  });

  describe('SSL Configuration Logic', () => {
    it('database.ts should have correct SSL config structure', () => {
      const filePath = join(__dirname, '..', '..', '..', 'utils', 'database.ts');
      const content = readFileSync(filePath, 'utf-8');

      // Verify the ternary structure:
      // isInternalRailway ? false : production ? { rejectUnauthorized: true } : undefined
      expect(content).toMatch(/isInternalRailway[\s\S]*\?\s*false[\s\S]*:\s*process\.env\.NODE_ENV\s*===\s*['"]production['"]/);
    });

    it('database-context.ts should have correct SSL config structure', () => {
      const filePath = join(__dirname, '..', '..', '..', 'utils', 'database-context.ts');
      const content = readFileSync(filePath, 'utf-8');

      // Verify the ternary structure
      expect(content).toMatch(/isInternalRailway[\s\S]*\?\s*false[\s\S]*:\s*process\.env\.NODE_ENV\s*===\s*['"]production['"]/);
    });
  });

  describe('Development Environment', () => {
    DATABASE_FILES.forEach((file) => {
      it(`${file} should allow undefined SSL in development`, () => {
        const filePath = join(__dirname, '..', '..', '..', file);
        const content = readFileSync(filePath, 'utf-8');

        // In development (non-production), SSL should be undefined (not configured)
        // This is the : undefined part at the end of the ternary
        expect(content).toMatch(/:\s*undefined/);
      });
    });
  });
});

describe('MITM Prevention', () => {
  it('should not disable certificate validation globally', () => {
    DATABASE_FILES.forEach((file) => {
      const filePath = join(__dirname, '..', '..', '..', file);
      const content = readFileSync(filePath, 'utf-8');

      // Ensure NODE_TLS_REJECT_UNAUTHORIZED is not set to '0'
      expect(content).not.toMatch(/NODE_TLS_REJECT_UNAUTHORIZED.*['"]0['"]/);
      expect(content).not.toMatch(/process\.env\.NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"]/);
    });
  });

  it('should not contain insecure SSL comments recommending false', () => {
    DATABASE_FILES.forEach((file) => {
      const filePath = join(__dirname, '..', '..', '..', file);
      const content = readFileSync(filePath, 'utf-8');

      // The old security note recommending false should be updated
      expect(content).not.toMatch(/rejectUnauthorized:\s*false.*acceptable/i);
    });
  });
});
