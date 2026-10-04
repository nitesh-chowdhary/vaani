import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'src/features/auth/**/*.test.ts',
      'src/features/course/**/*.test.ts',
      'src/features/sessions/**/*.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
