import { defineConfig } from 'vitest/config';

/** Emulator-based Security Rules tests. Run with `npm run test:rules` (needs Java + the Firestore emulator). */
export default defineConfig({
  test: { environment: 'node', include: ['tests/rules/**/*.test.ts'], testTimeout: 20000, hookTimeout: 30000, fileParallelism: false },
});
