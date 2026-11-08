import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  plugins: [react()],
  // Whole-app tests that forge Large cases run past the 5 s default when every file runs in parallel.
  test: { globals: true, environment: 'jsdom', setupFiles: ['src/test/setup.ts'], testTimeout: 15_000 },
})
