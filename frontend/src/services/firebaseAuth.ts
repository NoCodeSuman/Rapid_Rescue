/** Firebase Authentication implementation of AuthService. Identity only: no database, no profile storage. */
import {
  createUserWithEmailAndPassword, onAuthStateChanged, reload, sendEmailVerification, sendPasswordResetEmail,
  signInWithEmailAndPassword, signOut, updateProfile, type User as FirebaseUser,
} from 'firebase/auth';
import { firebaseConfigError, getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';
import { AuthError, mapFirebaseError } from './authErrors';
import type { AuthIdentity, AuthService } from './contracts';

const toIdentity = (u: FirebaseUser): AuthIdentity => ({ uid: u.uid, email: u.email ?? '', emailVerified: u.emailVerified, displayName: u.displayName });

function requireAuth() {
  const auth = getFirebaseAuth();
  if (!auth) throw new AuthError('config', firebaseConfigError ?? 'Firebase is not configured.');
  return auth;
}

export const firebaseAuthService: AuthService = {
  configured: isFirebaseConfigured,
  configError: firebaseConfigError,

  subscribe(cb) {
    const auth = getFirebaseAuth();
    if (!auth) { cb(null); return () => undefined; }
    return onAuthStateChanged(auth, (u) => cb(u ? toIdentity(u) : null), () => cb(null));
  },

  async register({ name, email, password }) {
    const auth = requireAuth();
    let user: FirebaseUser;
    try {
      user = (await createUserWithEmailAndPassword(auth, email.trim(), password)).user;
    } catch (e) { throw mapFirebaseError(e, 'register'); }
    // displayName is a field of the Auth user itself; best-effort, registration still succeeded without it.
    try { await updateProfile(user, { displayName: name.trim() }); } catch { /* non-fatal */ }
    try {
      await sendEmailVerification(user);
      return { identity: toIdentity(user), verificationEmailSent: true };
    } catch (e) {
      return { identity: toIdentity(user), verificationEmailSent: false, verificationError: mapFirebaseError(e, 'verify').message };
    }
  },

  async login(email, password) {
    const auth = requireAuth();
    try { return toIdentity((await signInWithEmailAndPassword(auth, email.trim(), password)).user); }
    catch (e) { throw mapFirebaseError(e, 'login'); }
  },

  async logout() {
    const auth = getFirebaseAuth();
    if (!auth) return;
    try { await signOut(auth); } catch (e) { throw mapFirebaseError(e, 'login'); }
  },

  async sendPasswordReset(email) {
    const auth = requireAuth();
    try { await sendPasswordResetEmail(auth, email.trim()); }
    catch (e) {
      // Neutral outcome: do not reveal whether an address is registered.
      if ((e as { code?: string } | null)?.code === 'auth/user-not-found') return;
      throw mapFirebaseError(e, 'reset');
    }
  },

  async resendVerification() {
    const auth = requireAuth();
    if (!auth.currentUser) throw new AuthError('no-user', 'Your session expired. Please log in again.');
    try { await sendEmailVerification(auth.currentUser); } catch (e) { throw mapFirebaseError(e, 'verify'); }
  },

  getCurrentUid() { return getFirebaseAuth()?.currentUser?.uid ?? null; },

  async reload() {
    const auth = requireAuth();
    if (!auth.currentUser) return null;
    try {
      await reload(auth.currentUser);
      // The ID token's email_verified claim (used by Firestore rules) only updates on token refresh.
      if (auth.currentUser?.emailVerified) await auth.currentUser.getIdToken(true);
    } catch (e) { throw mapFirebaseError(e, 'login'); }
    return auth.currentUser ? toIdentity(auth.currentUser) : null;
  },
};
