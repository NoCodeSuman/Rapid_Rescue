import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedState } from '../data/seed';
import { upsertUserFromProfile } from '../domain/engine';
import { CREATE_KEYS, buildCreateValues, parseRemoteProfile, sanitizeName, sanitizePhone } from '../services/profileSchema';
import { ProfileError, mapFirestoreError } from '../services/profileErrors';
import type { AuthIdentity } from '../services/contracts';

const id: AuthIdentity = { uid: 'uid-1', email: 'asha@example.com', emailVerified: true, displayName: 'Asha Verma' };

describe('remote profile validation (runtime, not just types)', () => {
  const good = { uid: 'uid-1', displayName: 'Asha', phoneNumber: '', role: 'patient', accountStatus: 'active', schemaVersion: 1, createdAt: { toDate: () => new Date('2026-01-01T00:00:00Z') } };
  it('parses a valid document and converts timestamps', () => {
    const p = parseRemoteProfile('uid-1', good);
    expect(p.role).toBe('patient');
    expect(p.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(p.updatedAt).toBeNull();
  });
  it('rejects malformed documents', () => {
    for (const bad of [null, 'x', {}, { ...good, role: 'superuser' }, { ...good, uid: 'someone-else' }, { ...good, schemaVersion: '1' }, { ...good, accountStatus: 'banned' }, { ...good, displayName: '' }]) {
      expect(() => parseRemoteProfile('uid-1', bad)).toThrow(ProfileError);
    }
  });
  it('accepts an admin role read from Firestore (set by a privileged write)', () => expect(parseRemoteProfile('uid-1', { ...good, role: 'admin' }).role).toBe('admin'));
});

describe('create values can never carry privilege', () => {
  it('only patient/driver; admin or garbage hints become patient', () => {
    expect(buildCreateValues(id, { role: 'driver' }).role).toBe('driver');
    expect(buildCreateValues(id, { role: 'patient' }).role).toBe('patient');
    expect(buildCreateValues(id, { role: 'admin' as never }).role).toBe('patient');
    expect(buildCreateValues(id, { role: 'x' as never }).role).toBe('patient');
    expect(buildCreateValues(id).role).toBe('patient');
  });
  it('is active, schema v1, no extra keys, uid from identity', () => {
    const v = buildCreateValues(id, { displayName: 'A', phoneNumber: 'nope' });
    expect(v.accountStatus).toBe('active'); expect(v.schemaVersion).toBe(1); expect(v.uid).toBe('uid-1');
    expect(v.displayName).toBe('RapidRescue user'); // too short -> safe default
    expect(v.phoneNumber).toBe('');
  });
  it('sanitisers enforce the same limits as the rules', () => {
    expect(sanitizeName('x'.repeat(100)).length).toBe(60);
    expect(sanitizePhone('+91 98000 10001')).toBe('+91 98000 10001');
    expect(sanitizePhone('1'.repeat(40))).toBe('');
    expect(sanitizePhone('call me')).toBe('');
  });
});

describe('error mapping', () => {
  it('maps Firestore codes and never leaks raw text', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(mapFirestoreError({ code: 'permission-denied', message: 'RAW' }).code).toBe('permission-denied');
    expect(mapFirestoreError({ code: 'unavailable' }).code).toBe('network');
    expect(mapFirestoreError({ code: 'resource-exhausted' }).code).toBe('quota');
    for (const e of [{ code: 'weird', message: 'RAW secret' }, new Error('RAW secret'), null]) expect(mapFirestoreError(e).message).not.toMatch(/RAW|secret/);
  });
});

describe('engine: mirroring a trusted profile into the local cache', () => {
  const s = createSeedState();
  const input = { email: 'Asha@Example.com', name: 'Asha Verma', phone: '+91 98000 10001', role: 'patient' as const, status: 'active' as const };
  it('creates a patient record with a patient profile row', () => {
    const r = upsertUserFromProfile(s, input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.email).toBe('asha@example.com');
    expect(r.state.profiles.some((p) => p.userId === r.value.id)).toBe(true);
  });
  it('creates a driver record for driver profiles and an admin record only from a trusted admin profile', () => {
    const d = upsertUserFromProfile(s, { ...input, email: 'd@example.com', role: 'driver' });
    expect(d.ok && d.state.drivers.some((x) => x.userId === d.value.id)).toBe(true);
    const a = upsertUserFromProfile(s, { ...input, email: 'boss@example.com', role: 'admin' });
    expect(a.ok && a.value.role === 'admin').toBe(true);
  });
  it('updates in place (idempotent) and refreshes role/status from the trusted source', () => {
    const first = upsertUserFromProfile(s, input); if (!first.ok) throw new Error('x');
    const again = upsertUserFromProfile(first.state, input); if (!again.ok) throw new Error('x');
    expect(again.state.users.length).toBe(first.state.users.length);
    const promoted = upsertUserFromProfile(again.state, { ...input, role: 'driver', status: 'inactive' });
    expect(promoted.ok && promoted.value.role === 'driver' && promoted.value.status === 'inactive').toBe(true);
  });
  it('refuses to adopt a seeded demo account', () => {
    expect(upsertUserFromProfile(s, { ...input, email: 'admin@rapidrescue.demo', role: 'admin' }).ok).toBe(false);
    expect(upsertUserFromProfile(s, { ...input, email: 'patient@rapidrescue.demo' }).ok).toBe(false);
  });
});

// ---- firestoreProfileService with the Firebase SDK mocked at the module boundary (does NOT hit Firestore) ----
const m = vi.hoisted(() => ({
  getDoc: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(), runTransaction: vi.fn(), txGet: vi.fn(), txSet: vi.fn(), getIdToken: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ path: p.join('/') }),
  getDoc: m.getDoc, setDoc: m.setDoc, updateDoc: m.updateDoc, serverTimestamp: () => '__SERVER_TS__',
  runTransaction: m.runTransaction,
}));
vi.mock('../lib/firebase', () => ({
  firebaseConfigError: null,
  getFirebaseDb: async () => ({ fake: 'db' }),
  getFirebaseAuth: () => ({ currentUser: { getIdToken: m.getIdToken } }),
}));

describe('firestoreProfileService (SDK mocked)', () => {
  beforeEach(() => {
    Object.values(m).forEach((f) => f.mockReset());
    m.runTransaction.mockImplementation(async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({ get: m.txGet, set: m.txSet }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  const stored = { uid: 'uid-1', displayName: 'Asha', phoneNumber: '', role: 'driver', accountStatus: 'active', schemaVersion: 1 };

  it('returns an existing profile without writing anything', async () => {
    const { firestoreProfileService: svc } = await import('../services/firestoreProfiles');
    m.getDoc.mockResolvedValue({ exists: () => true, data: () => stored });
    const p = await svc.loadOrCreate(id, { role: 'patient' });
    expect(p.role).toBe('driver');
    expect(m.runTransaction).not.toHaveBeenCalled(); expect(m.setDoc).not.toHaveBeenCalled();
  });
  it('creates a default patient profile when missing, with exactly the allowed keys', async () => {
    const { firestoreProfileService: svc } = await import('../services/firestoreProfiles');
    m.getDoc.mockResolvedValue({ exists: () => false });
    m.txGet.mockResolvedValue({ exists: () => false });
    const p = await svc.loadOrCreate(id);
    expect(p.role).toBe('patient');
    const [ref, payload] = m.txSet.mock.calls[0];
    expect(ref.path).toBe('users/uid-1');
    expect(Object.keys(payload).sort()).toEqual([...CREATE_KEYS].sort());
    expect(payload.createdAt).toBe('__SERVER_TS__'); expect(payload.accountStatus).toBe('active');
  });
  it('never overwrites when another tab created it first (transaction re-check)', async () => {
    const { firestoreProfileService: svc } = await import('../services/firestoreProfiles');
    m.getDoc.mockResolvedValue({ exists: () => false });
    m.txGet.mockResolvedValue({ exists: () => true, data: () => stored });
    const p = await svc.loadOrCreate(id);
    expect(p.role).toBe('driver'); expect(m.txSet).not.toHaveBeenCalled();
  });
  it('on permission-denied refreshes the ID token once and retries', async () => {
    const { firestoreProfileService: svc } = await import('../services/firestoreProfiles');
    m.getDoc.mockRejectedValueOnce({ code: 'permission-denied' }).mockResolvedValueOnce({ exists: () => true, data: () => stored });
    m.getIdToken.mockResolvedValue('t');
    const p = await svc.loadOrCreate(id);
    expect(p.uid).toBe('uid-1'); expect(m.getIdToken).toHaveBeenCalledWith(true); expect(m.getDoc).toHaveBeenCalledTimes(2);
  });
  it('gives up after one retry with a friendly permission error', async () => {
    const { firestoreProfileService: svc } = await import('../services/firestoreProfiles');
    m.getDoc.mockRejectedValue({ code: 'permission-denied', message: 'RAW' });
    m.getIdToken.mockResolvedValue('t');
    await expect(svc.loadOrCreate(id)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(m.getDoc).toHaveBeenCalledTimes(2);
  });
  it('reports malformed remote data and offline errors accurately', async () => {
    const { firestoreProfileService: svc } = await import('../services/firestoreProfiles');
    m.getDoc.mockResolvedValue({ exists: () => true, data: () => ({ role: 'god' }) });
    await expect(svc.loadOrCreate(id)).rejects.toMatchObject({ code: 'malformed' });
    m.getDoc.mockReset(); m.getDoc.mockRejectedValue({ code: 'unavailable' });
    await expect(svc.loadOrCreate(id)).rejects.toMatchObject({ code: 'network' });
  });
  it('registration is create-only: uses setDoc and never reads', async () => {
    const { firestoreProfileService: svc } = await import('../services/firestoreProfiles');
    m.setDoc.mockResolvedValue(undefined);
    await svc.createForRegistration({ ...id, emailVerified: false }, { displayName: 'Dina Driver', phoneNumber: '+91 98000 55501', role: 'driver' });
    expect(m.getDoc).not.toHaveBeenCalled(); expect(m.runTransaction).not.toHaveBeenCalled();
    const [, payload] = m.setDoc.mock.calls[0];
    expect(payload.role).toBe('driver'); expect(Object.keys(payload).sort()).toEqual([...CREATE_KEYS].sort());
  });
  it('update sends only self-editable fields plus updatedAt', async () => {
    const { firestoreProfileService: svc } = await import('../services/firestoreProfiles');
    m.updateDoc.mockResolvedValue(undefined);
    await svc.update('uid-1', { displayName: 'New Name', phoneNumber: '+91 98000 22222' });
    expect(Object.keys(m.updateDoc.mock.calls[0][1]).sort()).toEqual(['displayName', 'phoneNumber', 'updatedAt']);
  });
});
