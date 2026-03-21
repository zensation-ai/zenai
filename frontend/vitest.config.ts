/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Resolve symlinks for pnpm workspace compatibility
// Checks local node_modules first, then root
function resolvePackage(pkg: string): string {
  const candidates = [
    path.resolve(__dirname, 'node_modules', pkg),
    path.resolve(__dirname, '..', 'node_modules', pkg),
  ];
  for (const candidate of candidates) {
    try {
      const real = fs.realpathSync(candidate);
      if (fs.existsSync(real)) return real;
    } catch {
      // Symlink target doesn't exist, try next
    }
  }
  return candidates[0]; // fallback
}

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/utils/**/*.{ts,tsx}',
        'src/contexts/**/*.{ts,tsx}',
        'src/api/**/*.{ts,tsx}',
        'src/components/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/__tests__/**',
        // Static config/constants files - no logic to test
        'src/utils/aiSteps.ts',
        'src/utils/aiPersonality.ts',
        'src/utils/humanizedMessages.ts',
        'src/utils/native.ts', // Capacitor native bindings
      ],
      thresholds: {
        // Enforce 60% coverage on core logic directories.
        // Static config files (aiSteps, aiPersonality, humanizedMessages, native)
        // are excluded from coverage scope.
        'src/utils/**/*.ts': {
          branches: 60,
          functions: 60,
          lines: 60,
          statements: 60,
        },
        'src/contexts/**/*.tsx': {
          branches: 60,
          functions: 60,
          lines: 60,
          statements: 60,
        },
        'src/api/**/*.ts': {
          branches: 60,
          functions: 60,
          lines: 60,
          statements: 60,
        },
      },
    },
    css: true,
    server: {
      deps: {
        inline: [
          '@tanstack/react-query',
        ],
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      'react/jsx-runtime': path.join(resolvePackage('react'), 'jsx-runtime'),
      'react/jsx-dev-runtime': path.join(resolvePackage('react'), 'jsx-dev-runtime'),
      'react': resolvePackage('react'),
      'react-dom/client': path.join(resolvePackage('react-dom'), 'client'),
      'react-dom': resolvePackage('react-dom'),
    },
  },
});
