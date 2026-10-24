/**
 * Builds the administrator's view of people from what Firestore actually holds.
 *
 * Why this exists: `users/{uid}` (written at registration, before email verification) is the only record that is
 * guaranteed to exist for every registered person, and administrators may list it. The older shared collections
 * (`appUsers`, `drivers`, `patientProfiles`) are only written by someone's own device after they sign in with a
 * verified email, or by an administrator. Reading only those collections made a freshly registered driver invisible.
 * This function joins them by Firebase UID so every registered patient and driver appears, with live name, phone
 * and status from the trusted profile.
 */
import type { Booking, Driver, PatientProfile, RemoteProfile, User } from '../types';

export interface AdminSyncInput {
  appUsers: User[];
  profiles: RemoteProfile[];
  drivers: Driver[];
  patientProfiles: PatientProfile[];
  bookings: Booking[];
  /** Emails known from the signed-in administrator's own Firebase Auth session (uid -> email). */
  knownEmails?: Record<string, string>;
}

export interface AdminView { users: User[]; drivers: Driver[]; profiles: PatientProfile[] }

export const syntheticUserId = (uid: string) => `f_${uid}`;
export const syntheticDriverId = (uid: string) => `d_${uid}`;

export function buildAdminView(input: AdminSyncInput): AdminView {
  const { appUsers, profiles, drivers, patientProfiles, bookings } = input;

  // uid -> the local record id other collections already use for this person.
  const localIdByUid = new Map<string, string>();
  for (const u of appUsers) if (u.firebaseUid) localIdByUid.set(u.firebaseUid, u.id);
  for (const d of drivers) if (d.userFirebaseUid && !localIdByUid.has(d.userFirebaseUid)) localIdByUid.set(d.userFirebaseUid, d.userId);
  for (const p of patientProfiles) if (p.userFirebaseUid && !localIdByUid.has(p.userFirebaseUid)) localIdByUid.set(p.userFirebaseUid, p.userId);
  for (const b of bookings) if (b.patientFirebaseUid && !localIdByUid.has(b.patientFirebaseUid)) localIdByUid.set(b.patientFirebaseUid, b.patientId);

  const driverDocByUid = new Map(drivers.filter((d) => d.userFirebaseUid).map((d) => [d.userFirebaseUid as string, d]));
  const patientDocByUid = new Map(patientProfiles.filter((p) => p.userFirebaseUid).map((p) => [p.userFirebaseUid as string, p]));

  const users = new Map<string, User>();
  for (const u of appUsers) users.set(u.id, u);

  for (const p of profiles) {
    const id = localIdByUid.get(p.uid) ?? syntheticUserId(p.uid);
    const existing = users.get(id);
    const contact = driverDocByUid.get(p.uid) ?? patientDocByUid.get(p.uid);
    const email = existing?.email || contact?.contactEmail || (p as { email?: string }).email || input.knownEmails?.[p.uid] || '';
    const stamp = p.updatedAt ?? p.createdAt ?? new Date(0).toISOString();
    users.set(id, {
      id,
      firebaseUid: p.uid,
      name: p.displayName,
      email,
      phone: p.phoneNumber,
      role: p.role,
      status: p.accountStatus,
      createdAt: existing?.createdAt ?? p.createdAt ?? stamp,
      updatedAt: existing?.updatedAt ?? stamp,
    });
  }

  const driversOut = new Map<string, Driver>(drivers.map((d) => [d.id, d]));
  for (const p of profiles) {
    if (p.role !== 'driver') continue;
    const userId = localIdByUid.get(p.uid) ?? syntheticUserId(p.uid);
    const has = [...driversOut.values()].some((d) => d.userFirebaseUid === p.uid || d.userId === userId);
    if (has) continue;
    // Registered, but the driver's own device has not published a record yet (for example the email is not verified).
    const id = syntheticDriverId(p.uid);
    driversOut.set(id, {
      id, userId, userFirebaseUid: p.uid, driverCode: `DRV-${p.uid.slice(0, 6).toUpperCase()}`, licenseNumber: 'DEMO-PENDING',
      ambulanceId: null, availability: 'offline',
      contactName: p.displayName,
      contactPhone: p.phoneNumber,
      contactEmail: input.knownEmails?.[p.uid] || (p as { email?: string }).email || '',
      updatedAt: p.updatedAt ?? p.createdAt ?? new Date(0).toISOString(),
    });
  }

  const profilesOut = new Map<string, PatientProfile>(patientProfiles.map((p) => [p.userId, p]));
  for (const p of profiles) {
    if (p.role !== 'patient') continue;
    const userId = localIdByUid.get(p.uid) ?? syntheticUserId(p.uid);
    if (!profilesOut.has(userId)) profilesOut.set(userId, { userId, userFirebaseUid: p.uid, address: '', emergencyContactName: '', emergencyContactPhone: '' });
  }

  return { users: [...users.values()], drivers: [...driversOut.values()], profiles: [...profilesOut.values()] };
}
