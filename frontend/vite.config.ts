import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import viteCompression from 'vite-plugin-compression';
import path from 'path';
import fs from 'fs';

// Resolve symlinks for pnpm workspace compatibility in CI
// Checks local node_modules first, then root (shamefully-hoist puts deps in root)
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

// Use relative paths when building for Electron (file:// protocol)
const isElectronBuild = process.env.ELECTRON_BUILD === 'true';

export default defineConfig({
  base: isElectronBuild ? './' : '/',
  // Deduplicate React — prevents "multiple copies of React" in pnpm workspaces
  // resolvePackage() follows symlinks for pnpm CI compatibility
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'react/jsx-runtime': path.join(resolvePackage('react'), 'jsx-runtime'),
      'react/jsx-dev-runtime': path.join(resolvePackage('react'), 'jsx-dev-runtime'),
      react: resolvePackage('react'),
      'react-dom': resolvePackage('react-dom'),
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    // Bundle analyzer: generates stats.html after build
    // Run `npm run build` then open stats.html to inspect bundle composition
    visualizer({
      filename: 'stats.html',
      gzipSize: true,
      brotliSize: true,
      open: false, // Don't auto-open in CI
    }),
    // Pre-compress static assets with Brotli (.br) and gzip (.gz)
    // Vercel also serves Brotli automatically, but pre-compressed files reduce CPU on the edge
    viteCompression({ algorithm: 'brotliCompress', ext: '.br', threshold: 512 }),
    viteCompression({ algorithm: 'gzip', ext: '.gz', threshold: 512 }),
    // Sentry source map upload — only when auth token is available (CI)
    ...(process.env.SENTRY_AUTH_TOKEN ? [sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT_FRONTEND || 'zenai-frontend',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: {
        name: process.env.SENTRY_RELEASE || `zenai-frontend@${process.env.npm_package_version || '0.0.0'}`,
      },
      sourcemaps: {
        filesToDeleteAfterUpload: ['./dist/**/*.map'],
      },
      telemetry: false,
    })] : []),
  ],
  server: {
    port: 5173,
    proxy: {
      // SSE streaming endpoints need special timeout handling
      // Extended Thinking + Tool Use can take up to 300s
      '/api/chat/sessions': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: 0,        // No timeout for SSE streams
        proxyTimeout: 0,   // No proxy timeout for SSE streams
      },
      '/api/agents/execute/stream': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: 0,
        proxyTimeout: 0,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: 300000,    // 5 min for regular API calls
      },
    },
  },
  // esbuild >=0.25 requires es2022+ for destructuring transform support
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
  build: {
    // Target modern browsers for smaller output (drops legacy polyfills)
    // es2022 required for esbuild >=0.25 compatibility (destructuring transform)
    target: 'es2022',
    // vendor-syntax uses light build with common languages (~60KB vs ~619KB full)
    chunkSizeWarningLimit: 250,
    // Hidden source maps: uploaded to Sentry, not served to browsers
    sourcemap: 'hidden',
    // Enable CSS code splitting - only load CSS for active chunks
    cssCodeSplit: true,
    // Minification settings for optimal compression
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,   // Remove console.log/debug in production
        drop_debugger: true,  // Remove debugger statements
        pure_funcs: ['console.debug', 'console.log'],
        passes: 2,            // Multiple optimization passes
      },
      mangle: {
        safari10: true,       // Workaround for Safari 10 bugs
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          // === Vendor chunks: separate large libraries ===

          // React core (react + react-dom) — loaded on every page
          if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }

          // React Router — loaded on every page (routing infrastructure)
          if (id.includes('node_modules/react-router-dom/') || id.includes('node_modules/react-router/') || id.includes('node_modules/@remix-run/router/')) {
            return 'vendor-router';
          }

          // TanStack React Query — loaded on every page (data layer)
          if (id.includes('node_modules/@tanstack/react-query') || id.includes('node_modules/@tanstack/query-core')) {
            return 'vendor-query';
          }

          // Axios — HTTP client, loaded on every page
          if (id.includes('node_modules/axios/')) {
            return 'vendor-axios';
          }

          // Syntax Highlighter — only loaded when viewing code
          if (id.includes('node_modules/react-syntax-highlighter/')) {
            return 'vendor-syntax';
          }

          // Markdown rendering — only loaded for markdown content
          if (id.includes('node_modules/react-markdown/') || id.includes('node_modules/remark-gfm/') || id.includes('node_modules/mdast-') || id.includes('node_modules/micromark') || id.includes('node_modules/unified/') || id.includes('node_modules/unist-')) {
            return 'vendor-markdown';
          }

          // ReactFlow — only loaded on graph/workflow pages
          if (id.includes('node_modules/reactflow/') || id.includes('node_modules/@reactflow/')) {
            return 'vendor-reactflow';
          }

          // Zod — validation library
          if (id.includes('node_modules/zod/')) {
            return 'vendor-zod';
          }

          // Sentry — error tracking
          if (id.includes('node_modules/@sentry/')) {
            return 'vendor-sentry';
          }

          // Recharts core (state/util/hooks) — separate from chart rendering
          if (id.includes('node_modules/recharts/')) {
            if (id.includes('/state/') || id.includes('/util/') || id.includes('/context/') || id.includes('/hooks') || id.includes('/container/') || id.includes('/synchronisation/')) {
              return 'vendor-recharts-core';
            }
            return 'vendor-recharts-charts';
          }

          // d3 modules used by recharts — separate chunk
          if (id.includes('node_modules/d3-') || id.includes('node_modules/victory-vendor/') || id.includes('node_modules/internmap/')) {
            return 'vendor-d3';
          }

          // DOMPurify — XSS sanitization
          if (id.includes('node_modules/dompurify/')) {
            return 'vendor-dompurify';
          }

          // === Feature chunks for lazy-loaded pages ===
          if (id.includes('src/components/AnalyticsDashboard') || id.includes('src/components/DigestDashboard')) return 'feature-insights';
          if (id.includes('src/components/IncubatorPage') || id.includes('src/components/ProactiveDashboard') || id.includes('src/components/EvolutionDashboard')) return 'feature-ai';
          if (id.includes('src/components/LearningDashboard')) return 'feature-learning';
          if (id.includes('src/components/MediaGallery')) return 'feature-media';
          if (id.includes('src/components/MeetingsPage') || id.includes('src/components/MeetingDetail')) return 'feature-meetings';
          if (id.includes('src/components/VoiceChat/')) return 'feature-voice';
          if (id.includes('src/components/EmailPage/')) return 'feature-email';
          if (id.includes('src/components/FinancePage/')) return 'feature-finance';
          if (id.includes('src/components/BrowserPage/')) return 'feature-browser';
          if (id.includes('src/components/ContactsPage/')) return 'feature-contacts';
          if (id.includes('src/components/AgentTeamsPage')) return 'feature-agents';

          // === Smart Page chunks (Phase 118) ===
          if (id.includes('src/components/IdeasPage/')) return 'smart-ideas';
          if (id.includes('src/components/CockpitPage/')) return 'smart-cockpit';
          if (id.includes('src/components/WissenPage/')) return 'smart-wissen';
          if (id.includes('src/components/MeineKIPage/')) return 'smart-meine-ki';
          if (id.includes('src/components/SystemPage/')) return 'smart-system';
          if (id.includes('src/components/ChatHub/')) return 'smart-chat-hub';
          if (id.includes('src/components/MemoryInsightsPage/')) return 'smart-memory';
        },
      },
    },
  },
});
