import type { AppState, User } from '../types';

/**
 * Finds the LOCAL demo record (a cache) that belongs to a verified Firebase identity, by email.
 * Seeded demo accounts (ids "u-...") are never adoptable by a Firebase identity. The role actually used for
 * authorization comes from the Firestore profile, not from this local record (which is user-editable storage).
 */
export type ProfileResolution = { kind: 'found'; user: User } | { kind: 'create' } | { kind: 'blocked' };

export function resolveLocalProfile(state: AppState, email: string): ProfileResolution {
  const e = email.trim().toLowerCase();
  const match = state.users.find((u) => u.email.toLowerCase() === e);
  if (!match) return { kind: 'create' };
  if (match.id.startsWith('u-')) return { kind: 'blocked' };
  return { kind: 'found', user: match };
}
