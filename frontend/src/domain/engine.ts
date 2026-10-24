/**
 * Pure domain operations over AppState. Every function validates relationships and status transitions and
 * returns a new state (never mutates). The service layer applies them atomically to the store.
 */
import { newId } from '../lib/ids';
import { simulateEta, ineligibleReasons, driverHasActiveBooking, ambulanceHasActiveBooking } from './dispatch';
import { ACTIVE_STATUSES, DRIVER_TRIP_ACTIONS, STATUS_META, TRANSITIONS, canCancel, canTransition, isOpen, typeSatisfies } from './status';
import type {
  Ambulance, AmbulanceType, AppState, Booking, BookingPayment, BookingStatus, Driver, EmergencyType, LocationPoint, OperationalStatus, Result, User, UserRole,
} from '../types';
import { DEMO_PICKUPS, ROUTE_PROFILES } from '../data/places';
import { isValidUtr } from './payment';

let clock = () => new Date().toISOString();
/** Test hook: lets unit tests make timestamps deterministic. */
export const setClock = (fn: () => string) => { clock = fn; };

const ok = <T>(state: AppState, value: T): Result<T> => ({ ok: true, state, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

const userOf = (s: AppState, id: string | null | undefined) => s.users.find((u) => u.id === id);
const driverOfUser = (s: AppState, userId: string): Driver | undefined => {
  const d = s.drivers.find((x) => x.userId === userId);
  if (d) return d;
  const u = s.users.find((x) => x.id === userId);
  if (u?.firebaseUid) return s.drivers.find((x) => x.userFirebaseUid === u.firebaseUid);
  return undefined;
};

function withActivity(s: AppState, actorId: string | null, message: string, bookingId?: string): AppState {
  return { ...s, activity: [{ id: newId('act'), at: clock(), actorId, message, bookingId }, ...s.activity].slice(0, 200) };
}

function withNotice(s: AppState, userId: string | null | undefined, message: string, kind: 'booking' | 'assignment'): AppState {
  if (!userId) return s;
  if (kind === 'booking' && !s.settings.notifyBookingUpdates) return s;
  if (kind === 'assignment' && !s.settings.notifyAssignments) return s;
  return { ...s, notifications: [{ id: newId('ntf'), userId, message, createdAt: clock(), read: false }, ...s.notifications].slice(0, 200) };
}

const patchBooking = (s: AppState, id: string, fn: (b: Booking) => Booking): AppState => ({ ...s, bookings: s.bookings.map((b) => (b.id === id ? fn(b) : b)) });
const patchAmbulance = (s: AppState, id: string, fn: (a: Ambulance) => Ambulance): AppState => ({ ...s, ambulances: s.ambulances.map((a) => (a.id === id ? fn(a) : a)) });
const patchDriver = (s: AppState, id: string, fn: (d: Driver) => Driver): AppState => ({ ...s, drivers: s.drivers.map((d) => (d.id === id ? fn(d) : d)) });

/** Frees an ambulance that was busy: back to available when its driver is online, else offline. */
function releaseAmbulance(s: AppState, ambulanceId: string | null): AppState {
  if (!ambulanceId) return s;
  const amb = s.ambulances.find((a) => a.id === ambulanceId);
  if (!amb || amb.availability !== 'busy') return s;
  const drv = s.drivers.find((d) => d.id === amb.driverId);
  const next = amb.operationalStatus === 'in_service' && drv?.availability === 'online' ? 'available' : 'offline';
  return patchAmbulance(s, ambulanceId, (a) => ({ ...a, availability: next, updatedAt: clock() }));
}

interface MoveOpts { note?: string; driverId?: string | null; ambulanceId?: string | null; eta?: Booking['eta']; clearAssignment?: boolean }

/** Applies a (pre-validated) status change plus its driver/ambulance side effects. */
function moveBooking(s: AppState, bookingId: string, to: BookingStatus, actorUserId: string | null, opts: MoveOpts = {}): AppState {
  const before = s.bookings.find((b) => b.id === bookingId)!;
  let next = s;
  const now = clock();
  const oldAmb = before.ambulanceId;

  if (opts.clearAssignment) {
    if (ACTIVE_STATUSES.includes(before.status)) next = releaseAmbulance(next, oldAmb);
  } else if (opts.ambulanceId && opts.ambulanceId !== oldAmb) {
    if (ACTIVE_STATUSES.includes(before.status)) next = releaseAmbulance(next, oldAmb);
  }
  if (opts.ambulanceId) next = patchAmbulance(next, opts.ambulanceId, (a) => ({ ...a, availability: 'busy', updatedAt: now }));
  if (to === 'completed' || to === 'cancelled' || to === 'rejected') {
    if (ACTIVE_STATUSES.includes(before.status)) next = releaseAmbulance(next, before.ambulanceId);
  }
  if (to === 'completed' && before.ambulanceId) {
    // Simulated: the ambulance ends the trip at the destination hospital.
    next = patchAmbulance(next, before.ambulanceId, (a) => ({ ...a, location: { ...before.destination }, updatedAt: now }));
  }

  next = patchBooking(next, bookingId, (b) => ({
    ...b,
    status: to,
    updatedAt: now,
    driverId: opts.clearAssignment ? null : opts.driverId !== undefined ? opts.driverId : b.driverId,
    ambulanceId: opts.clearAssignment ? null : opts.ambulanceId !== undefined ? opts.ambulanceId : b.ambulanceId,
    eta: opts.clearAssignment ? null : opts.eta !== undefined ? opts.eta : b.eta,
    reason: to === 'cancelled' || to === 'rejected' ? opts.note ?? b.reason : b.reason,
    history: [...b.history, { status: to, at: now, byUserId: actorUserId, note: opts.note }],
  }));
  return next;
}

// ---------- Bookings ----------

export interface BookingInput {
  contactName: string; contactPhone: string; pickup: LocationPoint; destination: LocationPoint;
  emergencyType: EmergencyType; notes: string; ambulanceType: AmbulanceType; payment?: BookingPayment;
}

export function createBooking(s: AppState, patientUserId: string, input: BookingInput): Result<Booking> {
  const user = userOf(s, patientUserId);
  if (!user || user.role !== 'patient') return fail('Only patient accounts can create bookings.');
  if (user.status !== 'active') return fail('This account is deactivated and cannot create bookings.');
  const open = s.bookings.find((b) => b.patientId === patientUserId && isOpen(b.status));
  if (open) return fail(`You already have an open demo booking (${open.ref}). Complete or cancel it before creating another.`);
  const now = clock();
  const seq = s.counters.booking + 1;
  const booking: Booking = {
    id: newId('bk'), ref: `RR-${new Date(now).getFullYear()}-${String(seq).padStart(4, '0')}`,
    patientId: patientUserId, ...input, status: 'requested', createdAt: now, updatedAt: now,
    driverId: null, ambulanceId: null, eta: null, declinedByDriverIds: [],
    history: [{ status: 'requested', at: now, byUserId: patientUserId }],
  };
  let next: AppState = { ...s, bookings: [booking, ...s.bookings], counters: { booking: seq } };
  next = withActivity(next, patientUserId, `${user.name} created demo booking ${booking.ref}.`, booking.id);
  return ok(next, booking);
}

export function cancelBooking(s: AppState, actorUserId: string, bookingId: string, reason?: string): Result<Booking> {
  const b = s.bookings.find((x) => x.id === bookingId);
  if (!b) return fail('Booking not found.');
  const actor = userOf(s, actorUserId);
  if (!actor) return fail('Unknown user.');
  if (actor.role === 'patient' && b.patientId !== actor.id) return fail('You can only cancel your own bookings.');
  if (actor.role === 'driver') return fail('Drivers cannot cancel bookings. Decline the request instead.');
  if (!canCancel(b.status)) return fail(`A ${STATUS_META[b.status].label.toLowerCase()} booking cannot be cancelled.`);
  const note = reason?.trim() || (actor.role === 'admin' ? 'Cancelled by admin (demo)' : 'Cancelled by patient (demo)');
  let next = moveBooking(s, bookingId, 'cancelled', actorUserId, { note });
  next = withActivity(next, actorUserId, `${actor.name} cancelled ${b.ref}.`, b.id);
  if (b.driverId) next = withNotice(next, driverUserId(s, b.driverId), `${b.ref} was cancelled.`, 'assignment');
  if (actor.role === 'admin') next = withNotice(next, b.patientId, `Your demo booking ${b.ref} was cancelled by an administrator.`, 'booking');
  return ok(next, next.bookings.find((x) => x.id === bookingId)!);
}

/** Records the patient's 70% balance UTR after the driver completes the trip. */
export function submitBalancePayment(s: AppState, patientUserId: string, bookingId: string, utr: string): Result<Booking> {
  const booking = s.bookings.find((x) => x.id === bookingId);
  if (!booking) return fail('Booking not found.');
  if (booking.patientId !== patientUserId) return fail('You can only submit payment for your own booking.');
  if (booking.status !== 'completed') return fail('The balance can only be paid after the trip is completed.');
  if (!booking.payment) return fail('Payment details are not available for this booking.');
  if (booking.payment.balanceUtr) return fail('The balance payment has already been submitted.');
  if (!isValidUtr(utr)) return fail('Enter a valid 16-digit UTR number.');
  if (utr === booking.payment.upfrontUtr) return fail('Invalid UTR number. The balance UTR must differ from the booking UTR.');
  const payment: BookingPayment = { ...booking.payment, balanceUtr: utr, balanceSubmittedAt: clock() };
  const next = patchBooking(s, bookingId, (b) => ({ ...b, payment }));
  return ok(next, next.bookings.find((x) => x.id === bookingId)!);
}

const driverUserId = (s: AppState, driverId: string) => s.drivers.find((d) => d.id === driverId)?.userId;

export function driverAccept(s: AppState, driverUserIdArg: string, bookingId: string): Result<Booking> {
  const driver = driverOfUser(s, driverUserIdArg);
  if (!driver) return fail('Driver profile not found.');
  const b = s.bookings.find((x) => x.id === bookingId);
  if (!b) return fail('Booking not found.');
  if (b.status !== 'requested' && b.status !== 'assigned') return fail(`This request is no longer available (status: ${STATUS_META[b.status].label}).`);
  if (b.status === 'assigned' && b.driverId !== driver.id) return fail('This booking is assigned to another driver.');
  if (driver.availability !== 'online') return fail('Go online before accepting requests.');
  const amb = s.ambulances.find((a) => a.id === driver.ambulanceId);
  if (!amb) return fail('You have no ambulance assigned. Contact an administrator.');
  if (amb.operationalStatus !== 'in_service') return fail('Your ambulance is not in service.');
  if (driverHasActiveBooking(s, driver.id, b.id) || ambulanceHasActiveBooking(s, amb.id, b.id)) return fail('You already have an active trip. Finish it before accepting another.');
  if (b.status === 'requested') {
    if (b.declinedByDriverIds.includes(driver.id)) return fail('You declined this request earlier.');
    if (!typeSatisfies(amb.type, b.ambulanceType)) return fail('Your ambulance type does not meet the requested type.');
    if (amb.availability !== 'available') return fail('Your ambulance is not available.');
  }
  const eta = simulateEta(amb, b.pickup, clock());
  let next = moveBooking(s, bookingId, 'accepted', driverUserIdArg, { driverId: driver.id, ambulanceId: amb.id, eta });
  const du = userOf(s, driverUserIdArg)!;
  next = withActivity(next, driverUserIdArg, `${du.name} accepted ${b.ref} with ${amb.registration}.`, b.id);
  next = withNotice(next, b.patientId, `Your ambulance request ${b.ref} was accepted. ${amb.registration} is heading to your pickup. Estimated arrival: ${eta.minutes} min. Track its simulated progress on Track ambulance.`, 'booking');
  return ok(next, next.bookings.find((x) => x.id === bookingId)!);
}

/** Decline keeps the booking available for other drivers; if it was assigned to this driver it returns to the queue. */
export function driverReject(s: AppState, driverUserIdArg: string, bookingId: string): Result<Booking> {
  const driver = driverOfUser(s, driverUserIdArg);
  if (!driver) return fail('Driver profile not found.');
  const b = s.bookings.find((x) => x.id === bookingId);
  if (!b) return fail('Booking not found.');
  if (b.status !== 'requested' && b.status !== 'assigned') return fail('This request can no longer be declined.');
  if (b.status === 'assigned' && b.driverId !== driver.id) return fail('This booking is assigned to another driver.');
  if (b.declinedByDriverIds.includes(driver.id)) return fail('You already declined this request.');
  let next = patchBooking(s, bookingId, (x) => ({ ...x, declinedByDriverIds: [...x.declinedByDriverIds, driver.id], updatedAt: clock() }));
  if (b.status === 'assigned') next = moveBooking(next, bookingId, 'requested', driverUserIdArg, { clearAssignment: true, note: 'Declined by assigned driver' });
  const du = userOf(s, driverUserIdArg)!;
  next = withActivity(next, driverUserIdArg, `${du.name} declined ${b.ref}; it stays available for other drivers.`, b.id);
  return ok(next, next.bookings.find((x) => x.id === bookingId)!);
}

export function advanceTrip(s: AppState, driverUserIdArg: string, bookingId: string, to: BookingStatus): Result<Booking> {
  const driver = driverOfUser(s, driverUserIdArg);
  if (!driver) return fail('Driver profile not found.');
  const b = s.bookings.find((x) => x.id === bookingId);
  if (!b) return fail('Booking not found.');
  if (b.driverId !== driver.id) return fail('This trip is not assigned to you.');
  const action = DRIVER_TRIP_ACTIONS[b.status];
  if (!action || action.to !== to || !canTransition(b.status, to)) return fail(`That step is not valid while the trip is "${STATUS_META[b.status].label}".`);
  let next = moveBooking(s, bookingId, to, driverUserIdArg);
  const du = userOf(s, driverUserIdArg)!;
  next = withActivity(next, driverUserIdArg, `${du.name} updated ${b.ref}: ${STATUS_META[to].label}.`, b.id);
  next = withNotice(next, b.patientId, `Demo booking ${b.ref} is now "${STATUS_META[to].label}" (simulated).`, 'booking');
  return ok(next, next.bookings.find((x) => x.id === bookingId)!);
}

/** Stores a driver's latest device GPS point while travelling to the patient's pickup. */
export function updateDriverLocation(s: AppState, driverUserIdArg: string, bookingId: string, location: LocationPoint): Result<Booking> {
  const driver = driverOfUser(s, driverUserIdArg);
  if (!driver) return fail('Driver profile not found.');
  const booking = s.bookings.find((x) => x.id === bookingId);
  if (!booking) return fail('Booking not found.');
  if (booking.driverId !== driver.id) return fail('This trip is not assigned to you.');
  if (booking.status !== 'on_the_way') return fail('Live location is only shared while travelling to pickup.');
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) return fail('Invalid GPS coordinates.');
  const at = clock();
  const next = patchBooking(s, bookingId, (b) => ({
    ...b,
    driverLocationPrevious: b.driverLocation,
    driverLocationPreviousAt: b.driverLocationUpdatedAt,
    driverLocation: location,
    driverLocationUpdatedAt: at,
  }));
  return ok(next, next.bookings.find((x) => x.id === bookingId)!);
}

export function adminAssign(s: AppState, adminUserId: string, bookingId: string, ambulanceId: string): Result<Booking> {
  const b = s.bookings.find((x) => x.id === bookingId);
  if (!b) return fail('Booking not found.');
  if (!(['requested', 'assigned', 'accepted'] as BookingStatus[]).includes(b.status)) return fail(`A ${STATUS_META[b.status].label.toLowerCase()} booking cannot be (re)assigned.`);
  const amb = s.ambulances.find((a) => a.id === ambulanceId);
  if (!amb) return fail('Ambulance not found.');
  const reasons = ineligibleReasons(s, b, amb);
  if (reasons.length) return fail(`${amb.registration} is not eligible: ${reasons.join('; ')}.`);
  const eta = simulateEta(amb, b.pickup, clock());
  let next = moveBooking(s, bookingId, 'assigned', adminUserId, { driverId: amb.driverId, ambulanceId: amb.id, eta, note: b.ambulanceId ? 'Reassigned by admin (demo)' : 'Assigned by admin (demo)' });
  next = withActivity(next, adminUserId, `${userOf(s, adminUserId)?.name ?? 'Admin'} assigned ${b.ref} to ${amb.registration}.`, b.id);
  next = withNotice(next, driverUserId(s, amb.driverId!), `New assignment: ${b.ref}. Review it under Assigned Requests.`, 'assignment');
  next = withNotice(next, b.patientId, `Demo booking ${b.ref} was assigned to an ambulance. Simulated ETA: ${eta.minutes} min.`, 'booking');
  return ok(next, next.bookings.find((x) => x.id === bookingId)!);
}

/** Valid admin status actions. Assignment has its own action; accepting needs an assigned driver. */
export function adminNextStatuses(b: Booking): BookingStatus[] {
  return TRANSITIONS[b.status].filter((t) => t !== 'assigned' && t !== 'requested' && (b.driverId || t !== 'accepted'));
}

export function adminSetStatus(s: AppState, adminUserId: string, bookingId: string, to: BookingStatus, reason?: string): Result<Booking> {
  const b = s.bookings.find((x) => x.id === bookingId);
  if (!b) return fail('Booking not found.');
  if (to === 'cancelled') return cancelBooking(s, adminUserId, bookingId, reason);
  if (!adminNextStatuses(b).includes(to)) return fail(`Cannot change ${STATUS_META[b.status].label} to ${STATUS_META[to].label}.`);
  const note = to === 'rejected' ? reason?.trim() || 'Rejected by admin (demo)' : undefined;
  let next = moveBooking(s, bookingId, to, adminUserId, { note });
  next = withActivity(next, adminUserId, `${userOf(s, adminUserId)?.name ?? 'Admin'} set ${b.ref} to ${STATUS_META[to].label}.`, b.id);
  next = withNotice(next, b.patientId, `Demo booking ${b.ref} is now "${STATUS_META[to].label}".`, 'booking');
  return ok(next, next.bookings.find((x) => x.id === bookingId)!);
}

// ---------- Drivers & ambulances ----------

export function setDriverAvailability(s: AppState, actorUserId: string, driverId: string, availability: 'online' | 'offline'): Result<Driver> {
  const d = s.drivers.find((x) => x.id === driverId);
  if (!d) return fail('Driver not found.');
  const actor = userOf(s, actorUserId);
  if (actor?.role === 'driver' && actor.id !== d.userId) return fail('You can only change your own availability.');
  if (d.availability === availability) return ok(s, d);
  if (userOf(s, d.userId)?.status === 'inactive' && availability === 'online') return fail('Deactivated drivers cannot go online.');
  if (availability === 'offline' && driverHasActiveBooking(s, d.id)) return fail('Finish the active trip before going offline.');
  let next = patchDriver(s, d.id, (x) => ({ ...x, availability, updatedAt: clock() }));
  const amb = s.ambulances.find((a) => a.id === d.ambulanceId);
  if (amb && amb.availability !== 'busy') {
    const target = availability === 'online' && amb.operationalStatus === 'in_service' ? 'available' : 'offline';
    next = patchAmbulance(next, amb.id, (a) => ({ ...a, availability: target, updatedAt: clock() }));
  }
  next = withActivity(next, actorUserId, `${userOf(s, d.userId)?.name} is now ${availability}.`);
  return ok(next, next.drivers.find((x) => x.id === d.id)!);
}

export function assignAmbulanceToDriver(s: AppState, actorUserId: string, driverId: string, ambulanceId: string | null): Result<Driver> {
  const d = s.drivers.find((x) => x.id === driverId) || s.drivers.find((x) => x.userId === driverId);
  if (!d) return fail('Driver not found.');
  if (driverHasActiveBooking(s, d.id)) return fail('This driver has an active trip; ambulance cannot be changed now.');
  if (ambulanceId) {
    const amb = s.ambulances.find((a) => a.id === ambulanceId);
    if (!amb) return fail('Ambulance not found.');
    if (amb.driverId && amb.driverId !== d.id) return fail(`${amb.registration} is already assigned to another driver.`);
    if (ambulanceHasActiveBooking(s, amb.id)) return fail('That ambulance has an active booking.');
  }
  let next = s;
  if (d.ambulanceId && d.ambulanceId !== ambulanceId) next = patchAmbulance(next, d.ambulanceId, (a) => ({ ...a, driverId: null, availability: 'offline', updatedAt: clock() }));
  next = patchDriver(next, d.id, (x) => ({ ...x, ambulanceId, updatedAt: clock() }));
  if (ambulanceId) {
    const online = d.availability === 'online';
    next = patchAmbulance(next, ambulanceId, (a) => ({ ...a, driverId: d.id, availability: online && a.operationalStatus === 'in_service' ? 'available' : 'offline', updatedAt: clock() }));
  }
  next = withActivity(next, actorUserId, `Ambulance assignment changed for ${userOf(s, d.userId)?.name ?? 'driver'}.`);
  return ok(next, next.drivers.find((x) => x.id === d.id)!);
}

export function equipAmbulance(s: AppState, actorUserId: string, driverId: string, ambulanceId?: string | null): Result<Driver> {
  let next = s;
  let d = next.drivers.find((x) => x.id === driverId || x.userId === driverId);
  if (!d) {
    const u = userOf(next, actorUserId);
    if (!u) return fail('User profile not found.');
    const newDrvId = u.firebaseUid ? `d_${u.firebaseUid}` : newId('d');
    d = {
      id: newDrvId,
      userId: u.id,
      userFirebaseUid: u.firebaseUid,
      driverCode: u.firebaseUid ? `DRV-${u.firebaseUid.slice(0, 6).toUpperCase()}` : 'DRV-001',
      licenseNumber: 'DL-ACTIVE',
      ambulanceId: null,
      availability: 'online',
      contactName: u.name,
      contactPhone: u.phone,
      contactEmail: u.email,
      updatedAt: clock(),
    };
    next = { ...next, drivers: [...next.drivers, d] };
  }

  // Ensure starter ambulances exist if no fleet is present in state
  if (next.ambulances.length === 0) {
    const starterAmbs: Ambulance[] = [
      { id: 'amb-1', registration: 'RR-AMB-01', type: 'basic', operationalStatus: 'in_service', availability: 'available', driverId: null, location: DEMO_PICKUPS[0], routeProfile: ROUTE_PROFILES.congested, updatedAt: clock() },
      { id: 'amb-2', registration: 'RR-AMB-02', type: 'advanced', operationalStatus: 'in_service', availability: 'available', driverId: null, location: DEMO_PICKUPS[1], routeProfile: ROUTE_PROFILES.arterial, updatedAt: clock() },
      { id: 'amb-3', registration: 'RR-AMB-03', type: 'icu', operationalStatus: 'in_service', availability: 'available', driverId: null, location: DEMO_PICKUPS[2], routeProfile: ROUTE_PROFILES.moderate, updatedAt: clock() },
    ];
    next = { ...next, ambulances: starterAmbs };
  }

  const pickId = ambulanceId
    || next.ambulances.find((a) => (!a.driverId || a.driverId === d!.id) && a.operationalStatus === 'in_service')?.id
    || next.ambulances[0]?.id;

  if (!pickId) return fail('No ambulance available to equip.');

  // If driver had a different ambulance, clear it
  if (d.ambulanceId && d.ambulanceId !== pickId) {
    next = patchAmbulance(next, d.ambulanceId, (a) => ({ ...a, driverId: null, availability: 'offline', updatedAt: clock() }));
  }

  next = patchDriver(next, d.id, (x) => ({ ...x, ambulanceId: pickId, availability: 'online', updatedAt: clock() }));
  next = patchAmbulance(next, pickId, (a) => ({ ...a, driverId: d!.id, availability: 'available', updatedAt: clock() }));
  next = withActivity(next, actorUserId, `Driver equipped ambulance ${next.ambulances.find((a) => a.id === pickId)?.registration ?? pickId} for shift.`);
  return ok(next, next.drivers.find((x) => x.id === d!.id)!);
}

export function createDriver(s: AppState, actorUserId: string, input: {
  name: string; email: string; phone: string; driverCode?: string; licenseNumber?: string;
  ambulanceId?: string | null; availability?: 'online' | 'offline';
}): Result<Driver> {
  const actor = userOf(s, actorUserId);
  if (actor?.role !== 'admin') return fail('Only administrators can add drivers.');
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const phone = input.phone.trim();
  if (!name || name.length < 2) return fail('A valid name (at least 2 characters) is required.');
  if (!email || !email.includes('@')) return fail('A valid email address is required.');
  if (!phone) return fail('Phone number is required.');

  const now = clock();
  let next = s;
  let user = s.users.find((u) => u.email.toLowerCase() === email);

  if (user) {
    const existingDriver = next.drivers.find((d) => d.userId === user!.id);
    if (existingDriver) return fail('A driver with this email already exists.');
    user = { ...user, role: 'driver', name, phone, status: 'active', updatedAt: now };
    next = { ...next, users: next.users.map((u) => (u.id === user!.id ? user! : u)) };
  } else {
    const userId = newId('u');
    user = { id: userId, name, email, phone, role: 'driver', status: 'active', createdAt: now, updatedAt: now };
    next = { ...next, users: [...next.users, user] };
  }

  const n = next.drivers.length + 1;
  const driverCode = input.driverCode?.trim() || `DRV-${String(n).padStart(3, '0')}`;
  const driverId = newId('d');
  const availability = input.availability || 'offline';
  const driver: Driver = {
    id: driverId,
    userId: user.id,
    driverCode,
    licenseNumber: input.licenseNumber?.trim() || 'DL-PENDING',
    ambulanceId: input.ambulanceId || null,
    availability,
    contactName: user.name,
    contactEmail: user.email,
    contactPhone: user.phone,
    updatedAt: now,
  };
  next = { ...next, drivers: [...next.drivers, driver] };

  if (input.ambulanceId) {
    const amb = next.ambulances.find((a) => a.id === input.ambulanceId);
    if (amb) {
      next = patchAmbulance(next, amb.id, (a) => ({
        ...a,
        driverId: driver.id,
        availability: availability === 'online' && a.operationalStatus === 'in_service' ? 'available' : 'offline',
        updatedAt: now,
      }));
    }
  }

  next = withActivity(next, actorUserId, `Added driver ${user.name} (${driver.driverCode}).`);
  return ok(next, driver);
}

export interface DriverDocumentInput {
  governmentIdNumber?: string;
  governmentIdType?: string;
  licenseNumber?: string;
  licenseExpiry?: string;
  vehicleRegistrationNumber?: string;
  documentsVerified?: boolean;
  documentNotes?: string;
}

export function verifyDriverDocuments(s: AppState, adminUserId: string, driverId: string, input: DriverDocumentInput): Result<Driver> {
  const actor = userOf(s, adminUserId);
  if (actor?.role !== 'admin') return fail('Only administrators can verify driver documents.');
  const d = s.drivers.find((x) => x.id === driverId);
  if (!d) return fail('Driver not found.');
  const now = clock();
  const updated: Driver = {
    ...d,
    ...(input.governmentIdNumber !== undefined && { governmentIdNumber: input.governmentIdNumber }),
    ...(input.governmentIdType !== undefined && { governmentIdType: input.governmentIdType }),
    ...(input.licenseNumber !== undefined && { licenseNumber: input.licenseNumber }),
    ...(input.licenseExpiry !== undefined && { licenseExpiry: input.licenseExpiry }),
    ...(input.vehicleRegistrationNumber !== undefined && { vehicleRegistrationNumber: input.vehicleRegistrationNumber }),
    ...(input.documentNotes !== undefined && { documentNotes: input.documentNotes }),
    ...(input.documentsVerified !== undefined && {
      documentsVerified: input.documentsVerified,
      documentsVerifiedAt: input.documentsVerified ? now : undefined,
      documentsVerifiedBy: input.documentsVerified ? adminUserId : undefined,
    }),
    updatedAt: now,
  };
  let next: AppState = { ...s, drivers: s.drivers.map((x) => (x.id === driverId ? updated : x)) };
  const verifyMsg = input.documentsVerified
    ? `Admin verified documents for ${userOf(s, d.userId)?.name ?? d.contactName ?? 'driver'}.`
    : `Admin updated documents for ${userOf(s, d.userId)?.name ?? d.contactName ?? 'driver'}.`;
  next = withActivity(next, adminUserId, verifyMsg);
  return ok(next, updated);
}

export interface AmbulanceInput {
  registration: string; type: AmbulanceType; operationalStatus: OperationalStatus; availability: 'available' | 'offline';
  driverId: string | null; location: LocationPoint; routeProfileKey: string;
}

function validateAmbulance(s: AppState, input: AmbulanceInput, selfId?: string): string | null {
  const reg = input.registration.trim().toUpperCase();
  if (!reg) return 'Registration is required.';
  if (s.ambulances.some((a) => a.id !== selfId && a.registration.toUpperCase() === reg)) return `Registration ${reg} already exists.`;
  if (!ROUTE_PROFILES[input.routeProfileKey]) return 'Unknown route profile.';
  if (input.driverId) {
    const d = s.drivers.find((x) => x.id === input.driverId);
    if (!d) return 'Selected driver not found.';
    if (d.ambulanceId && d.ambulanceId !== selfId) return 'That driver already has an ambulance.';
  }
  return null;
}

export function createAmbulance(s: AppState, actorUserId: string, input: AmbulanceInput): Result<Ambulance> {
  const err = validateAmbulance(s, input);
  if (err) return fail(err);
  const drv = s.drivers.find((d) => d.id === input.driverId);
  const amb: Ambulance = {
    id: newId('amb'), registration: input.registration.trim().toUpperCase(), type: input.type, operationalStatus: input.operationalStatus,
    availability: input.operationalStatus === 'in_service' && input.availability === 'available' && drv?.availability === 'online' ? 'available' : 'offline',
    driverId: input.driverId, location: input.location, routeProfile: ROUTE_PROFILES[input.routeProfileKey], updatedAt: clock(),
  };
  let next: AppState = { ...s, ambulances: [...s.ambulances, amb] };
  if (input.driverId) next = patchDriver(next, input.driverId, (d) => ({ ...d, ambulanceId: amb.id, updatedAt: clock() }));
  next = withActivity(next, actorUserId, `Ambulance ${amb.registration} added.`);
  return ok(next, amb);
}

export function updateAmbulance(s: AppState, actorUserId: string, id: string, input: AmbulanceInput): Result<Ambulance> {
  const amb = s.ambulances.find((a) => a.id === id);
  if (!amb) return fail('Ambulance not found.');
  const err = validateAmbulance(s, input, id);
  if (err) return fail(err);
  const hasActive = ambulanceHasActiveBooking(s, id);
  if (hasActive && (input.type !== amb.type || input.operationalStatus !== amb.operationalStatus || input.driverId !== amb.driverId))
    return fail('This ambulance has an active booking; type, status and driver cannot change until it ends.');
  let next = s;
  if (input.driverId !== amb.driverId) {
    if (amb.driverId) next = patchDriver(next, amb.driverId, (d) => ({ ...d, ambulanceId: null, updatedAt: clock() }));
    if (input.driverId) next = patchDriver(next, input.driverId, (d) => ({ ...d, ambulanceId: id, updatedAt: clock() }));
  }
  const drv = next.drivers.find((d) => d.id === input.driverId);
  const availability = hasActive ? 'busy'
    : input.operationalStatus === 'in_service' && input.availability === 'available' && drv ? 'available' : 'offline';
  next = patchAmbulance(next, id, (a) => ({
    ...a, registration: input.registration.trim().toUpperCase(), type: input.type, operationalStatus: input.operationalStatus,
    availability, driverId: input.driverId, location: input.location, routeProfile: ROUTE_PROFILES[input.routeProfileKey], updatedAt: clock(),
  }));
  next = withActivity(next, actorUserId, `Ambulance ${input.registration.trim().toUpperCase()} updated.`);
  return ok(next, next.ambulances.find((a) => a.id === id)!);
}

export function deleteAmbulance(s: AppState, actorUserId: string, id: string): Result<null> {
  const amb = s.ambulances.find((a) => a.id === id);
  if (!amb) return fail('Ambulance not found.');
  if (ambulanceHasActiveBooking(s, id)) return fail('This ambulance has an active booking and cannot be deleted.');
  let next: AppState = { ...s, ambulances: s.ambulances.filter((a) => a.id !== id) };
  if (amb.driverId) next = patchDriver(next, amb.driverId, (d) => ({ ...d, ambulanceId: null, updatedAt: clock() }));
  // Historical bookings keep the id; displays show "Removed ambulance" for dangling references.
  next = withActivity(next, actorUserId, `Ambulance ${amb.registration} deleted.`);
  return ok(next, null);
}

// ---------- Users ----------

export function updateUser(s: AppState, actorUserId: string, userId: string, patch: { name: string; phone: string; status?: 'active' | 'inactive' }): Result<User> {
  const u = userOf(s, userId);
  if (!u) return fail('User not found.');
  const status = patch.status ?? u.status;
  if (status !== u.status && status === 'inactive') {
    if (u.role === 'admin') return fail('The demo administrator account cannot be deactivated.');
    if (u.id === actorUserId) return fail('You cannot deactivate your own account.');
    if (u.role === 'patient' && s.bookings.some((b) => b.patientId === u.id && isOpen(b.status))) return fail('This patient has an open booking; cancel it first.');
    const drv = driverOfUser(s, u.id);
    if (drv && driverHasActiveBooking(s, drv.id)) return fail('This driver has an active trip.');
  }
  let next: AppState = { ...s, users: s.users.map((x) => (x.id === userId ? { ...x, name: patch.name.trim(), phone: patch.phone.trim(), status, updatedAt: clock() } : x)) };
  const drv = driverOfUser(next, userId);
  if (drv && status === 'inactive' && drv.availability === 'online') {
    const r = setDriverAvailability(next, actorUserId, drv.id, 'offline');
    if (r.ok) next = r.state;
  }
  next = withActivity(next, actorUserId, `User ${patch.name.trim()} updated${status !== u.status ? ` (${status})` : ''}.`);
  return ok(next, next.users.find((x) => x.id === userId)!);
}

export function updatePatientProfile(s: AppState, userId: string, patch: { name: string; phone: string; address: string; emergencyContactName: string; emergencyContactPhone: string }): Result<User> {
  const u = userOf(s, userId);
  if (!u || u.role !== 'patient') return fail('Patient not found.');
  const profile = { userId, address: patch.address.trim(), emergencyContactName: patch.emergencyContactName.trim(), emergencyContactPhone: patch.emergencyContactPhone.trim() };
  const next: AppState = {
    ...s,
    users: s.users.map((x) => (x.id === userId ? { ...x, name: patch.name.trim(), phone: patch.phone.trim(), updatedAt: clock() } : x)),
    profiles: s.profiles.some((p) => p.userId === userId) ? s.profiles.map((p) => (p.userId === userId ? profile : p)) : [...s.profiles, profile],
  };
  return ok(next, next.users.find((x) => x.id === userId)!);
}

export function updateOwnContact(s: AppState, userId: string, patch: { name: string; phone: string }): Result<User> {
  const u = userOf(s, userId);
  if (!u) return fail('User not found.');
  const next: AppState = { ...s, users: s.users.map((x) => (x.id === userId ? { ...x, name: patch.name.trim(), phone: patch.phone.trim(), updatedAt: clock() } : x)) };
  return ok(next, next.users.find((x) => x.id === userId)!);
}

export function registerUser(s: AppState, input: { name: string; email: string; phone: string; role: 'patient' | 'driver' }): Result<User> {
  if (input.role !== 'patient' && input.role !== 'driver') return fail('Only Patient and Driver accounts can be registered publicly.');
  if (s.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) return fail('An account with this email already exists.');
  const now = clock();
  const user: User = { id: newId('u'), name: input.name.trim(), email: input.email.trim().toLowerCase(), phone: input.phone.trim(), role: input.role, status: 'active', createdAt: now, updatedAt: now };
  let next: AppState = { ...s, users: [...s.users, user] };
  if (input.role === 'patient') next = { ...next, profiles: [...next.profiles, { userId: user.id, address: '', emergencyContactName: '', emergencyContactPhone: '' }] };
  else {
    const n = next.drivers.length + 1;
    next = { ...next, drivers: [...next.drivers, { id: newId('d'), userId: user.id, driverCode: `DRV-${String(n).padStart(3, '0')}`, licenseNumber: 'DEMO-PENDING', ambulanceId: null, availability: 'offline', updatedAt: now }] };
  }
  next = withActivity(next, user.id, `${user.name} registered a demo ${input.role} account.`);
  return ok(next, user);
}

/**
 * "Reset demo data" for a Firebase-backed deployment: restores the seeded demo records but KEEPS everyone who really
 * registered (users, their driver/patient records and their bookings), so a reset can never delete real accounts.
 * Ambulances created by an administrator are demo inventory and are reset; real drivers lose a dangling ambulance link.
 */
export function resetKeepingRegisteredAccounts(current: AppState, seed: AppState): AppState {
  const real = (u: User) => !!u.firebaseUid;
  const realUsers = current.users.filter(real);
  const realIds = new Set(realUsers.map((u) => u.id));
  const seedAmbulanceIds = new Set(seed.ambulances.map((a) => a.id));
  const seedDriverIds = new Set(seed.drivers.map((d) => d.id));
  const realDrivers = current.drivers
    .filter((d) => realIds.has(d.userId) && !seedDriverIds.has(d.id))
    .map((d) => (d.ambulanceId && !seedAmbulanceIds.has(d.ambulanceId) ? { ...d, ambulanceId: null } : d));
  return {
    ...seed,
    users: [...seed.users, ...realUsers],
    profiles: [...seed.profiles, ...current.profiles.filter((p) => realIds.has(p.userId))],
    drivers: [...seed.drivers, ...realDrivers],
    bookings: current.bookings.filter((b) => !!b.patientFirebaseUid),
    counters: { booking: Math.max(seed.counters.booking, current.counters.booking) },
  };
}

export function updateSettings(s: AppState, patch: Partial<AppState['settings']>): Result<AppState['settings']> {
  const next = { ...s, settings: { ...s.settings, ...patch } };
  return ok(next, next.settings);
}

export function markNotificationsRead(s: AppState, userId: string): Result<null> {
  return ok({ ...s, notifications: s.notifications.map((n) => (n.userId === userId ? { ...n, read: true } : n)) }, null);
}

/**
 * Mirrors a trusted Firestore profile into the LOCAL demo store so the (still local) booking/dispatch demo keeps working.
 * The local record is only a cache of name/phone/role: authorization at runtime uses the Firestore values.
 * Seeded demo accounts (ids "u-...") can never be adopted by a Firebase identity.
 */
export function upsertUserFromProfile(s: AppState, input: { email: string; name: string; phone: string; role: UserRole; status: User['status']; firebaseUid?: string }): Result<User> {
  const email = input.email.trim().toLowerCase();
  const existing = s.users.find((u) => u.email.toLowerCase() === email);
  if (existing && existing.id.startsWith('u-')) return fail('Reserved demo account.');
  const now = clock();
  let next = s;
  let user: User;
  if (existing) {
    const uid = input.firebaseUid ?? existing.firebaseUid;
    const changed = existing.name !== input.name || existing.phone !== input.phone || existing.role !== input.role || existing.status !== input.status || existing.firebaseUid !== uid;
    user = changed ? { ...existing, name: input.name, phone: input.phone, role: input.role, status: input.status, firebaseUid: uid, updatedAt: now } : existing;
    if (changed) next = { ...next, users: next.users.map((u) => (u.id === existing.id ? user : u)) };
  } else {
    // Deterministic ids for Firebase accounts: the same person gets the same record id on every device, so the admin
    // console and the driver's own device agree on who is who.
    const id = input.firebaseUid ? `f_${input.firebaseUid}` : newId('u');
    user = { id, ...(input.firebaseUid ? { firebaseUid: input.firebaseUid } : {}), name: input.name, email, phone: input.phone, role: input.role, status: input.status, createdAt: now, updatedAt: now };
    next = { ...next, users: [...next.users, user] };
  }
  if (input.role === 'patient' && !next.profiles.some((p) => p.userId === user.id)) {
    next = { ...next, profiles: [...next.profiles, { userId: user.id, ...(user.firebaseUid ? { userFirebaseUid: user.firebaseUid } : {}), address: '', emergencyContactName: '', emergencyContactPhone: '' }] };
  }
  if (input.role === 'driver') {
    const have = next.drivers.find((d) => d.userId === user.id);
    if (!have) {
      const n = next.drivers.length + 1;
      next = { ...next, drivers: [...next.drivers, {
        id: user.firebaseUid ? `d_${user.firebaseUid}` : newId('d'), userId: user.id, ...(user.firebaseUid ? { userFirebaseUid: user.firebaseUid } : {}),
        driverCode: user.firebaseUid ? `DRV-${user.firebaseUid.slice(0, 6).toUpperCase()}` : `DRV-${String(n).padStart(3, '0')}`,
        licenseNumber: 'DEMO-PENDING', ambulanceId: null, availability: 'offline', updatedAt: now }] };
    } else if (user.firebaseUid && have.userFirebaseUid !== user.firebaseUid) {
      next = { ...next, drivers: next.drivers.map((d) => (d.id === have.id ? { ...d, userFirebaseUid: user.firebaseUid } : d)) };
    }
  }
  return ok(next, user);
}
