/** Firebase initialisation: Authentication + lazily-loaded Firestore (profiles only). One app instance for both. */
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { readFirebaseConfig } from './firebaseConfig';

const { config, error } = readFirebaseConfig(import.meta.env as unknown as Record<string, string | undefined>);

/** Developer-facing message when configuration is missing/placeholder; null when configured. */
export const firebaseConfigError: string | null = error;
export const isFirebaseConfigured = config !== null;

/** The single Firebase app (safe across hot reloads). Null when not configured. */
function getFirebaseApp(): FirebaseApp | null {
  if (!config) return null;
  return getApps().length ? getApp() : initializeApp(config);
}

let authInstance: Auth | null = null;
export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!authInstance) authInstance = getAuth(app);
  return authInstance;
}

let dbPromise: Promise<Firestore | null> | null = null;
/** Loads the Firestore SDK on demand (keeps it out of the initial bundle) and reuses the existing app. */
export function getFirebaseDb(): Promise<Firestore | null> {
  const app = getFirebaseApp();
  if (!app) return Promise.resolve(null);
  if (!dbPromise) dbPromise = import('firebase/firestore').then(({ getFirestore }) => getFirestore(app));
  return dbPromise;
}
