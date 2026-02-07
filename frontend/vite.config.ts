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
    // Increase chunk size warning limit slightly
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - separate large libraries
          'vendor-react': ['react', 'react-dom'],
          'vendor-axios': ['axios'],
          // Heavy rendering libs - lazy-loaded with ArtifactPanel
          'vendor-syntax': ['react-syntax-highlighter'],
          'vendor-markdown': ['react-markdown', 'remark-gfm'],

          // Feature-based chunks for lazy-loaded pages
          'feature-insights': [
            './src/components/DashboardHome.tsx',
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
            './src/components/StoriesPage.tsx',
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
