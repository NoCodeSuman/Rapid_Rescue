/** Normalised profile-layer errors. Never exposes raw Firestore messages. */
export type ProfileErrorCode = 'permission-denied' | 'network' | 'quota' | 'malformed' | 'not-configured' | 'unknown';

export class ProfileError extends Error {
  readonly code: ProfileErrorCode;
  constructor(code: ProfileErrorCode, message: string) { super(message); this.name = 'ProfileError'; this.code = code; }
}

const MESSAGES: Record<ProfileErrorCode, string> = {
  'permission-denied': "We couldn't access your profile (permission denied). If you just verified your email, wait a moment and retry. Developers: confirm the Firestore rules are deployed.",
  network: "We couldn't reach the profile service. Check your connection and try again.",
  quota: 'The profile service is temporarily over its usage limit. Please try again later.',
  malformed: 'Your profile data is invalid or incomplete. Please contact an administrator.',
  'not-configured': 'Firebase is not configured, so profiles are unavailable. See FIREBASE_AUTH_SETUP.md.',
  unknown: "We couldn't load your profile. Please try again.",
};

export const isPermissionDenied = (e: unknown) => {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === 'string' && (c === 'permission-denied' || c === 'firestore/permission-denied');
};

export function mapFirestoreError(e: unknown): ProfileError {
  if (e instanceof ProfileError) return e;
  const raw = (e as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? raw.replace(/^firestore\//, '') : '';
  switch (code) {
    case 'permission-denied': case 'unauthenticated': return new ProfileError('permission-denied', MESSAGES['permission-denied']);
    case 'unavailable': case 'deadline-exceeded': case 'cancelled': return new ProfileError('network', MESSAGES.network);
    case 'resource-exhausted': return new ProfileError('quota', MESSAGES.quota);
    default:
      if (code) console.warn('[profile] unmapped error code:', code); // code only; never message or data
      return new ProfileError('unknown', MESSAGES.unknown);
  }
}
export const profileMessage = (code: ProfileErrorCode) => MESSAGES[code];
