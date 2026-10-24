import { dayKey } from '../utils/format';
import type { AppState, Booking } from '../types';
import { STATUS_META } from './status';
import { ambulanceLabel, driverName, userById } from './selectors';
import { toCsv } from '../lib/csv';

export interface DateRange { from: string; to: string } // yyyy-mm-dd, inclusive; '' = open

export const filterByRange = (bookings: Booking[], r: DateRange) =>
  bookings.filter((b) => { const d = dayKey(b.createdAt); return (!r.from || d >= r.from) && (!r.to || d <= r.to); });

export function reportSummary(s: AppState, bookings: Booking[]) {
  const completed = bookings.filter((b) => b.status === 'completed').length;
  const cancelled = bookings.filter((b) => b.status === 'cancelled').length;
  const rejected = bookings.filter((b) => b.status === 'rejected').length;
  const etas = bookings.filter((b) => b.eta).map((b) => b.eta!.minutes);
  return {
    total: bookings.length, completed, cancelled, rejected,
    open: bookings.length - completed - cancelled - rejected,
    avgEta: etas.length ? Math.round(etas.reduce((a, b) => a + b, 0) / etas.length) : null,
    ambulanceUtilization: s.ambulances.map((a) => {
      const mine = bookings.filter((b) => b.ambulanceId === a.id);
      return { id: a.id, name: a.registration, trips: mine.filter((b) => b.status === 'completed').length, active: mine.filter((b) => !['completed', 'cancelled', 'rejected', 'requested'].includes(b.status)).length };
    }),
    driverActivity: s.drivers.map((d) => {
      const mine = bookings.filter((b) => b.driverId === d.id);
      return { id: d.id, name: userById(s, d.userId)?.name ?? d.driverCode, completed: mine.filter((b) => b.status === 'completed').length, cancelled: mine.filter((b) => b.status === 'cancelled').length, declined: bookings.filter((b) => b.declinedByDriverIds.includes(d.id)).length };
    }),
  };
}

/** CSV of exactly the bookings passed in (so it matches the active filters). */
export function bookingsCsv(s: AppState, bookings: Booking[]): string {
  return toCsv(
    ['Booking ID', 'Created (ISO)', 'Patient', 'Driver', 'Ambulance', 'Pickup', 'Destination', 'Emergency type', 'Requested ambulance type', 'Status', 'Simulated ETA (min)', 'Reason'],
    bookings.map((b) => [b.ref, b.createdAt, userById(s, b.patientId)?.name ?? '', driverName(s, b.driverId) ?? '', ambulanceLabel(s, b.ambulanceId) ?? '', b.pickup.label, b.destination.label, b.emergencyType, b.ambulanceType, STATUS_META[b.status].label, b.eta?.minutes ?? '', b.reason ?? '']),
  );
}
