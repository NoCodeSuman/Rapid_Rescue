/**
 * Firestore implementation of ProfileService (collection users/{uid}). Profile data only: no credentials, no bookings.
 * Firestore is loaded lazily; the existing single Firebase app is reused.
 */
import { firebaseConfigError, getFirebaseAuth, getFirebaseDb } from '../lib/firebase';
import type { ProfileService } from './contracts';
import { ProfileError, isPermissionDenied, mapFirestoreError } from './profileErrors';
import { buildCreateValues, parseRemoteProfile } from './profileSchema';

const TIMEOUT_MS = 15000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new ProfileError('network', "We couldn't reach the profile service. Check your connection and try again.")), TIMEOUT_MS); });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function db() {
  const d = await getFirebaseDb();
  if (!d) throw new ProfileError('not-configured', firebaseConfigError ?? 'Firebase is not configured.');
  return d;
}

/** Runs an operation; on permission-denied, force-refreshes the ID token once (stale email_verified claim) and retries. */
async function attempt<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await withTimeout(op());
  } catch (e) {
    if (isPermissionDenied(e)) {
      const user = getFirebaseAuth()?.currentUser;
      if (user) {
        try { await user.getIdToken(true); return await withTimeout(op()); } catch (e2) { throw mapFirestoreError(e2); }
      }
    }
    throw mapFirestoreError(e);
  }
}

export const firestoreProfileService: ProfileService = {
  async loadOrCreate(identity, hint) {
    const { doc, getDoc, runTransaction, serverTimestamp } = await import('firebase/firestore');
    const database = await db();
    const ref = doc(database, 'users', identity.uid);
    return attempt(async () => {
      const snap = await getDoc(ref);
      if (snap.exists()) return parseRemoteProfile(identity.uid, snap.data());
      const values = buildCreateValues(identity, hint);
      // Transaction re-checks existence so a concurrent/duplicate creation can never overwrite an existing profile.
      const existing = await runTransaction(database, async (tx) => {
        const again = await tx.get(ref);
        if (again.exists()) return again.data();
        tx.set(ref, { ...values, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        return null;
      });
      return existing ? parseRemoteProfile(identity.uid, existing) : { ...values, createdAt: null, updatedAt: null };
    });
  },

  async createForRegistration(identity, hint) {
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const ref = doc(await db(), 'users', identity.uid);
    const values = buildCreateValues(identity, hint);
    // Create-only write without a read: rules allow unverified users to create (not read) their own profile.
    await attempt(() => setDoc(ref, { ...values, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  },

  async update(uid, patch) {
    const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const ref = doc(await db(), 'users', uid);
    await attempt(() => updateDoc(ref, { displayName: patch.displayName, phoneNumber: patch.phoneNumber, updatedAt: serverTimestamp() }));
  },
};
