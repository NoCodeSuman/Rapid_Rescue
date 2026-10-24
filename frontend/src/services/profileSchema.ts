import { z } from 'zod';
import type { AuthIdentity, ProfileHint } from './contracts';
import { ProfileError, profileMessage } from './profileErrors';
import type { RemoteProfile } from '../types';

export const PROFILE_SCHEMA_VERSION = 1;
/** Exact key set written on creation; must match firestore.rules (a unit test checks this). */
export const CREATE_KEYS = ['uid', 'displayName', 'phoneNumber', 'role', 'accountStatus', 'createdAt', 'updatedAt', 'schemaVersion'] as const;

const PHONE_RE = /^\+?[0-9][0-9 ()-]{6,17}$/;

/** Runtime validation of remote data: TypeScript types do not validate what comes back from the network. */
const remoteSchema = z.object({
  uid: z.string().min(1),
  displayName: z.string().min(1).max(100),
  phoneNumber: z.string().max(40),
  role: z.enum(['patient', 'driver', 'admin']),
  accountStatus: z.enum(['active', 'inactive']),
  schemaVersion: z.number().int().min(1),
});

const toIso = (v: unknown): string | null => {
  const f = (v as { toDate?: () => Date } | null)?.toDate;
  if (typeof f !== 'function') return null;
  try { return f.call(v).toISOString(); } catch { return null; }
};

export function parseRemoteProfile(uid: string, data: unknown): RemoteProfile {
  const r = remoteSchema.safeParse(data);
  if (!r.success || r.data.uid !== uid) throw new ProfileError('malformed', profileMessage('malformed'));
  const d = data as Record<string, unknown>;
  return { ...r.data, createdAt: toIso(d.createdAt), updatedAt: toIso(d.updatedAt) };
}

export function sanitizeName(v: string | null | undefined): string {
  const s = (v ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return s.length >= 2 ? s : 'RapidRescue user';
}
export function sanitizePhone(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  return s.length <= 19 && PHONE_RE.test(s) ? s : '';
}

/** Values for a new profile. The role can only ever be patient or driver; anything else becomes patient. */
export function buildCreateValues(identity: AuthIdentity, hint?: ProfileHint) {
  return {
    uid: identity.uid,
    displayName: sanitizeName(hint?.displayName ?? identity.displayName ?? identity.email.split('@')[0]),
    phoneNumber: sanitizePhone(hint?.phoneNumber),
    role: hint?.role === 'driver' ? ('driver' as const) : ('patient' as const),
    accountStatus: 'active' as const,
    schemaVersion: PROFILE_SCHEMA_VERSION,
  };
}
