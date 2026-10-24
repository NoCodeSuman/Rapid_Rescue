/** Composition root: Firebase Authentication, Firestore profiles/bookings, and shared operational data persistence. */
import * as local from './local';
import { firebaseAuthService } from './firebaseAuth';
import { firestoreProfileService } from './firestoreProfiles';
import { withRemoteProfile } from './profilePersistence';
import { isUtrAvailableInFirestore, saveBalancePaymentToFirestore, saveBookingToFirestore, saveDriverLocationToFirestore, saveNewBookingWithUtrClaim } from './firestoreBookings';
import { appStore } from './store';
import { getSessionProfile, publishProfilePatch } from './profileSession';
import { persistAmbulanceChanges, persistChangedAppData, persistDriverAvailability, persistOwnNotifications, persistProfileForUser } from './firestoreAppData';
import { createSeedState } from '../data/seed';
import { resetKeepingRegisteredAccounts } from '../domain/engine';
import { IS_LIVE_DATA } from './store';
import type { AppState } from '../types';
import type { AmbulanceService, AuthService, BookingService, DemoAuthService, DispatchService, DriverService, ProfileService, SettingsService, UserService } from './contracts';

const users: UserService = withRemoteProfile(local.userService, {
  getUid: () => firebaseAuthService.getCurrentUid(),
  getCurrent: getSessionProfile,
  update: (uid, patch) => firestoreProfileService.update(uid, patch),
  publish: publishProfilePatch,
});

const persistBooking = async <T extends import('../types').Booking>(booking: T): Promise<T> => {
  await saveBookingToFirestore(booking);
  return booking;
};

const adminRole = () => getSessionProfile()?.role === 'admin';

/**
 * Runs a local domain operation and then writes what changed to Firestore. If Firestore refuses (rules, network), the
 * local change is rolled back and the error surfaces, so the screen never shows something the database does not hold.
 */
async function guarded<T>(operation: (before: AppState) => Promise<T>): Promise<T> {
  const before = structuredClone(appStore.getState());
  try { return await operation(before); } catch (e) { appStore.restore(before); throw e; }
}
async function withSharedPersistence<T>(operation: () => Promise<T>): Promise<T> {
  return guarded(async (before) => {
    const result = await operation();
    await persistChangedAppData(before, appStore.getState(), { admin: adminRole() });
    return result;
  });
}
const driverUidOf = (driverId: string | null | undefined) => appStore.getState().drivers.find((d) => d.id === driverId)?.userFirebaseUid;

const firebaseBookings: BookingService = {
  isUtrAvailable: (utr) => IS_LIVE_DATA ? isUtrAvailableInFirestore(utr) : local.bookingService.isUtrAvailable(utr),
  create: (uid, input) => guarded(async () => {
    const booking = await local.bookingService.create(uid, input);
    const saved = { ...booking, patientFirebaseUid: firebaseAuthService.getCurrentUid() ?? undefined };
    await saveNewBookingWithUtrClaim(saved);
    return saved;
  }),
  submitBalancePayment: (uid, id, utr) => guarded(async () => {
    const booking = await local.bookingService.submitBalancePayment(uid, id, utr);
    await saveBalancePaymentToFirestore(booking);
    return booking;
  }),
  cancel: (uid, id, reason) => guarded(async (before) => {
    const b = await persistBooking(await local.bookingService.cancel(uid, id, reason));
    if (adminRole()) await persistChangedAppData(before, appStore.getState(), { admin: true });
    return b;
  }),
  driverAccept: (uid, id) => guarded(async (before) => {
    const booking = await local.bookingService.driverAccept(uid, id);
    const b = await persistBooking({ ...booking, driverFirebaseUid: firebaseAuthService.getCurrentUid() ?? undefined });
    await persistAmbulanceChanges(before, appStore.getState());
    return b;
  }),
  driverReject: (uid, id) => guarded(async (before) => {
    const booking = await local.bookingService.driverReject(uid, id);
    // A decline of an assigned request returns it to the queue: the driver link must be cleared in Firestore too.
    const b = await persistBooking({ ...booking, driverFirebaseUid: booking.driverId ? booking.driverFirebaseUid : undefined });
    await persistAmbulanceChanges(before, appStore.getState());
    return b;
  }),
  advanceTrip: (uid, id, to) => guarded(async (before) => {
    const b = await persistBooking(await local.bookingService.advanceTrip(uid, id, to));
    // Trip-step updates do not change the ambulance document; only completion moves/frees the ambulance.
    if (to === 'completed') await persistAmbulanceChanges(before, appStore.getState());
    return b;
  }),
  updateDriverLocation: (uid, id, location) => guarded(async () => {
    await local.bookingService.updateDriverLocation(uid, id, location);
    const booking = appStore.getState().bookings.find((item) => item.id === id);
    if (!booking?.driverLocationUpdatedAt) throw new Error('Could not store the latest driver location.');
    await saveDriverLocationToFirestore(booking, location);
  }),
  // Admin actions write the booking AND the side effects (ambulance, notifications, activity) it caused.
  // The driver's Firebase uid is stored on the booking so the assigned driver's device can read and act on it.
  adminAssign: (uid, id, ambulanceId) => guarded(async (before) => {
    const b = await local.bookingService.adminAssign(uid, id, ambulanceId);
    await persistBooking({ ...b, driverFirebaseUid: driverUidOf(b.driverId) });
    await persistChangedAppData(before, appStore.getState(), { admin: true });
    return b;
  }),
  adminSetStatus: (uid, id, to, reason) => guarded(async (before) => {
    const b = await local.bookingService.adminSetStatus(uid, id, to, reason);
    await persistBooking({ ...b, driverFirebaseUid: b.driverId ? (b.driverFirebaseUid ?? driverUidOf(b.driverId)) : undefined });
    await persistChangedAppData(before, appStore.getState(), { admin: true });
    return b;
  }),
};

export const services: {
  auth: AuthService; demoAuth: DemoAuthService; remoteProfiles: ProfileService; profiles: typeof local.profileService; bookings: BookingService;
  users: UserService; drivers: DriverService; ambulances: AmbulanceService; dispatch: DispatchService; settings: SettingsService;
} = {
  auth: firebaseAuthService, demoAuth: local.demoAuthService, remoteProfiles: firestoreProfileService, profiles: local.profileService, bookings: firebaseBookings,
  users: {
    // An administrator's edit or (de)activation is written to the trusted profile users/{uid} as well, so it really applies to that person.
    async updateUser(...args) { return withSharedPersistence(async () => { const u = await users.updateUser(...args); if (adminRole()) await persistProfileForUser(u); return u; }); },
    async updatePatientProfile(...args) { return withSharedPersistence(() => users.updatePatientProfile(...args)); },
    async updateOwnContact(...args) { return withSharedPersistence(() => users.updateOwnContact(...args)); },
    async markNotificationsRead(...args) { const before = appStore.getState(); await users.markNotificationsRead(...args); const after = appStore.getState(); await persistOwnNotifications(after.notifications.filter(n => n.userId === args[0] && before.notifications.some(b => b.id === n.id && b.read !== n.read))); },
  },
  drivers: {
    async setAvailability(...args) { return withSharedPersistence(async () => { const d = await local.driverService.setAvailability(...args); await persistDriverAvailability(d, adminRole()); return d; }); },
    async assignAmbulance(...args) { return withSharedPersistence(() => local.driverService.assignAmbulance(...args)); },
    async equipAmbulance(...args) { return withSharedPersistence(() => local.driverService.equipAmbulance(...args)); },
    async createDriver(...args) { return withSharedPersistence(() => local.driverService.createDriver(...args)); },
    async verifyDocuments(...args) { return withSharedPersistence(() => local.driverService.verifyDocuments(...args)); },
  },
  ambulances: {
    async create(...args) { return withSharedPersistence(() => local.ambulanceService.create(...args)); },
    async update(...args) { return withSharedPersistence(() => local.ambulanceService.update(...args)); },
    async remove(...args) { return withSharedPersistence(() => local.ambulanceService.remove(...args)); },
  },
  dispatch: local.dispatchService,
  settings: {
    async update(...args) { return withSharedPersistence(() => local.settingsService.update(...args)); },
    // Restores the demo records but keeps every really-registered account, so a reset cannot delete people from Firebase.
    // Live (Firebase) mode has no demo data to reset; this only restores the default display settings.
    async resetDemoData() { if (IS_LIVE_DATA) { return withSharedPersistence(() => local.settingsService.update({ organisationName: 'RapidRescue', defaultPageSize: 10, compactTables: false, toastsEnabled: true, notifyBookingUpdates: true, notifyAssignments: true, upiQrCodeDataUrl: null, upiPaymentAddress: '', fareBaseInr: 300, farePerKmInr: 30 })); } return withSharedPersistence(async () => { appStore.restore(resetKeepingRegisteredAccounts(appStore.getState(), createSeedState())); local.demoAuthService.logout(); }); },
  },
};
export { ServiceError } from './local';
export { appStore } from './store';
export { subscribeToRemoteBookings } from './firestoreBookings';
export { subscribeToAdminAppData, subscribeToOwnRecords } from './firestoreAppData';

// HTTP client for the separate Node.js API (proxied by Vite during development).
export { backendApi } from '../lib/backendApi';
