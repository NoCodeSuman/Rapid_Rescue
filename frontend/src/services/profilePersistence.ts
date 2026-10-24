import type { RemoteProfile } from '../types';
import type { UserService } from './contracts';
import type { ProfilePatch } from './profileSession';

export interface RemoteProfileDeps {
  /** UID of the signed-in Firebase user, or null (e.g. developer demo mode: nothing remote to write). */
  getUid(): string | null;
  /** Last known Firestore profile for the signed-in user. */
  getCurrent(): RemoteProfile | null;
  update(uid: string, patch: { displayName: string; phoneNumber: string }): Promise<void>;
  publish(patch: ProfilePatch): void;
}

/**
 * Wraps the local user service so self-edits of name/phone are persisted to the Firestore profile (the only
 * patient-editable fields in the Phase 3 contract). Remote first: if it fails the error surfaces and the local copy is
 * NOT changed, so they never diverge. Skips the write when nothing remote changed (e.g. only address/emergency contact).
 * The UID always comes from the authenticated user, never from the caller.
 */
export function withRemoteProfile(base: UserService, deps: RemoteProfileDeps): UserService {
  async function persist(p: { name: string; phone: string }): Promise<void> {
    const uid = deps.getUid();
    if (!uid) return;
    const cur = deps.getCurrent();
    if (cur && cur.uid === uid && cur.displayName === p.name && cur.phoneNumber === p.phone) return;
    await deps.update(uid, { displayName: p.name, phoneNumber: p.phone });
    deps.publish({ uid, displayName: p.name, phoneNumber: p.phone }); // only after the write is confirmed
  }
  return {
    ...base,
    async updatePatientProfile(id, patch) { await persist(patch); return base.updatePatientProfile(id, patch); },
    async updateOwnContact(id, patch) { await persist(patch); return base.updateOwnContact(id, patch); },
  };
}
