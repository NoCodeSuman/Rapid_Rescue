import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { resolveLocalProfile } from '../domain/profileResolution';
import { useAppState } from '../hooks/useAppState';
import { errMsg, notify } from '../hooks/useNotify';
import { DEMO_MODE } from '../lib/demoMode';
import { clearPendingProfile, readPendingProfile, savePendingProfile } from '../lib/pendingProfile';
import type { AuthStatus } from '../routes/access';
import { services, subscribeToRemoteBookings, subscribeToAdminAppData, subscribeToOwnRecords } from '../services';
import { AuthError } from '../services/authErrors';
import { setSessionProfile, subscribeProfilePatches } from '../services/profileSession';
import type { AuthIdentity, ProfileHint, RegisterInput } from '../services/contracts';
import type { RemoteProfile, User, UserRole } from '../types';

export interface RegisterOutcome { verificationEmailSent: boolean; verificationError?: string; profileError?: string }

interface AuthValue {
  /** 'initializing' until Firebase reports its state AND (for verified users) the profile has loaded. */
  status: AuthStatus;
  /** App user. Name/phone/role/status come from the Firestore profile and email from Firebase Auth, never from local storage. */
  user: User | null;
  role: UserRole | null;
  identity: AuthIdentity | null;
  /** Message when a verified user's profile could not be loaded (status 'profile_error'). */
  profileError: string | null;
  configError: string | null;
  demoMode: boolean;
  isDemoSession: boolean;
  login: (email: string, password: string) => Promise<{ verified: boolean; user: User | null }>;
  register: (input: RegisterInput) => Promise<RegisterOutcome>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  recheckVerification: () => Promise<boolean>;
  retryProfile: () => Promise<void>;
  /** Developer development mode only (vite dev + VITE_ENABLE_DEMO_MODE=true). Not Firebase; bypasses verification. */
  loginDemo: (email: string, password: string) => Promise<User>;
}
const Ctx = createContext<AuthValue | null>(null);

export const dashboardPath = (role: UserRole) => `/${role}/dashboard`;

type ProfileState = 'idle' | 'loading' | 'error';

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useAppState();
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [profile, setProfile] = useState<RemoteProfile | null>(null);
  const [profileState, setProfileState] = useState<ProfileState>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);
  // If Firebase is not configured there is nothing to wait for; otherwise wait for the first observer result.
  const [initialized, setInitialized] = useState(() => !services.auth.configured);
  const [demoUserId, setDemoUserId] = useState<string | null>(() => (DEMO_MODE ? services.demoAuth.getSessionUserId() : null));
  const seq = useRef(0);
  const inflight = useRef<{ key: string; promise: Promise<User | null> } | null>(null);
  const deactivating = useRef(false);

  // Stale development sessions must never authenticate outside development mode.
  useEffect(() => { if (!DEMO_MODE) services.demoAuth.logout(); }, []);

  const buildHint = useCallback((id: AuthIdentity): ProfileHint => {
    const pending = readPendingProfile(id.uid);
    if (pending) return { displayName: pending.displayName, phoneNumber: pending.phoneNumber, role: pending.role };
    return services.profiles.localHint(id) ?? {}; // name/phone only; never a role (missing profiles default to patient)
  }, []);

  const run = useCallback(async (id: AuthIdentity | null): Promise<User | null> => {
    const mySeq = ++seq.current;
    if (!id || !id.emailVerified) {
      setIdentity(id); setProfile(null); setProfileState('idle'); setProfileError(null);
      return null;
    }
    if (DEMO_MODE) { services.demoAuth.logout(); setDemoUserId(null); } // Firebase state always wins over a development session
    setIdentity(id); setProfileState('loading'); setProfileError(null);
    try {
      const p = await services.remoteProfiles.loadOrCreate(id, buildHint(id));
      if (mySeq !== seq.current) return null; // superseded by a sign-out or a newer sign-in
      const synced = services.profiles.syncFromRemote(id, p);
      if (synced.kind === 'blocked') {
        // Email maps to a reserved seeded booking account: never adoptable by a Firebase identity.
        setIdentity(null); setProfile(null); setProfileState('idle');
        void services.auth.logout();
        notify.error('This account is not permitted to sign in with Firebase.');
        return null;
      }
      clearPendingProfile();
      setProfile(p); setProfileState('idle');
      return p.accountStatus === 'active' ? { ...synced.user, role: p.role, status: 'active' } : null;
    } catch (e) {
      if (mySeq !== seq.current) return null;
      setProfile(null); setProfileState('error'); setProfileError(errMsg(e));
      return null;
    }
  }, [buildHint]);

  /** De-duplicates concurrent calls for the same identity (observer + login both report the same sign-in). */
  const applyIdentity = useCallback((id: AuthIdentity | null): Promise<User | null> => {
    const key = id ? `${id.uid}:${id.emailVerified}` : 'null';
    if (inflight.current?.key === key) return inflight.current.promise;
    const promise: Promise<User | null> = run(id).finally(() => { if (inflight.current?.promise === promise) inflight.current = null; });
    inflight.current = { key, promise };
    return promise;
  }, [run]);

  useEffect(() => services.auth.subscribe((id) => { void applyIdentity(id).then(() => setInitialized(true)); }), [applyIdentity]);

  const localUser = useMemo<User | null>(() => {
    if (identity?.emailVerified && profile) {
      const res = resolveLocalProfile(state, identity.email);
      return res.kind === 'found' ? res.user : null;
    }
    if (!identity && DEMO_MODE && demoUserId) return state.users.find((u) => u.id === demoUserId) ?? null;
    return null;
  }, [state, identity, profile, demoUserId]);

  // Keep the session snapshot in step with state, and apply edits once Firestore has confirmed them.
  useEffect(() => {
    if (!identity?.emailVerified || !profile || profile.accountStatus !== 'active') return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void subscribeToRemoteBookings(identity.uid, profile.role).then((unsubscribe) => {
      if (cancelled) unsubscribe(); else stop = unsubscribe;
    }).catch((error) => console.error('Could not start Firestore booking sync:', error));
    return () => { cancelled = true; stop?.(); };
  }, [identity?.uid, identity?.emailVerified, profile?.uid, profile?.role, profile?.accountStatus]);

  // Patients and drivers publish their own record (so administrators can list them) and receive admin changes made for them.
  useEffect(() => {
    if (!identity?.emailVerified || !profile || profile.accountStatus !== 'active') return;
    if (profile.role !== 'patient' && profile.role !== 'driver') return;
    const role = profile.role;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void subscribeToOwnRecords({ uid: identity.uid, email: identity.email }, role).then((unsubscribe) => {
      if (cancelled) unsubscribe(); else stop = unsubscribe;
    }).catch((error) => console.error('Could not start Firestore record sync:', error));
    return () => { cancelled = true; stop?.(); };
  }, [identity?.uid, identity?.email, identity?.emailVerified, profile?.role, profile?.accountStatus]);

  useEffect(() => {
    if (!identity?.emailVerified || profile?.role !== 'admin' || profile.accountStatus !== 'active') return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void subscribeToAdminAppData().then(unsubscribe => { if (cancelled) unsubscribe(); else stop = unsubscribe; })
      .catch(error => console.error('Could not start Firestore admin data sync:', error));
    return () => { cancelled = true; stop?.(); };
  }, [identity?.uid, identity?.emailVerified, profile?.role, profile?.accountStatus]);

  useEffect(() => { setSessionProfile(profile); }, [profile]);
  useEffect(() => subscribeProfilePatches((patch) => {
    setProfile((p) => (p && p.uid === patch.uid ? { ...p, displayName: patch.displayName, phoneNumber: patch.phoneNumber } : p));
  }), []);

  // Display and trusted fields come from Firestore (profile) and Firebase Auth (email), not from the local cache,
  // so editing localStorage cannot change what is shown or the role used for routing. The local record only supplies its id.
  const user = useMemo<User | null>(() => {
    if (!localUser) return null;
    if (identity?.emailVerified && profile) {
      return profile.accountStatus === 'active'
        ? { ...localUser, name: profile.displayName, phone: profile.phoneNumber, email: identity.email, role: profile.role, status: 'active' }
        : null;
    }
    return localUser.status === 'active' ? localUser : null;
  }, [localUser, identity, profile]);

  // A deactivated account (Firestore accountStatus, or a deactivated local booking user) cannot stay signed in.
  const deactivated = (identity?.emailVerified && profile && profile.accountStatus !== 'active') || (!identity && !!localUser && localUser.status !== 'active');
  useEffect(() => {
    if (!deactivated || deactivating.current) return;
    deactivating.current = true;
    (async () => {
      try { await services.auth.logout(); } catch { /* the observer reports the real state */ }
      services.demoAuth.logout(); setDemoUserId(null); setIdentity(null); setProfile(null);
      notify.error('This account has been deactivated.');
      deactivating.current = false;
    })();
  }, [deactivated]);

  const status: AuthStatus = !initialized ? 'initializing'
    : identity
      ? !identity.emailVerified ? 'unverified'
        : profileState === 'loading' ? 'initializing'
        : profileState === 'error' ? 'profile_error'
        : user ? 'verified' : 'signed_out'
      : user ? 'verified' : 'signed_out';

  const login: AuthValue['login'] = useCallback(async (email, password) => {
    const id = await services.auth.login(email, password);
    const u = await applyIdentity(id);
    return { verified: id.emailVerified, user: u };
  }, [applyIdentity]);

  const register: AuthValue['register'] = useCallback(async (input) => {
    const res = await services.auth.register({ name: input.name, email: input.email, password: input.password });
    // Keep the registration choices locally until the profile is saved, so a transient failure cannot lose the chosen role.
    savePendingProfile({ uid: res.identity.uid, displayName: input.name, phoneNumber: input.phone, role: input.role });
    let profileFailure: string | undefined;
    try {
      await services.remoteProfiles.createForRegistration(res.identity, { displayName: input.name, phoneNumber: input.phone, role: input.role });
      clearPendingProfile();
    } catch (e) { profileFailure = errMsg(e); }
    await applyIdentity(res.identity); // unverified: records the identity; no profile read until verified
    return { verificationEmailSent: res.verificationEmailSent, verificationError: res.verificationError, profileError: profileFailure };
  }, [applyIdentity]);

  const logout = useCallback(async () => {
    await services.auth.logout(); // throws (leaving state untouched) if Firebase sign-out fails
    services.demoAuth.logout();
    seq.current += 1; // invalidate any in-flight profile load
    setDemoUserId(null); setIdentity(null); setProfile(null); setProfileState('idle'); setProfileError(null);
  }, []);

  const sendPasswordReset = useCallback((email: string) => services.auth.sendPasswordReset(email), []);
  const resendVerification = useCallback(() => services.auth.resendVerification(), []);
  const recheckVerification = useCallback(async () => {
    const id = await services.auth.reload();
    if (!id) throw new AuthError('no-user', 'Your session expired. Please log in again.');
    await applyIdentity(id);
    return id.emailVerified;
  }, [applyIdentity]);
  const retryProfile = useCallback(async () => { if (identity?.emailVerified) await applyIdentity(identity); }, [identity, applyIdentity]);

  const loginDemo = useCallback(async (email: string, password: string) => {
    if (!DEMO_MODE) throw new AuthError('unknown', 'development mode is not enabled.');
    if (identity) await services.auth.logout();
    const u = await services.demoAuth.login(email, password);
    setIdentity(null); setProfile(null); setProfileState('idle');
    setDemoUserId(u.id);
    return u;
  }, [identity]);

  const value = useMemo<AuthValue>(() => ({
    status, user, role: user?.role ?? null, identity, profileError, configError: services.auth.configError, demoMode: DEMO_MODE,
    isDemoSession: !identity && !!user, login, register, logout, sendPasswordReset, resendVerification, recheckVerification, retryProfile, loginDemo,
  }), [status, user, identity, profileError, login, register, logout, sendPasswordReset, resendVerification, recheckVerification, retryProfile, loginDemo]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
