import { dayKey } from '../utils/format';
import type { AppState, Booking, BookingStatus, Driver, User } from '../types';
import { ACTIVE_STATUSES, BOOKING_STATUSES, STATUS_META, isActive, isOpen } from './status';

export const userById = (s: AppState, id: string | null | undefined): User | undefined => s.users.find((u) => u.id === id);
export const driverById = (s: AppState, id: string | null | undefined): Driver | undefined => s.drivers.find((d) => d.id === id);
export const ambulanceById = (s: AppState, id: string | null | undefined) => s.ambulances.find((a) => a.id === id);
export const driverByUserId = (s: AppState, userId: string): Driver | undefined => {
  const byUser = s.drivers.find((d) => d.userId === userId);
  if (byUser) return byUser;
  const user = s.users.find((u) => u.id === userId);
  if (user?.firebaseUid) {
    const byUid = s.drivers.find((d) => d.userFirebaseUid === user.firebaseUid);
    if (byUid) return byUid;
  }
  if (user?.role === 'driver') {
    return {
      id: user.firebaseUid ? `d_${user.firebaseUid}` : `d_${userId}`,
      userId: user.id,
      userFirebaseUid: user.firebaseUid,
      driverCode: user.firebaseUid ? `DRV-${user.firebaseUid.slice(0, 6).toUpperCase()}` : 'DRV-NEW',
      licenseNumber: 'DEMO-PENDING',
      ambulanceId: null,
      availability: 'offline',
      contactName: user.name,
      contactEmail: user.email,
      contactPhone: user.phone,
      updatedAt: user.updatedAt,
    };
  }
  return undefined;
};
export const driverName = (s: AppState, driverId: string | null | undefined) => {
  const d = driverById(s, driverId);
  return d ? userById(s, d.userId)?.name ?? 'Unknown driver' : null;
};
export const ambulanceLabel = (s: AppState, id: string | null | undefined) => (id ? ambulanceById(s, id)?.registration ?? 'Removed ambulance' : null);

export const patientBookings = (s: AppState, userId: string) => s.bookings.filter((b) => b.patientId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
export const activePatientBooking = (s: AppState, userId: string) => patientBookings(s, userId).find((b) => isOpen(b.status));

export function patientStats(s: AppState, userId: string) {
  const list = patientBookings(s, userId);
  return {
    total: list.length,
    active: list.filter((b) => isOpen(b.status)).length,
    completed: list.filter((b) => b.status === 'completed').length,
    cancelled: list.filter((b) => b.status === 'cancelled').length,
  };
}

export const driverBookings = (s: AppState, driverId: string) => s.bookings.filter((b) => b.driverId === driverId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
export const activeDriverBooking = (s: AppState, driverId: string) => s.bookings.find((b) => b.driverId === driverId && ACTIVE_STATUSES.includes(b.status));

/** Requests a driver may act on: bookings assigned to them awaiting acceptance, plus open requests they are eligible for. */
export function driverQueue(s: AppState, driver: Driver): Booking[] {
  return s.bookings
    .filter((b) => {
      if (b.status === 'assigned' && b.driverId === driver.id) return true;
      if (b.status !== 'requested') return false;
      if (b.declinedByDriverIds.includes(driver.id)) return false;
      // Keep the request visible even when this driver is currently unable to accept it.
      // The UI explains the blocking reason; hiding it made real Firestore requests look missing.
      return true;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function driverStats(s: AppState, driver: Driver) {
  const mine = driverBookings(s, driver.id);
  const today = new Date().toISOString().slice(0, 10);
  return {
    pending: driverQueue(s, driver).length,
    todayTrips: mine.filter((b) => dayKey(b.createdAt) === today || dayKey(b.updatedAt) === today).length,
    completed: mine.filter((b) => b.status === 'completed').length,
  };
}

export function adminStats(s: AppState) {
  const patients = s.users.filter((u) => u.role === 'patient').length;
  const activeUsers = s.users.filter((u) => u.status === 'active').length;
  const activeDrivers = s.drivers.filter((d) => d.availability === 'online').length;
  return {
    totalBookings: s.bookings.length,
    activeBookings: s.bookings.filter((b) => isOpen(b.status)).length,
    availableAmbulances: s.ambulances.filter((a) => a.availability === 'available').length,
    busyAmbulances: s.ambulances.filter((a) => a.availability === 'busy').length,
    offlineAmbulances: s.ambulances.filter((a) => a.availability === 'offline').length,
    totalUsers: s.users.length,
    activeUsers,
    patients,
    totalDrivers: s.drivers.length,
    activeDrivers,
    pendingRequests: s.bookings.filter((b) => b.status === 'requested').length,
  };
}

export const statusDistribution = (bookings: Booking[]) =>
  BOOKING_STATUSES.map((st: BookingStatus) => ({ status: st, name: STATUS_META[st].label, value: bookings.filter((b) => b.status === st).length })).filter((x) => x.value > 0);

/** Bookings per day for the last `days` days ending today (UTC dates). */
export function bookingsPerDay(bookings: Booking[], days: number, endIso = new Date().toISOString()) {
  const out: { date: string; label: string; bookings: number; completed: number }[] = [];
  const end = new Date(endIso);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, label: key.slice(5), bookings: bookings.filter((b) => dayKey(b.createdAt) === key).length, completed: bookings.filter((b) => b.status === 'completed' && dayKey(b.updatedAt) === key).length });
  }
  return out;
}

export { isActive };
