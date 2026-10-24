import { readEnvelope, removeKey, writeEnvelope } from './storage';

/** Registration choices kept locally ONLY until the Firestore profile is saved. Contains no password or token. */
export interface PendingProfile { uid: string; displayName: string; phoneNumber: string; role: 'patient' | 'driver' }
const KEY = 'rr.pendingProfile';

export function savePendingProfile(p: PendingProfile): void { writeEnvelope(KEY, 1, p); }
export function readPendingProfile(uid: string): PendingProfile | null {
  const p = readEnvelope<PendingProfile>(KEY, 1);
  if (!p || p.uid !== uid || typeof p.displayName !== 'string' || typeof p.phoneNumber !== 'string') return null;
  return { ...p, role: p.role === 'driver' ? 'driver' : 'patient' };
}
export function clearPendingProfile(): void { removeKey(KEY); }
