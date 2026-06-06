import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Vite config for Spine - assembled src as working root
export default defineConfig({
  plugins: [
    react(),
  ],

  // Root directory for the assembled app
  root: path.resolve(__dirname, '../.assembled/src'),
  
  // Build configuration
  build: {
    outDir: path.resolve(__dirname, '../dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-ui': ['lucide-react', 'clsx', 'tailwind-merge', 'class-variance-authority'],
          'vendor-markdown': ['marked'],
        },
      },
    },
  },
  
  // Development server
  server: {
    port: 3001,
    host: true,
    fs: {
      // Allow serving files from framework, custom, and assembled for app loading
      allow: [
        path.resolve(__dirname, '../.assembled'),
        path.resolve(__dirname, '../.framework'),
        path.resolve(__dirname, '../custom'),
        path.resolve(__dirname, '../node_modules'),
      ]
    },
    proxy: {
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\//, '/.netlify/functions/'),
      }
    }
  },
  
  // Resolve paths
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../.assembled/src'),
      '@shared': path.resolve(__dirname, '../.framework/functions/_shared'),
      '@core': path.resolve(__dirname, '../.assembled/src'),
      '@custom': path.resolve(__dirname, '../custom/apps')
    }
  },
  
  // Environment variables
  define: {},
  
  // Environment directory (project root for .env files)
  envDir: path.resolve(__dirname, '..'),
  
  // PostCSS configuration
  css: {
    postcss: path.resolve(__dirname, 'postcss.config.js'),
  },
})
