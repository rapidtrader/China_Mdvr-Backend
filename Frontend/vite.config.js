import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  optimizeDeps: {
    include: ['hls.js', 'flv.js']
  },
  server: {
    proxy: {
      // Local dev: call same-origin `/api/*`, forward to Node backend
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true
      },
      // Socket.IO WebSocket proxy for local dev
      '/socket.io': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        ws: true
      }
    }
  },
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
