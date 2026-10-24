/**
 * Firestore Security Rules tests for users/{uid} (Firebase Emulator + @firebase/rules-unit-testing).
 * All assertions use ORDINARY authenticated/unauthenticated contexts. withSecurityRulesDisabled is used ONLY to seed
 * documents (e.g. an existing profile, or a Console-provisioned admin) and never to assert access.
 * Run: npm run test:rules
 */
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import rules from '../../firestore.rules?raw';

let env: RulesTestEnvironment;

const VERIFIED = (email: string) => ({ email, email_verified: true });
const UNVERIFIED = (email: string) => ({ email, email_verified: false });
const alice = () => env.authenticatedContext('alice', VERIFIED('alice@example.com')).firestore();
const aliceUnverified = () => env.authenticatedContext('alice', UNVERIFIED('alice@example.com')).firestore();
const bob = () => env.authenticatedContext('bob', VERIFIED('bob@example.com')).firestore();
const visitor = () => env.unauthenticatedContext().firestore();

const validCreate = (uid: string, over: Record<string, unknown> = {}) => ({
  uid, displayName: 'Alice Verma', phoneNumber: '+91 98000 10001', role: 'patient', accountStatus: 'active',
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(), schemaVersion: 1, ...over,
});

/** Seed a profile document bypassing rules (setup only). */
async function seed(uid: string, over: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users', uid), {
      uid, displayName: 'Alice Verma', phoneNumber: '+91 98000 10001', role: 'patient', accountStatus: 'active',
      createdAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')), updatedAt: Timestamp.fromDate(new Date('2026-01-01T00:00:00Z')), schemaVersion: 1, ...over,
    });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-rapidrescue', firestore: { rules } });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe('visitors (unauthenticated)', () => {
  it('cannot read a profile', async () => { await seed('alice'); await assertFails(getDoc(doc(visitor(), 'users/alice'))); });
  it('cannot create a profile', async () => { await assertFails(setDoc(doc(visitor(), 'users/alice'), validCreate('alice'))); });
  it('cannot list users', async () => { await assertFails(getDocs(collection(visitor(), 'users'))); });
});

describe('unverified users', () => {
  it('cannot read their own profile', async () => { await seed('alice'); await assertFails(getDoc(doc(aliceUnverified(), 'users/alice'))); });
  it('cannot update their own profile', async () => {
    await seed('alice');
    await assertFails(updateDoc(doc(aliceUnverified(), 'users/alice'), { displayName: 'New Name', updatedAt: serverTimestamp() }));
  });
  it('CAN create their own minimal profile (create-only, decision D4)', async () => {
    await assertSucceeds(setDoc(doc(aliceUnverified(), 'users/alice'), validCreate('alice')));
  });
  it('can create a driver-labelled profile (label only, no privilege)', async () => {
    await assertSucceeds(setDoc(doc(aliceUnverified(), 'users/alice'), validCreate('alice', { role: 'driver' })));
  });
  it('cannot create a profile for another uid', async () => { await assertFails(setDoc(doc(aliceUnverified(), 'users/bob'), validCreate('bob'))); });
});

describe('verified owner', () => {
  it('can read their own profile', async () => { await seed('alice'); await assertSucceeds(getDoc(doc(alice(), 'users/alice'))); });
  it('can create their own profile when missing', async () => { await assertSucceeds(setDoc(doc(alice(), 'users/alice'), validCreate('alice'))); });
  it('can create with an empty phone ("not provided")', async () => { await assertSucceeds(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { phoneNumber: '' }))); });
  it('can update displayName and phoneNumber', async () => {
    await seed('alice');
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { displayName: 'Asha V', phoneNumber: '+91 98000 22222', updatedAt: serverTimestamp() }));
  });
  it('cannot update without a fresh updatedAt', async () => {
    await seed('alice');
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { displayName: 'Asha V' }));
  });
  it('cannot update with a forged updatedAt', async () => {
    await seed('alice');
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { displayName: 'Asha V', updatedAt: Timestamp.fromDate(new Date('2020-01-01')) }));
  });
  it('cannot overwrite an existing profile via set (treated as an update)', async () => {
    await seed('alice');
    await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { role: 'driver' })));
  });
  it('cannot delete their own profile', async () => { await seed('alice'); await assertFails(deleteDoc(doc(alice(), 'users/alice'))); });
  it('cannot list the users collection', async () => { await seed('alice'); await assertFails(getDocs(collection(alice(), 'users'))); });
});

describe('cross-user access', () => {
  it("User B cannot read User A's profile", async () => { await seed('alice'); await assertFails(getDoc(doc(bob(), 'users/alice'))); });
  it("User B cannot update User A's profile", async () => {
    await seed('alice');
    await assertFails(updateDoc(doc(bob(), 'users/alice'), { displayName: 'Hacked', updatedAt: serverTimestamp() }));
  });
  it("User B cannot create a profile at User A's path", async () => { await assertFails(setDoc(doc(bob(), 'users/alice'), validCreate('alice'))); });
  it("User B cannot delete User A's profile", async () => { await seed('alice'); await assertFails(deleteDoc(doc(bob(), 'users/alice'))); });
});

describe('privilege escalation and immutable fields', () => {
  it('cannot create an admin profile', async () => { await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { role: 'admin' }))); });
  it('cannot create with an arbitrary role', async () => { await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { role: 'superuser' }))); });
  it('cannot promote self to admin', async () => {
    await seed('alice');
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { role: 'admin', updatedAt: serverTimestamp() }));
  });
  it('cannot change role patient -> driver after creation (forged driver privilege)', async () => {
    await seed('alice');
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { role: 'driver', updatedAt: serverTimestamp() }));
  });
  it('cannot change uid', async () => { await seed('alice'); await assertFails(updateDoc(doc(alice(), 'users/alice'), { uid: 'bob', updatedAt: serverTimestamp() })); });
  it('cannot change createdAt', async () => {
    await seed('alice');
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  });
  it('cannot change accountStatus (privileged status)', async () => {
    await seed('alice', { accountStatus: 'active' });
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { accountStatus: 'inactive', updatedAt: serverTimestamp() }));
  });
  it('cannot create with a non-active accountStatus', async () => { await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { accountStatus: 'inactive' }))); });
  it('cannot change schemaVersion', async () => { await seed('alice'); await assertFails(updateDoc(doc(alice(), 'users/alice'), { schemaVersion: 2, updatedAt: serverTimestamp() })); });
  it('a deactivated account cannot update itself', async () => {
    await seed('alice', { accountStatus: 'inactive' });
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { displayName: 'Still Me', updatedAt: serverTimestamp() }));
  });
  it('a deactivated account can still read itself (so the app can detect it)', async () => {
    await seed('alice', { accountStatus: 'inactive' });
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
  });
});

describe('malformed and unexpected data', () => {
  it('rejects extra fields on create (mass assignment)', async () => { await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { isAdmin: true }))); });
  it('rejects extra fields on update', async () => { await seed('alice'); await assertFails(updateDoc(doc(alice(), 'users/alice'), { isAdmin: true, updatedAt: serverTimestamp() })); });
  it('rejects a missing required field on create', async () => {
    const d = validCreate('alice') as Record<string, unknown>; delete d.schemaVersion;
    await assertFails(setDoc(doc(alice(), 'users/alice'), d));
  });
  it('rejects uid / document id mismatch', async () => { await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('bob'))); });
  it('rejects wrong types', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { displayName: 12345 })));
    await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { schemaVersion: '1' })));
  });
  it('rejects too-short and too-long names', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { displayName: 'A' })));
    await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { displayName: 'x'.repeat(61) })));
  });
  it('rejects invalid phone numbers', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { phoneNumber: 'call me maybe' })));
    await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { phoneNumber: '1'.repeat(40) })));
  });
  it('rejects a forged createdAt on create', async () => { await assertFails(setDoc(doc(alice(), 'users/alice'), validCreate('alice', { createdAt: Timestamp.fromDate(new Date('2020-01-01')) }))); });
  it('rejects an invalid update value', async () => {
    await seed('alice');
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { displayName: 'A', updatedAt: serverTimestamp() }));
  });
});

describe('admin authority and default deny', () => {
  it('a Console-provisioned admin profile grants NO extra access in Phase 3 (cannot read others)', async () => {
    await seed('boss', { role: 'admin' });  // seeded as the Console would; assertions use an ordinary context
    await seed('alice');
    const boss = env.authenticatedContext('boss', VERIFIED('boss@example.com')).firestore();
    await assertFails(getDoc(doc(boss, 'users/alice')));
    await assertFails(getDocs(collection(boss, 'users')));
    await assertFails(updateDoc(doc(boss, 'users/alice'), { accountStatus: 'inactive', updatedAt: serverTimestamp() }));
  });
  it('an admin can still read only their own profile', async () => {
    await seed('boss', { role: 'admin' });
    const boss = env.authenticatedContext('boss', VERIFIED('boss@example.com')).firestore();
    await assertSucceeds(getDoc(doc(boss, 'users/boss')));
  });
  it('an admin cannot change their own role', async () => {
    await seed('boss', { role: 'admin' });
    const boss = env.authenticatedContext('boss', VERIFIED('boss@example.com')).firestore();
    await assertFails(updateDoc(doc(boss, 'users/boss'), { role: 'patient', updatedAt: serverTimestamp() }));
  });
  it('an email claiming an admin address gains nothing', async () => {
    await seed('alice');
    const fake = env.authenticatedContext('mallory', VERIFIED('admin@rapidrescue.demo')).firestore();
    await assertFails(getDoc(doc(fake, 'users/alice')));
  });
  it('denies unknown collections (read and write) even for verified users', async () => {
    await assertFails(getDoc(doc(alice(), 'bookings/b1')));
    await assertFails(setDoc(doc(alice(), 'bookings/b1'), { patientUid: 'alice' }));
    await assertFails(setDoc(doc(alice(), 'admins/alice'), { role: 'admin' }));
    await assertFails(getDocs(collection(alice(), 'ambulances')));
  });
  it('denies nested paths under users', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/private/secrets'), { a: 1 }));
    await assertFails(getDoc(doc(alice(), 'users/alice/private/secrets')));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Phase 5: driver profiles. Drivers use the same users/{uid} document; there is NO driver-specific data, approval
// state or extra privilege in Firestore. These tests pin that: a driver is an owner like anyone else, nothing more.
// ---------------------------------------------------------------------------------------------------------------
const drv = (uid = 'driver1') => env.authenticatedContext(uid, VERIFIED(`${uid}@example.com`)).firestore();

describe('driver profiles (Phase 5)', () => {
  it('a verified driver can read their own profile', async () => { await seed('driver1', { role: 'driver' }); await assertSucceeds(getDoc(doc(drv(), 'users/driver1'))); });
  it('a driver can update only displayName and phoneNumber', async () => {
    await seed('driver1', { role: 'driver' });
    await assertSucceeds(updateDoc(doc(drv(), 'users/driver1'), { displayName: 'Dana Driver', phoneNumber: '+91 98000 55501', updatedAt: serverTimestamp() }));
  });
  it('a driver cannot change their role (to admin or patient)', async () => {
    await seed('driver1', { role: 'driver' });
    await assertFails(updateDoc(doc(drv(), 'users/driver1'), { role: 'admin', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(drv(), 'users/driver1'), { role: 'patient', updatedAt: serverTimestamp() }));
  });
  it('a driver cannot add approval/availability/ambulance/licence fields (no such schema)', async () => {
    await seed('driver1', { role: 'driver' });
    for (const extra of [{ approvalStatus: 'approved' }, { approved: true }, { availability: 'online' }, { ambulanceId: 'amb-1' }, { licenseNumber: 'X-1' }]) {
      await assertFails(updateDoc(doc(drv(), 'users/driver1'), { ...extra, updatedAt: serverTimestamp() }));
    }
  });
  it('a driver cannot self-reactivate or change accountStatus', async () => {
    await seed('driver1', { role: 'driver' });
    await assertFails(updateDoc(doc(drv(), 'users/driver1'), { accountStatus: 'inactive', updatedAt: serverTimestamp() }));
  });
  it("a driver cannot read or update another driver's profile", async () => {
    await seed('driver1', { role: 'driver' }); await seed('driver2', { role: 'driver' });
    await assertFails(getDoc(doc(drv('driver1'), 'users/driver2')));
    await assertFails(updateDoc(doc(drv('driver1'), 'users/driver2'), { displayName: 'Hijack', updatedAt: serverTimestamp() }));
  });
  it('a driver cannot read a patient profile, and a patient cannot read a driver profile', async () => {
    await seed('driver1', { role: 'driver' }); await seed('alice');
    await assertFails(getDoc(doc(drv('driver1'), 'users/alice')));
    await assertFails(getDoc(doc(alice(), 'users/driver1')));
  });
  it('the driver label grants no extra access (cannot list users or touch other collections)', async () => {
    await seed('driver1', { role: 'driver' });
    await assertFails(getDocs(collection(drv(), 'users')));
    await assertFails(getDoc(doc(drv(), 'bookings/b1')));
    await assertFails(setDoc(doc(drv(), 'ambulances/a1'), { driverUid: 'driver1' }));
  });
  it('a driver cannot delete their profile, and a deactivated driver cannot update it', async () => {
    await seed('driver1', { role: 'driver' });
    await assertFails(deleteDoc(doc(drv(), 'users/driver1')));
    await seed('driver2', { role: 'driver', accountStatus: 'inactive' });
    await assertFails(updateDoc(doc(drv('driver2'), 'users/driver2'), { displayName: 'Still Me', updatedAt: serverTimestamp() }));
  });
  it('an unverified driver can create their (driver-labelled) profile but not read it', async () => {
    const unv = env.authenticatedContext('driver3', UNVERIFIED('driver3@example.com')).firestore();
    await assertSucceeds(setDoc(doc(unv, 'users/driver3'), validCreate('driver3', { role: 'driver' })));
    await assertFails(getDoc(doc(unv, 'users/driver3')));
  });
});
