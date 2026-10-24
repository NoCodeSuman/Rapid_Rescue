import type { RemoteProfile } from '../types';

/**
 * Holds the signed-in user's current Firestore profile snapshot (set by AuthContext, cleared on sign-out) and announces
 * confirmed profile edits so every consumer (header, dashboard, profile page) shows the same values.
 * In-memory only: nothing here is persisted.
 */
export interface ProfilePatch { uid: string; displayName: string; phoneNumber: string }

let current: RemoteProfile | null = null;
const listeners = new Set<(p: ProfilePatch) => void>();

export const setSessionProfile = (p: RemoteProfile | null): void => { current = p; };
export const getSessionProfile = (): RemoteProfile | null => current;
export const subscribeProfilePatches = (cb: (p: ProfilePatch) => void): (() => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const publishProfilePatch = (p: ProfilePatch): void => { listeners.forEach((l) => l(p)); };
