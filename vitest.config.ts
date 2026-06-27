import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['scripts/**/*.ts'],
      exclude: [
        'scripts/**/*.d.ts',
        'scripts/**/index.ts',       // 纯 re-export
      ],
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: 'coverage',
    },
  }
})
