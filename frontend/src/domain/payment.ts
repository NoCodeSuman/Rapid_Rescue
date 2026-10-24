import { haversineKm } from '../lib/geo';
import type { ApplicationSettings, LocationPoint } from '../types';

/** Demo fare estimate; admins can change the base and per-kilometre rates in Settings. */
export function estimateFareInr(pickup: LocationPoint, destination: LocationPoint, settings: ApplicationSettings): number {
  const estimatedRoadKm = haversineKm(pickup, destination) * 1.25;
  // Saved browser/Firestore settings from before fare estimates were added may not contain these fields.
  const baseFare = Number.isFinite(settings.fareBaseInr) ? settings.fareBaseInr : 300;
  const perKmFare = Number.isFinite(settings.farePerKmInr) ? settings.farePerKmInr : 30;
  return Math.max(0, Math.ceil(baseFare + estimatedRoadKm * perKmFare));
}

export function splitFare(totalInr: number) {
  const upfrontInr = Math.round(totalInr * 0.3);
  return { totalInr, upfrontInr, balanceInr: totalInr - upfrontInr };
}

export const isValidUtr = (value: string): boolean => /^\d{16}$/.test(value);

/** UPI virtual payment address, e.g. clinic@okbank. */
export const isValidUpiAddress = (value: string): boolean => /^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(value.trim());

export function buildUpiPaymentUri(input: { upiAddress: string; payeeName: string; amountInr: number; reference: string; note: string }): string {
  if (!isValidUpiAddress(input.upiAddress)) throw new Error('Enter a valid UPI ID before generating a payment QR.');
  if (!Number.isFinite(input.amountInr) || input.amountInr <= 0) throw new Error('Payment amount must be greater than zero.');
  const query = new URLSearchParams({
    pa: input.upiAddress.trim(),
    pn: input.payeeName.trim().slice(0, 50),
    am: input.amountInr.toFixed(2),
    cu: 'INR',
    tr: input.reference.slice(0, 35),
    tn: input.note.trim().slice(0, 80),
  });
  return `upi://pay?${query.toString()}`;
}
