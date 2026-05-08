/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Resolve packages for pnpm workspace compatibility
// Uses require.resolve to follow Node's module resolution (handles pnpm store, hoisting, symlinks)
// Returns the path to a specific file within the package (e.g. 'react/index.js')
function resolvePackageFile(pkg: string, file: string): string {
  const subpath = `${pkg}/${file}`;
  // Search paths: local, worktree root, and main KI-AB repo (for pnpm workspaces / git worktrees)
  const searchPaths = [
    __dirname,
    path.resolve(__dirname, '..'),
    path.resolve(__dirname, '..', '..', '..', '..', 'KI-AB', 'frontend'),
    path.resolve(__dirname, '..', '..', '..', '..', 'KI-AB'),
  ];
  // Try require.resolve for the specific file first (most accurate)
  try {
    return require.resolve(subpath, { paths: searchPaths });
  } catch {
    // Fallback: find package dir and join
  }
  // Find the package directory by resolving the main entry
  try {
    const mainResolved = require.resolve(pkg, { paths: searchPaths });
    let dir = path.dirname(mainResolved);
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        const pkgJson = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        if (pkgJson.name === pkg) return path.join(dir, file);
      }
      dir = path.dirname(dir);
    }
    return path.join(path.dirname(mainResolved), file);
  } catch {
    // Manual fallback using candidate directories
    const candidates = [
      path.resolve(__dirname, 'node_modules', pkg),
      path.resolve(__dirname, '..', 'node_modules', pkg),
      path.resolve(__dirname, '..', '..', '..', '..', 'KI-AB', 'frontend', 'node_modules', pkg),
      path.resolve(__dirname, '..', '..', '..', '..', 'KI-AB', 'node_modules', pkg),
    ];
    for (const c of candidates) {
      try {
        const real = fs.realpathSync(c);
        if (fs.existsSync(path.join(real, file))) return path.join(real, file);
      } catch { /* skip */ }
    }
    return path.join(candidates[0], file);
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
      'react/jsx-runtime': resolvePackageFile('react', 'jsx-runtime.js'),
      'react/jsx-dev-runtime': resolvePackageFile('react', 'jsx-dev-runtime.js'),
      'react': resolvePackageFile('react', 'index.js'),
      'react-dom/client': resolvePackageFile('react-dom', 'client.js'),
      'react-dom': resolvePackageFile('react-dom', 'index.js'),
    },
  },
});
