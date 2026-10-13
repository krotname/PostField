import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,mjs}'],
    environment: 'node',
    coverage: { provider: 'v8', include: ['src/core/**', 'src/application/**', 'src/adapters/**'] },
  },
});
