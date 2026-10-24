/** Build config for the browser e2e ONLY: swaps the Firestore profile module for e2e/fakeProfiles.ts. Not used by npm run build. */
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import base from './vite.config';

export default mergeConfig(base, {
  resolve: { alias: [{ find: /^\.\/firestoreProfiles$/, replacement: fileURLToPath(new URL('./e2e/fakeProfiles.ts', import.meta.url)) }] },
});
