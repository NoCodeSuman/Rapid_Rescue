import { describe, expect, it, vi } from 'vitest';
import { withRemoteProfile, type RemoteProfileDeps } from '../services/profilePersistence';
import { getSessionProfile, publishProfilePatch, setSessionProfile, subscribeProfilePatches } from '../services/profileSession';
import type { UserService } from '../services/contracts';
import type { RemoteProfile } from '../types';

const profile: RemoteProfile = { uid: 'u1', displayName: 'Asha Verma', phoneNumber: '+91 98000 10001', role: 'patient', accountStatus: 'active', schemaVersion: 1, createdAt: null, updatedAt: null };
const calls: string[] = [];
function setup(over: Partial<RemoteProfileDeps> = {}) {
  calls.length = 0;
  const base = {
    updatePatientProfile: vi.fn(async () => { calls.push('local'); return {} as never; }),
    updateOwnContact: vi.fn(async () => { calls.push('local'); return {} as never; }),
    updateUser: vi.fn(), markNotificationsRead: vi.fn(),
  } as unknown as UserService;
  const deps: RemoteProfileDeps = {
    getUid: () => 'u1', getCurrent: () => profile,
    update: vi.fn(async () => { calls.push('remote'); }), publish: vi.fn(() => { calls.push('publish'); }), ...over,
  };
  return { svc: withRemoteProfile(base, deps), base, deps };
}
const form = { name: 'Asha V', phone: '+91 98000 22222', address: 'x', emergencyContactName: '', emergencyContactPhone: '' };

describe('withRemoteProfile', () => {
  it('writes remote first, then publishes, then updates the local copy (strict order)', async () => {
    const { svc, deps } = setup();
    await svc.updatePatientProfile('local-id', form);
    expect(calls).toEqual(['remote', 'publish', 'local']);
    expect(deps.update).toHaveBeenCalledWith('u1', { displayName: 'Asha V', phoneNumber: '+91 98000 22222' });
  });
  it('uses the authenticated UID, never the caller-supplied local id', async () => {
    const { svc, deps } = setup({ getUid: () => 'auth-uid' });
    await svc.updatePatientProfile('some-other-id', form);
    expect((deps.update as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('auth-uid');
  });
  it('sends only the self-editable fields (no address / emergency contact / role)', async () => {
    const { svc, deps } = setup();
    await svc.updatePatientProfile('x', form);
    expect(Object.keys((deps.update as ReturnType<typeof vi.fn>).mock.calls[0][1]).sort()).toEqual(['displayName', 'phoneNumber']);
  });
  it('does not touch Firestore when name and phone are unchanged (only local-only fields edited)', async () => {
    const { svc, deps, base } = setup();
    await svc.updatePatientProfile('x', { ...form, name: 'Asha Verma', phone: '+91 98000 10001', address: 'New address' });
    expect(deps.update).not.toHaveBeenCalled(); expect(deps.publish).not.toHaveBeenCalled(); expect(base.updatePatientProfile).toHaveBeenCalledTimes(1);
  });
  it('a failed remote write blocks the local update and publishes nothing (no false success, no divergence)', async () => {
    const { svc, base, deps } = setup({ update: vi.fn(async () => { throw new Error('permission denied'); }) });
    await expect(svc.updatePatientProfile('x', form)).rejects.toThrow('permission denied');
    expect(base.updatePatientProfile).not.toHaveBeenCalled(); expect(deps.publish).not.toHaveBeenCalled();
  });
  it('is a no-op remotely when there is no Firebase user (developer demo mode)', async () => {
    const { svc, deps, base } = setup({ getUid: () => null });
    await svc.updateOwnContact('x', { name: 'A B', phone: '+91 98000 22222' });
    expect(deps.update).not.toHaveBeenCalled(); expect(base.updateOwnContact).toHaveBeenCalledTimes(1);
  });
  it('writes when there is no known current profile yet', async () => {
    const { svc, deps } = setup({ getCurrent: () => null });
    await svc.updateOwnContact('x', { name: 'A B', phone: '+91 98000 22222' });
    expect(deps.update).toHaveBeenCalledTimes(1);
  });
});

describe('profileSession', () => {
  it('stores and clears the snapshot', () => {
    setSessionProfile(profile); expect(getSessionProfile()?.uid).toBe('u1');
    setSessionProfile(null); expect(getSessionProfile()).toBeNull();
  });
  it('delivers patches to subscribers until unsubscribed', () => {
    const got: string[] = []; const off = subscribeProfilePatches((p) => got.push(p.displayName));
    publishProfilePatch({ uid: 'u1', displayName: 'One', phoneNumber: '' }); off();
    publishProfilePatch({ uid: 'u1', displayName: 'Two', phoneNumber: '' });
    expect(got).toEqual(['One']);
  });
});
