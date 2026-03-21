/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

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
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react-dom/client': path.resolve(__dirname, 'node_modules/react-dom/client'),
    },
  },
});
