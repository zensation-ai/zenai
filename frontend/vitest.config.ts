/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Resolve packages for pnpm workspace compatibility
// Uses require.resolve to follow Node's module resolution (handles pnpm store, hoisting, symlinks)
function resolvePackage(pkg: string): string {
  try {
    // require.resolve gives us the main entry point, we need the package directory
    const resolved = require.resolve(pkg, { paths: [__dirname, path.resolve(__dirname, '..')] });
    // Walk up from resolved entry to find the package root (directory containing package.json)
    let dir = path.dirname(resolved);
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        const pkgJson = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        if (pkgJson.name === pkg) return dir;
      }
      dir = path.dirname(dir);
    }
    return path.dirname(resolved);
  } catch {
    // Fallback to manual lookup
    const candidates = [
      path.resolve(__dirname, 'node_modules', pkg),
      path.resolve(__dirname, '..', 'node_modules', pkg),
    ];
    for (const c of candidates) {
      try {
        const real = fs.realpathSync(c);
        if (fs.existsSync(real)) return real;
      } catch { /* skip */ }
    }
    return candidates[0];
  }
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
