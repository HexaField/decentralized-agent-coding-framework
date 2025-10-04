import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts'],
    globals: true,
    setupFiles: ['server/test.setup.ts'],
  },
})
