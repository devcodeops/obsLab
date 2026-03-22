import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
    ],
    coverage: {
      include: [
        'packages/shared/src/**/*.ts',
        'apps/worker/src/**/*.ts',
        'apps/orchestrator/src/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/index.ts',
        '**/main.ts',
        '**/dto.ts',
        '**/types.ts',
        '**/app.module.ts',
      ],
    },
  },
});
