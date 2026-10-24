/**
 * Pure validation of the Firebase *Web* configuration (client-side config, not a private key).
 * Kept free of SDK imports so it can be unit-tested. Error text lists variable NAMES only, never values.
 */
export interface FirebaseWebConfig {
  apiKey: string; authDomain: string; projectId: string; appId: string; storageBucket?: string; messagingSenderId?: string;
}
export const REQUIRED_FIREBASE_VARS = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'] as const;

const isMissing = (v: string | undefined) => !v || !v.trim() || v.trim().toLowerCase().startsWith('your_');

export function readFirebaseConfig(env: Record<string, string | undefined>): { config: FirebaseWebConfig | null; error: string | null } {
  const missing = REQUIRED_FIREBASE_VARS.filter((k) => isMissing(env[k]));
  if (missing.length) {
    return { config: null, error: `Firebase is not configured. Set ${missing.join(', ')} in .env.local (copy .env.example) and restart the dev server. See FIREBASE_AUTH_SETUP.md.` };
  }
  const opt = (k: string) => (isMissing(env[k]) ? undefined : env[k]!.trim());
  return {
    error: null,
    config: {
      apiKey: env.VITE_FIREBASE_API_KEY!.trim(), authDomain: env.VITE_FIREBASE_AUTH_DOMAIN!.trim(),
      projectId: env.VITE_FIREBASE_PROJECT_ID!.trim(), appId: env.VITE_FIREBASE_APP_ID!.trim(),
      storageBucket: opt('VITE_FIREBASE_STORAGE_BUCKET'), messagingSenderId: opt('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    },
  };
}
