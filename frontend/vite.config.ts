import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
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
        manualChunks: {
          // Vendor chunks - separate large libraries
          'vendor-react': ['react', 'react-dom'],
          'vendor-router': ['react-router-dom'],
          'vendor-axios': ['axios'],
          // Heavy rendering libs - lazy-loaded with ArtifactPanel (light build ~60KB)
          'vendor-syntax': ['react-syntax-highlighter'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],
          // ReactFlow - heavy (~200KB), only used on Insights/Connections tab
          'vendor-reactflow': ['reactflow'],
          // Validation lib - used across components
          'vendor-zod': ['zod'],

          // Feature-based chunks for lazy-loaded pages
          'feature-insights': [
            './src/components/AnalyticsDashboard.tsx',
            './src/components/DigestDashboard.tsx',
          ],
          'feature-ai': [
            './src/components/IncubatorPage.tsx',
            './src/components/ProactiveDashboard.tsx',
            './src/components/EvolutionDashboard.tsx',
          ],
          'feature-learning': [
            './src/components/LearningDashboard.tsx',
            './src/components/LearningTasksDashboard.tsx',
          ],
          'feature-media': [
            './src/components/MediaGallery.tsx',
          ],
          'feature-meetings': [
            './src/components/MeetingsPage.tsx',
            './src/components/MeetingDetail.tsx',
          ],
        },
      },
    },
  },
});
