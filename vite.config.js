import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project site: https://<user>.github.io/shabbos-rsvp/
export default defineConfig({
  plugins: [react()],
  // CI sets VITE_BASE=/shabbos-rsvp/ for GitHub Pages
  base: process.env.VITE_BASE || '/',
})
