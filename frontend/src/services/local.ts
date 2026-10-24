/** Local/mock implementations of the service contracts (typed, async, validated in the domain layer). */
import * as engine from '../domain/engine';
import { verifyDriverDocuments } from '../domain/engine';
import { recommendDispatch } from '../domain/dispatch';
import { appStore } from './store';
import { DEMO_PASSWORD } from '../data/seed';
import { readEnvelope, writeEnvelope, removeKey } from '../lib/storage';
import type { Result } from '../types';
import type { AmbulanceService, AuthIdentity, BookingService, DemoAuthService, DispatchService, DriverService, SettingsService, UserService } from './contracts';
import { resolveLocalProfile } from '../domain/profileResolution';
import { isValidUtr } from '../domain/payment';
import type { RemoteProfile, User } from '../types';

export class ServiceError extends Error {}

const LATENCY_MS = 180;
const delay = () => new Promise<void>((r) => setTimeout(r, LATENCY_MS));

async function run<T>(op: (s: import('../types').AppState) => Result<T>): Promise<T> {
  await delay();
  const r = appStore.apply(op);
  if (!r.ok) throw new ServiceError(r.error);
  return r.value;
}

// ---- Developer-only demo auth (NOT Firebase; only reachable when DEMO_MODE is on in `vite dev`) ----
const SESSION_KEY = 'rr.session';
const LEGACY_CRED_KEY = 'rr.credentials';
// Phase 1 stored registered users' demo passwords here. Remove any leftovers; passwords are never stored now.
removeKey(LEGACY_CRED_KEY);

export const demoAuthService: DemoAuthService = {
  getSessionUserId() {
    const id = readEnvelope<string>(SESSION_KEY, 1);
    return typeof id === 'string' ? id : null;
  },
  async login(email, password) {
    await delay();
    const user = appStore.getState().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    // Only the seeded accounts (ids start "u-") are demo-loginable; locally created profiles have no demo password.
    if (!user || !user.id.startsWith('u-') || password !== DEMO_PASSWORD) throw new ServiceError('Incorrect email or password.');
    if (user.status !== 'active') throw new ServiceError('This demo account is deactivated. Ask an administrator to reactivate it.');
    writeEnvelope(SESSION_KEY, 1, user.id);
    return user;
  },
  logout() { removeKey(SESSION_KEY); },
};

/**
 * Bridge from the trusted Firestore profile to the local demo store (a cache that keeps the local booking/dispatch demo working).
 * Role/status used for authorization come from Firestore at runtime; this local record is never authoritative.
 */
export const profileService = {
  syncFromRemote(identity: AuthIdentity, p: RemoteProfile): { kind: 'ready'; user: User } | { kind: 'blocked' } {
    if (resolveLocalProfile(appStore.getState(), identity.email).kind === 'blocked') return { kind: 'blocked' };
    const r = appStore.apply((s) => engine.upsertUserFromProfile(s, { email: identity.email, name: p.displayName, phone: p.phoneNumber, role: p.role, status: p.accountStatus, firebaseUid: identity.uid }));
    if (!r.ok) return { kind: 'blocked' };
    return { kind: 'ready', user: r.value };
  },
  /** Name/phone from an existing local record (e.g. an account created in Phase 2) to seed a missing remote profile. Never role. */
  localHint(identity: AuthIdentity): { displayName?: string; phoneNumber?: string } | undefined {
    const res = resolveLocalProfile(appStore.getState(), identity.email);
    return res.kind === 'found' ? { displayName: res.user.name, phoneNumber: res.user.phone } : undefined;
  },
};

export const bookingService: BookingService = {
  async isUtrAvailable(utr) {
    await delay();
    if (!isValidUtr(utr)) return false;
    return !appStore.getState().bookings.some((b) => b.payment?.upfrontUtr === utr || b.payment?.balanceUtr === utr);
  },
  create: (uid, input) => run((s) => engine.createBooking(s, uid, input)),
  submitBalancePayment: (uid, id, utr) => run((s) => engine.submitBalancePayment(s, uid, id, utr)),
  cancel: (uid, id, reason) => run((s) => engine.cancelBooking(s, uid, id, reason)),
  driverAccept: (uid, id) => run((s) => engine.driverAccept(s, uid, id)),
  driverReject: (uid, id) => run((s) => engine.driverReject(s, uid, id)),
  advanceTrip: (uid, id, to) => run((s) => engine.advanceTrip(s, uid, id, to)),
  updateDriverLocation: async (uid, id, location) => { await run((s) => engine.updateDriverLocation(s, uid, id, location)); },
  adminAssign: (uid, id, amb) => run((s) => engine.adminAssign(s, uid, id, amb)),
  adminSetStatus: (uid, id, to, reason) => run((s) => engine.adminSetStatus(s, uid, id, to, reason)),
};

export const userService: UserService = {
  updateUser: (a, id, p) => run((s) => engine.updateUser(s, a, id, p)),
  updatePatientProfile: (id, p) => run((s) => engine.updatePatientProfile(s, id, p)),
  updateOwnContact: (id, p) => run((s) => engine.updateOwnContact(s, id, p)),
  async markNotificationsRead(id) { appStore.apply((s) => engine.markNotificationsRead(s, id)); },
};

export const driverService: DriverService = {
  setAvailability: (a, id, av) => run((s) => engine.setDriverAvailability(s, a, id, av)),
  assignAmbulance: (a, id, amb) => run((s) => engine.assignAmbulanceToDriver(s, a, id, amb)),
  equipAmbulance: (a, id, amb) => run((s) => engine.equipAmbulance(s, a, id, amb)),
  createDriver: (a, input) => run((s) => engine.createDriver(s, a, input)),
  verifyDocuments: (adminId, driverId, input) => run((s) => verifyDriverDocuments(s, adminId, driverId, input)),
};

export const ambulanceService: AmbulanceService = {
  create: (a, input) => run((s) => engine.createAmbulance(s, a, input)),
  update: (a, id, input) => run((s) => engine.updateAmbulance(s, a, id, input)),
  async remove(a, id) { await run((s) => engine.deleteAmbulance(s, a, id)); },
};

export const dispatchService: DispatchService = {
  recommend(bookingId) {
    const s = appStore.getState();
    const b = s.bookings.find((x) => x.id === bookingId);
    if (!b) throw new ServiceError('Booking not found.');
    return recommendDispatch(s, b);
  },
};

export const settingsService: SettingsService = {
  async update(patch) { await run((s) => engine.updateSettings(s, patch)); },
  async resetDemoData() {
    await delay();
    appStore.reset();
    removeKey(SESSION_KEY);
  },
};
