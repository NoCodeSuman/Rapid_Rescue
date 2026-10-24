/** Shared Firestore persistence for non-booking application data.
 * Bookings keep their dedicated transaction/rules implementation in firestoreBookings.ts.
 */
import { getFirebaseAuth, getFirebaseDb } from '../lib/firebase';
import { appStore } from './store';
import { buildAdminView } from '../domain/adminSync';
import { isDemoRecordId } from '../data/seed';
import { parseRemoteProfile } from './profileSchema';
import { indexExistingPaymentUtrs } from './firestoreBookings';
import { notify } from '../hooks/useNotify';
import type { AppState, Booking, Driver, Notification, PatientProfile, RemoteProfile, User } from '../types';

const COLLECTIONS = ['appUsers', 'patientProfiles', 'drivers', 'ambulances', 'zones', 'notifications', 'activity'] as const;
type SharedCollection = typeof COLLECTIONS[number];
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([,v]) => v !== undefined).map(([k,v]) => [k, stripUndefined(v)]));
  return value;
}
/** Firestore bookkeeping fields must not leak into the local cache (they are Timestamp objects). */
const BOOKKEEPING = ['firestoreUpdatedAt', 'migratedFromLocalAt', 'updatedBy'];
function cleanDoc(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  for (const k of BOOKKEEPING) delete out[k];
  return out;
}
export const currentFirebaseUid = (): string | null => getFirebaseAuth()?.currentUser?.uid ?? null;

function collectionRows(s: AppState, collection: SharedCollection): Array<{id:string; data: Record<string, unknown>}> {
  const auth = getFirebaseAuth()?.currentUser;
  const byLocalId = new Map(s.users.map(u => [u.id, u]));
  const mine = (userId: string) => (byLocalId.get(userId)?.email.toLowerCase() === auth?.email?.toLowerCase() ? auth?.uid : undefined);
  // Always keep a Firebase uid that is already on the record; only fall back to "this is me" when it is missing.
  switch (collection) {
    case 'appUsers': return s.users.map(u => ({ id: u.id, data: { ...u, firebaseUid: u.firebaseUid ?? mine(u.id) } as unknown as Record<string, unknown> }));
    case 'patientProfiles': return s.profiles.map(p => ({ id: p.userId, data: { ...p, userFirebaseUid: p.userFirebaseUid ?? byLocalId.get(p.userId)?.firebaseUid ?? mine(p.userId) } as unknown as Record<string, unknown> }));
    case 'drivers': return s.drivers.map(d => ({ id: d.id, data: { ...d, userFirebaseUid: d.userFirebaseUid ?? byLocalId.get(d.userId)?.firebaseUid ?? mine(d.userId) } as unknown as Record<string, unknown> }));
    case 'ambulances': return s.ambulances.map(x => ({ id: x.id, data: x as unknown as Record<string, unknown> }));
    case 'zones': return s.zones.map(x => ({ id: x.id, data: x as unknown as Record<string, unknown> }));
    case 'notifications': return s.notifications.map(n => ({ id: n.id, data: { ...n, recipientFirebaseUid: (n as Notification & { recipientFirebaseUid?: string }).recipientFirebaseUid ?? byLocalId.get(n.userId)?.firebaseUid ?? mine(n.userId) } as unknown as Record<string, unknown> }));
    case 'activity': return s.activity.map(x => ({ id: x.id, data: x as unknown as Record<string, unknown> }));
  }
}

/** Persist changed records after a domain operation. Server rules remain the authority; failures are surfaced. */
export async function persistChangedAppData(before: AppState, after: AppState, options: {admin?: boolean} = {}): Promise<void> {
  const auth = getFirebaseAuth()?.currentUser;
  if (!auth) throw new Error('Sign in before saving RapidRescue data to Firebase.');
  const db = await getFirebaseDb();
  if (!db) throw new Error('Firebase Firestore is not configured.');
  const { collection, doc, setDoc, deleteDoc, serverTimestamp } = await import('firebase/firestore');
  const writes: Promise<unknown>[] = [];
  const changedCollections: SharedCollection[] = options.admin ? [...COLLECTIONS] : ['patientProfiles', 'drivers', 'notifications'];
  for (const name of changedCollections) {
    const oldRows = new Map(collectionRows(before, name).map(x => [x.id, x.data]));
    const newRows = new Map(collectionRows(after, name).map(x => [x.id, x.data]));
    for (const [id, data] of newRows) {
      const old = oldRows.get(id);
      if (old && equal(old, data)) continue;
      // Don't allow non-admin users to create/change records belonging to someone else.
      if (!options.admin && name === 'patientProfiles' && data.userFirebaseUid !== auth.uid) continue;
      if (!options.admin && name === 'drivers' && data.userFirebaseUid !== auth.uid) continue;
      if (!options.admin && name === 'notifications' && data.recipientFirebaseUid !== auth.uid) continue;
      writes.push(setDoc(doc(collection(db, name), id), stripUndefined({ ...data, updatedAt: (data.updatedAt as string | undefined) ?? new Date().toISOString(), firestoreUpdatedAt: serverTimestamp() }) as Record<string, unknown>, { merge: true }));
    }
    if (options.admin) for (const id of oldRows.keys()) if (!newRows.has(id)) writes.push(deleteDoc(doc(collection(db, name), id)));
  }
  if (options.admin) {
    const beforeSettings = before.settings as unknown as Record<string, unknown>;
    const afterSettings = after.settings as unknown as Record<string, unknown>;
    if (!equal(beforeSettings, afterSettings)) writes.push(setDoc(doc(db, 'appSettings', 'main'), { ...afterSettings, updatedBy: auth.uid, updatedAt: serverTimestamp() }, { merge: true }));
  }
  await Promise.all(writes);
}

/**
 * Admin start-up housekeeping. The reference demand zones and default settings are created if missing. Records that
 * belong to the built-in demo data set (an earlier version copied them into Firestore) are deleted so the console only
 * ever shows real people, vehicles and bookings. Real records are never touched: only the fixed demo ids match.
 */
async function prepareAdminData(): Promise<void> {
  const auth = getFirebaseAuth()?.currentUser;
  const db = await getFirebaseDb();
  if (!auth || !db) return;
  const { collection, doc, getDocs, setDoc, deleteDoc, serverTimestamp, getDoc } = await import('firebase/firestore');
  for (const name of ['appUsers', 'patientProfiles', 'drivers', 'ambulances', 'activity'] as const) {
    try {
      const snap = await getDocs(collection(db, name));
      await Promise.all(snap.docs.filter((d) => isDemoRecordId(name, d.id)).map((d) => deleteDoc(d.ref)));
    } catch (e) { console.error(`Could not clear demo ${name}:`, (e as { code?: string }).code ?? e); }
  }
  try {
    const state = appStore.getState();
    const zones = await getDocs(collection(db, 'zones'));
    if (zones.empty) await Promise.all(state.zones.map((z) => setDoc(doc(db, 'zones', z.id), stripUndefined({ ...z, firestoreUpdatedAt: serverTimestamp() }) as Record<string, unknown>)));
    const ref = doc(db, 'appSettings', 'main');
    if (!(await getDoc(ref)).exists()) await setDoc(ref, { ...state.settings, updatedBy: auth.uid, updatedAt: serverTimestamp() });
  } catch (e) { console.error('Could not create default zones/settings:', (e as { code?: string }).code ?? e); }
}

/** Admin-only full shared-state subscription (profiles, shared records and every booking). */
export async function subscribeToAdminAppData(): Promise<() => void> {
  const auth = getFirebaseAuth()?.currentUser;
  if (!auth) return () => undefined;
  const db = await getFirebaseDb();
  if (!db) return () => undefined;
  await prepareAdminData(); // never throws; a failure here must not stop the live subscriptions below
  const { collection, doc, onSnapshot } = await import('firebase/firestore');
  const unsubs: Array<() => void> = [];
  const raw = {
    appUsers: [] as User[], drivers: [] as Driver[], patientProfiles: [] as PatientProfile[], profiles: [] as RemoteProfile[],
    bookings: [] as Booking[], ambulances: undefined as AppState['ambulances'] | undefined, zones: undefined as AppState['zones'] | undefined,
    notifications: undefined as AppState['notifications'] | undefined, activity: undefined as AppState['activity'] | undefined,
    settings: undefined as AppState['settings'] | undefined,
  };
  const ready = new Set<string>();
  const apply = () => {
    // Do not replace local state until the people-related collections have reported once, otherwise the signed-in
    // administrator's own record would briefly disappear and the route guard would sign them out.
    if (!['appUsers', 'users', 'drivers', 'patientProfiles'].every((k) => ready.has(k))) return;
    const view = buildAdminView({
      appUsers: raw.appUsers, profiles: raw.profiles, drivers: raw.drivers, patientProfiles: raw.patientProfiles, bookings: raw.bookings,
      knownEmails: auth.email ? { [auth.uid]: auth.email } : {},
    });
    const current = appStore.getState();
    appStore.replaceRemoteData({
      users: view.users, drivers: view.drivers, profiles: view.profiles,
      ambulances: raw.ambulances ?? current.ambulances, zones: raw.zones ?? current.zones,
      notifications: raw.notifications ?? current.notifications, activity: raw.activity ?? current.activity,
      settings: raw.settings ?? current.settings,
      bookings: ready.has('bookings') ? [...raw.bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : current.bookings,
    });
  };
  const listen = <T,>(name: string, target: (rows: T[]) => void, map: (id: string, data: Record<string, unknown>) => T | null) =>
    unsubs.push(onSnapshot(collection(db, name), (snap) => {
      target(snap.docs.filter((d) => !isDemoRecordId(name, d.id)).map((d) => map(d.id, cleanDoc(d.data() as Record<string, unknown>))).filter((x): x is T => x !== null));
      ready.add(name); apply();
    }, (e) => {
      // Never fail silently: without this the admin kept showing stale demo data and nobody could tell why.
      console.error(`Firestore ${name} sync failed`, e.code, e.message);
      notify.error(`Admin data "${name}" could not be loaded (${e.code}). Publish the latest firestore.rules and reload.`);
      ready.add(name); apply();
    }));

  listen<User>('appUsers', (r) => { raw.appUsers = r; }, (id, d) => ({ ...d, id } as unknown as User));
  listen<Driver>('drivers', (r) => { raw.drivers = r; }, (id, d) => ({ ...d, id } as unknown as Driver));
  listen<PatientProfile>('patientProfiles', (r) => { raw.patientProfiles = r; }, (id, d) => ({ ...d, userId: id } as unknown as PatientProfile));
  listen<AppState['ambulances'][number]>('ambulances', (r) => { raw.ambulances = r; }, (id, d) => ({ ...d, id } as unknown as AppState['ambulances'][number]));
  listen<AppState['zones'][number]>('zones', (r) => { raw.zones = r; }, (id, d) => ({ ...d, id } as unknown as AppState['zones'][number]));
  listen<AppState['notifications'][number]>('notifications', (r) => { raw.notifications = r; }, (id, d) => ({ ...d, id } as unknown as AppState['notifications'][number]));
  listen<AppState['activity'][number]>('activity', (r) => { raw.activity = r; }, (id, d) => ({ ...d, id } as unknown as AppState['activity'][number]));
  let indexedPaymentUtrs = false;
  listen<Booking>('bookings', (r) => {
    raw.bookings = r;
    if (!indexedPaymentUtrs) {
      indexedPaymentUtrs = true;
      void indexExistingPaymentUtrs(r).catch((e) => console.error('Could not index existing payment UTRs:', (e as { code?: string }).code ?? e));
    }
  }, (id, d) => ({ ...d, id } as unknown as Booking));
  listen<RemoteProfile>('users', (r) => { raw.profiles = r; }, (id, d) => {
    try {
      return parseRemoteProfile(id, d);
    } catch {
      if (d && typeof d === 'object') {
        const role = d.role === 'admin' || d.role === 'driver' ? d.role : 'patient';
        const status = d.accountStatus === 'inactive' ? 'inactive' : 'active';
        return {
          uid: (d.uid as string) || id,
          displayName: (d.displayName as string) || (d.name as string) || 'RapidRescue User',
          phoneNumber: (d.phoneNumber as string) || (d.phone as string) || '',
          role,
          accountStatus: status,
          schemaVersion: 1,
          createdAt: typeof d.createdAt === 'string' ? d.createdAt : null,
          updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : null,
          email: typeof d.email === 'string' ? d.email : undefined,
        };
      }
      return null;
    }
  });
  unsubs.push(onSnapshot(doc(db, 'appSettings', 'main'), (snap) => {
    if (snap.exists()) {
      const remote = cleanDoc(snap.data() as Record<string, unknown>);
      const current = appStore.getState().settings;
      raw.settings = { ...current, ...remote, upiPaymentAddress: typeof remote.upiPaymentAddress === 'string' ? remote.upiPaymentAddress : '' } as AppState['settings'];
      apply();
    }
  }, (e) => console.error('Firestore settings sync failed', e.code)));
  return () => unsubs.forEach((fn) => fn());
}

/** Admin: write the trusted profile (users/{uid}) so a deactivation or contact edit really takes effect for that person. */
export async function persistProfileForUser(user: User): Promise<void> {
  if (!user.firebaseUid) return; // seeded demo accounts have no Firebase identity
  const db = await getFirebaseDb();
  if (!db) throw new Error('Firebase Firestore is not configured.');
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  await updateDoc(doc(db, 'users', user.firebaseUid), { displayName: user.name, phoneNumber: user.phone, accountStatus: user.status, updatedAt: serverTimestamp() });
}

export async function persistDriverAvailability(driver: Driver, asAdmin = false): Promise<void> {
  const auth = getFirebaseAuth()?.currentUser;
  if (!auth) throw new Error('Sign in before updating driver availability.');
  const db = await getFirebaseDb();
  if (!db) throw new Error('Firebase Firestore is not configured.');
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  // Never stamp an administrator's uid onto someone else's driver record.
  const owner = driver.userFirebaseUid ?? (asAdmin ? undefined : auth.uid);
  await setDoc(doc(db, 'drivers', driver.id), stripUndefined({ ...driver, userFirebaseUid: owner, firestoreUpdatedAt: serverTimestamp() }) as Record<string, unknown>, { merge: true });
}

/** A driver's device reports ambulance availability/location changes caused by its trip actions (rules limit these fields). */
export async function persistAmbulanceChanges(before: AppState, after: AppState): Promise<void> {
  const db = await getFirebaseDb();
  if (!db || !getFirebaseAuth()?.currentUser) return;
  const { doc, updateDoc } = await import('firebase/firestore');
  const old = new Map(before.ambulances.map((a) => [a.id, a]));
  const writes: Promise<unknown>[] = [];
  for (const a of after.ambulances) {
    const was = old.get(a.id);
    if (!was || (was.availability === a.availability && equal(was.location, a.location))) continue;
    writes.push(updateDoc(doc(db, 'ambulances', a.id), { availability: a.availability, location: a.location, updatedAt: a.updatedAt }));
  }
  const results = await Promise.allSettled(writes);
  for (const r of results) if (r.status === 'rejected') console.error('Could not sync ambulance status to Firestore:', r.reason);
}

/** Marks the signed-in person's own notifications read (only the fields the rules allow a recipient to change). */
export async function persistOwnNotifications(notifications: Notification[]): Promise<void> {
  const auth = getFirebaseAuth()?.currentUser;
  if (!auth) throw new Error('Sign in before updating notifications.');
  const db = await getFirebaseDb();
  if (!db) throw new Error('Firebase Firestore is not configured.');
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  await Promise.all(notifications.map(n => updateDoc(doc(db, 'notifications', n.id), { read: true, firestoreUpdatedAt: serverTimestamp() })));
}

// ---------------------------------------------------------------------------------------------------------------
// A signed-in patient/driver publishes their own record and receives what administrators change for them.
// ---------------------------------------------------------------------------------------------------------------

function localUserByEmail(email: string): User | undefined {
  return appStore.getState().users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

/** Merge the Firestore driver record into the local cache (admin assigns the ambulance; the driver's device must see it). */
function adoptRemoteDriver(remote: Driver, email: string): void {
  const state = appStore.getState();
  const user = localUserByEmail(email);
  if (!user) return;
  const merged: Driver = { ...remote, userId: user.id };
  const exists = state.drivers.find((d) => d.userId === user.id || d.id === remote.id);
  if (exists && equal(exists, merged)) return;
  const drivers = exists ? state.drivers.map((d) => (d === exists ? merged : d)) : [...state.drivers, merged];
  appStore.replaceRemoteData({ drivers });
}

/**
 * Starts the realtime links for a verified, active patient or driver:
 *  - publishes their own record (name, email, phone) so the admin console lists them with real details,
 *  - drivers: adopt admin changes to their driver record (ambulance assignment, availability) and see the fleet,
 *  - everyone: receive notifications addressed to their Firebase uid.
 */
export async function subscribeToOwnRecords(identity: { uid: string; email: string }, role: 'patient' | 'driver'): Promise<() => void> {
  const db = await getFirebaseDb();
  if (!db) return () => undefined;
  const { collection, doc, onSnapshot, query, where, setDoc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  const unsubs: Array<() => void> = [];
  const warn = (what: string) => (e: unknown) => console.error(`Could not ${what}:`, (e as { code?: string }).code ?? e);

  // Patients need the admin-configured payment QR and fare rates in the booking confirmation dialog.
  unsubs.push(onSnapshot(doc(db, 'appSettings', 'main'), (snap) => {
    if (!snap.exists()) return;
    const remote = cleanDoc(snap.data() as Record<string, unknown>);
    const current = appStore.getState().settings;
    appStore.replaceRemoteData({ settings: {
      ...current, ...remote,
      upiQrCodeDataUrl: typeof remote.upiQrCodeDataUrl === 'string' ? remote.upiQrCodeDataUrl : null,
      upiPaymentAddress: typeof remote.upiPaymentAddress === 'string' ? remote.upiPaymentAddress : '',
      fareBaseInr: typeof remote.fareBaseInr === 'number' && Number.isFinite(remote.fareBaseInr) ? remote.fareBaseInr : current.fareBaseInr,
      farePerKmInr: typeof remote.farePerKmInr === 'number' && Number.isFinite(remote.farePerKmInr) ? remote.farePerKmInr : current.farePerKmInr,
    } as AppState['settings'] });
  }, (e) => console.error('Firestore public settings sync failed', e.code)));

  if (role === 'patient') {
    const user = localUserByEmail(identity.email);
    if (user) {
      void setDoc(doc(db, 'patientProfiles', user.id), stripUndefined({
        userId: user.id, userFirebaseUid: identity.uid, contactName: user.name, contactEmail: identity.email, contactPhone: user.phone,
        firestoreUpdatedAt: serverTimestamp(),
      }) as Record<string, unknown>, { merge: true }).catch(warn('publish your patient record'));
    }
  } else {
    let creating = false;
    unsubs.push(onSnapshot(query(collection(db, 'drivers'), where('userFirebaseUid', '==', identity.uid)), (snap) => {
      const user = localUserByEmail(identity.email);
      if (!user) return;
      const local = appStore.getState().drivers.find((d) => d.userId === user.id);
      if (snap.empty) {
        if (snap.metadata.fromCache || creating || !local) return;
        creating = true;
        void setDoc(doc(db, 'drivers', local.id), stripUndefined({
          ...local, userId: user.id, userFirebaseUid: identity.uid, contactName: user.name, contactEmail: identity.email, contactPhone: user.phone,
          firestoreUpdatedAt: serverTimestamp(),
        }) as Record<string, unknown>).catch(warn('publish your driver record')).finally(() => { creating = false; });
        return;
      }
      const docs = snap.docs.map((d) => ({ ...cleanDoc(d.data() as Record<string, unknown>), id: d.id }) as unknown as Driver);
      const remote = docs.find((d) => d.id === local?.id) ?? [...docs].sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''))[0];
      adoptRemoteDriver(remote, identity.email);
      if (remote.contactName !== user.name || remote.contactPhone !== user.phone || remote.contactEmail !== identity.email) {
        void updateDoc(doc(db, 'drivers', remote.id), stripUndefined({ contactName: user.name, contactEmail: identity.email, contactPhone: user.phone, firestoreUpdatedAt: serverTimestamp() }) as Record<string, never>)
          .catch(warn('refresh your driver contact details'));
      }
    }, (e) => console.error('Firestore driver record sync failed', e.code)));

    unsubs.push(onSnapshot(collection(db, 'ambulances'), (snap) => {
      appStore.replaceRemoteData({ ambulances: snap.docs.map((d) => ({ ...cleanDoc(d.data() as Record<string, unknown>), id: d.id }) as unknown as AppState['ambulances'][number]) });
    }, (e) => console.error('Firestore ambulance sync failed', e.code)));
  }

  unsubs.push(onSnapshot(query(collection(db, 'notifications'), where('recipientFirebaseUid', '==', identity.uid)), (snap) => {
    const user = localUserByEmail(identity.email);
    if (!user) return;
    const remote = snap.docs.map((d) => ({ ...cleanDoc(d.data() as Record<string, unknown>), id: d.id, userId: user.id }) as unknown as Notification);
    const ids = new Set(remote.map((n) => n.id));
    const kept = appStore.getState().notifications.filter((n) => !ids.has(n.id));
    appStore.replaceRemoteData({ notifications: [...remote, ...kept].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200) });
  }, (e) => console.error('Firestore notification sync failed', e.code)));

  return () => unsubs.forEach((fn) => fn());
}
