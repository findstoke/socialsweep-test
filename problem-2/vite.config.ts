import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.test.ts',
        'console-app.ts',
        'search-implementation-old.ts',
      ],
      include: [
        'search-implementation-new.ts',
        'utils/**/*.ts',
        'types/**/*.ts',
      ],
    },
  },
});
