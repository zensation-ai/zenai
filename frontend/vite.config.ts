import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';
import fs from 'fs';

// Resolve symlinks for pnpm workspace compatibility in CI
function resolvePackage(pkg: string): string {
  const pkgPath = path.resolve(__dirname, 'node_modules', pkg);
  try {
    return fs.realpathSync(pkgPath);
  } catch {
    return pkgPath;
  }
}

// Use relative paths when building for Electron (file:// protocol)
const isElectronBuild = process.env.ELECTRON_BUILD === 'true';

export default defineConfig({
  base: isElectronBuild ? './' : '/',
  // Deduplicate React — prevents "multiple copies of React" in pnpm workspaces
  // resolvePackage() follows symlinks for pnpm CI compatibility
  resolve: {
    alias: {
      'react/jsx-runtime': path.join(resolvePackage('react'), 'jsx-runtime'),
      'react/jsx-dev-runtime': path.join(resolvePackage('react'), 'jsx-dev-runtime'),
      react: resolvePackage('react'),
      'react-dom': resolvePackage('react-dom'),
    },
  },
  plugins: [
    react(),
    // Bundle analyzer: generates stats.html after build
    // Run `npm run build` then open stats.html to inspect bundle composition
    visualizer({
      filename: 'stats.html',
      gzipSize: true,
      brotliSize: true,
      open: false, // Don't auto-open in CI
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Target modern browsers for smaller output (drops legacy polyfills)
    target: 'es2020',
    // vendor-syntax uses light build with common languages (~60KB vs ~619KB full)
    chunkSizeWarningLimit: 250,
    // Disable sourcemaps in production for smaller bundles
    sourcemap: false,
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
          // Vendor chunks - separate large libraries
          if (id.includes('node_modules/react-dom/')) return 'vendor-react';
          if (id.includes('node_modules/react/')) return 'vendor-react';
          if (id.includes('node_modules/react-router-dom/') || id.includes('node_modules/react-router/') || id.includes('node_modules/@remix-run/router/')) return 'vendor-router';
          if (id.includes('node_modules/axios/')) return 'vendor-axios';
          if (id.includes('node_modules/react-syntax-highlighter/')) return 'vendor-syntax';
          if (id.includes('node_modules/react-markdown/') || id.includes('node_modules/remark-gfm/')) return 'vendor-markdown';
          if (id.includes('node_modules/reactflow/') || id.includes('node_modules/@reactflow/')) return 'vendor-reactflow';
          if (id.includes('node_modules/zod/')) return 'vendor-zod';

          // Recharts - split into core (state/util) and rendering (chart/cartesian)
          // to keep each chunk under 250 kB
          if (id.includes('node_modules/recharts/')) {
            if (id.includes('/state/') || id.includes('/util/') || id.includes('/context/') || id.includes('/hooks') || id.includes('/container/') || id.includes('/synchronisation/')) {
              return 'vendor-recharts-core';
            }
            return 'vendor-recharts-charts';
          }
          // d3 modules used by recharts — separate chunk to keep recharts-core < 250 kB
          if (id.includes('node_modules/d3-') || id.includes('node_modules/victory-vendor/') || id.includes('node_modules/internmap/')) {
            return 'vendor-d3';
          }

          // Feature-based chunks for lazy-loaded pages
          if (id.includes('src/components/AnalyticsDashboard') || id.includes('src/components/DigestDashboard')) return 'feature-insights';
          if (id.includes('src/components/IncubatorPage') || id.includes('src/components/ProactiveDashboard') || id.includes('src/components/EvolutionDashboard')) return 'feature-ai';
          if (id.includes('src/components/LearningDashboard')) return 'feature-learning';
          if (id.includes('src/components/MediaGallery')) return 'feature-media';
          if (id.includes('src/components/MeetingsPage') || id.includes('src/components/MeetingDetail')) return 'feature-meetings';
        },
      },
    },
  },
});
