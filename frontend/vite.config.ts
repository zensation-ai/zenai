import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
