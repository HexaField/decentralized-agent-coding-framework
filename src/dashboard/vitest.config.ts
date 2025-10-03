import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'server/**/*.test.js'],
    exclude: ['server/**/*.itest.*'],
    globals: true,
  setupFiles: ['server/test-setup.js'],
  },
})
