import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Accept GitHub Codespaces / dev-tunnel forwarded hostnames
    allowedHosts: ['.app.github.dev', '.github.dev', 'localhost'],
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: ['.app.github.dev', '.github.dev', 'localhost'],
  },
})
