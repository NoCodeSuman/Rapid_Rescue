/**
 * TEST-ONLY stand-in for services/firestoreProfiles.ts (aliased in by vite.config.e2e.ts; never part of the app build).
 * Persists "remote" profiles in localStorage key `fake.profiles` so the browser e2e can exercise the real guard/context
 * state machine. It is NOT Firestore: the Firestore SDK and the Security Rules are not exercised by this stand-in.
 * Failure injection via localStorage flags: fake.failProfile = permission|network, fake.failCreate, fake.failUpdate.
 */
import type { ProfileService } from '../src/services/contracts';
import { ProfileError, profileMessage } from '../src/services/profileErrors';
import { buildCreateValues, parseRemoteProfile } from '../src/services/profileSchema';
import type { RemoteProfile } from '../src/types';

const KEY = 'fake.profiles';
const read = (): Record<string, RemoteProfile> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } };
const write = (m: Record<string, RemoteProfile>) => localStorage.setItem(KEY, JSON.stringify(m));
const flag = (k: string) => localStorage.getItem(k);
const wait = () => new Promise((r) => setTimeout(r, 40));

export const firestoreProfileService: ProfileService = {
  async loadOrCreate(identity, hint) {
    await wait();
    const f = flag('fake.failProfile');
    if (f === 'permission') throw new ProfileError('permission-denied', profileMessage('permission-denied'));
    if (f === 'network') throw new ProfileError('network', profileMessage('network'));
    const all = read();
    const existing = all[identity.uid];
    if (existing) return parseRemoteProfile(identity.uid, existing);
    const created: RemoteProfile = { ...buildCreateValues(identity, hint), createdAt: null, updatedAt: null };
    write({ ...all, [identity.uid]: created });
    return created;
  },
  async createForRegistration(identity, hint) {
    await wait();
    if (flag('fake.failCreate')) throw new ProfileError('network', profileMessage('network'));
    const all = read();
    if (all[identity.uid]) throw new ProfileError('permission-denied', profileMessage('permission-denied')); // create-only
    write({ ...all, [identity.uid]: { ...buildCreateValues(identity, hint), createdAt: null, updatedAt: null } });
  },
  async update(uid, patch) {
    await wait();
    if (flag('fake.failUpdate')) throw new ProfileError('permission-denied', profileMessage('permission-denied'));
    const all = read();
    if (!all[uid]) throw new ProfileError('permission-denied', profileMessage('permission-denied'));
    write({ ...all, [uid]: { ...all[uid], displayName: patch.displayName, phoneNumber: patch.phoneNumber } });
    localStorage.setItem('fake.updateCount', String(Number(localStorage.getItem('fake.updateCount') ?? 0) + 1));
  },
};
