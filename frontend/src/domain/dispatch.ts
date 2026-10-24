import { haversineKm } from '../lib/geo';
import type { AppState, Booking, DispatchCandidate, DispatchRecommendation, Ambulance, ETAEstimate } from '../types';
import { ACTIVE_STATUSES, AMBULANCE_TYPE_LABELS, typeSatisfies } from './status';

/**
 * SIMULATED, deterministic ETA rule (not real routing, not traffic-aware):
 *   routeKm = straightLineKm * profile.detourFactor
 *   minutes = ceil(routeKm / profile.avgSpeedKmh * 60 + PREP_MINUTES)
 * Each ambulance carries a mock "route profile" (speed + detour) so the nearest unit is not always the fastest.
 */
export const PREP_MINUTES = 2;

export function simulateEta(amb: Ambulance, pickup: { lat: number; lng: number }, nowIso: string): ETAEstimate {
  const distanceKm = haversineKm(amb.location, pickup);
  const routeKm = distanceKm * amb.routeProfile.detourFactor;
  const minutes = Math.ceil((routeKm / amb.routeProfile.avgSpeedKmh) * 60 + PREP_MINUTES);
  return { minutes, distanceKm: Math.round(distanceKm * 10) / 10, computedAt: nowIso, simulated: true };
}

export function ambulanceHasActiveBooking(state: AppState, ambulanceId: string, exceptBookingId?: string): boolean {
  return state.bookings.some((b) => b.ambulanceId === ambulanceId && ACTIVE_STATUSES.includes(b.status) && b.id !== exceptBookingId);
}
export function driverHasActiveBooking(state: AppState, driverId: string, exceptBookingId?: string): boolean {
  return state.bookings.some((b) => b.driverId === driverId && ACTIVE_STATUSES.includes(b.status) && b.id !== exceptBookingId);
}

/** Reasons why an ambulance cannot take this booking right now (empty = eligible). */
export function ineligibleReasons(state: AppState, booking: Booking, amb: Ambulance): string[] {
  const reasons: string[] = [];
  const driver = state.drivers.find((d) => d.id === amb.driverId);
  const driverUser = driver ? state.users.find((u) => u.id === driver.userId) : undefined;
  if (amb.operationalStatus !== 'in_service') reasons.push(`Not in service (${amb.operationalStatus.replace('_', ' ')})`);
  if (!driver) reasons.push('No driver assigned');
  else {
    if (driver.availability !== 'online') reasons.push('Driver is offline');
    if (driverUser?.status === 'inactive') reasons.push('Driver account deactivated');
    if (booking.declinedByDriverIds.includes(driver.id)) reasons.push('Driver declined this request');
    if (driverHasActiveBooking(state, driver.id, booking.id)) reasons.push('Driver already on an active trip');
  }
  if (booking.ambulanceId === amb.id && ACTIVE_STATUSES.includes(booking.status)) reasons.push('Currently assigned to this booking');
  else if (amb.availability === 'busy' || ambulanceHasActiveBooking(state, amb.id, booking.id)) reasons.push('Busy with another active booking');
  else if (amb.availability === 'offline') reasons.push('Ambulance is offline');
  if (!typeSatisfies(amb.type, booking.ambulanceType)) reasons.push(`Type ${AMBULANCE_TYPE_LABELS[amb.type]} does not meet requested ${AMBULANCE_TYPE_LABELS[booking.ambulanceType]}`);
  return reasons;
}

/** Evaluates every ambulance for a booking. Deterministic: same state in, same output. */
export function recommendDispatch(state: AppState, booking: Booking, nowIso = booking.updatedAt): DispatchRecommendation {
  const candidates: DispatchCandidate[] = state.ambulances.map((amb) => {
    const reasons = ineligibleReasons(state, booking, amb);
    const eta = simulateEta(amb, booking.pickup, nowIso);
    return {
      ambulanceId: amb.id,
      driverId: amb.driverId,
      distanceKm: eta.distanceKm,
      etaMinutes: eta.minutes,
      eligible: reasons.length === 0,
      reasons,
    };
  });
  const eligible = candidates.filter((c) => c.eligible);
  const byEta = [...eligible].sort((a, b) => (a.etaMinutes! - b.etaMinutes!) || (a.distanceKm - b.distanceKm) || a.ambulanceId.localeCompare(b.ambulanceId));
  const byDist = [...eligible].sort((a, b) => (a.distanceKm - b.distanceKm) || a.ambulanceId.localeCompare(b.ambulanceId));
  const recommended = byEta[0] ?? null;
  const nearestEligible = byDist[0] ?? null;
  const reg = (id: string) => state.ambulances.find((a) => a.id === id)?.registration ?? id;
  let explanation: string;
  if (!recommended) {
    explanation = 'No eligible ambulance: every unit is unavailable, busy, offline, unstaffed or does not meet the requested type. (Simulated assessment.)';
  } else if (nearestEligible && nearestEligible.ambulanceId !== recommended.ambulanceId) {
    const near = state.ambulances.find((a) => a.id === nearestEligible.ambulanceId)!;
    const rec = state.ambulances.find((a) => a.id === recommended.ambulanceId)!;
    explanation = `${reg(recommended.ambulanceId)} is recommended even though ${reg(nearestEligible.ambulanceId)} is geographically closer (${nearestEligible.distanceKm.toFixed(1)} km vs ${recommended.distanceKm.toFixed(1)} km). ` +
      `Its simulated ETA is ${recommended.etaMinutes} min vs ${nearestEligible.etaMinutes} min, because ${reg(nearestEligible.ambulanceId)} has a slower mock route profile ` +
      `(${near.routeProfile.label}: ~${near.routeProfile.avgSpeedKmh} km/h, x${near.routeProfile.detourFactor} detour) while ${reg(recommended.ambulanceId)} has ${rec.routeProfile.label} (~${rec.routeProfile.avgSpeedKmh} km/h, x${rec.routeProfile.detourFactor}). Simulated rule, not real routing.`;
  } else {
    explanation = `${reg(recommended.ambulanceId)} has the lowest simulated ETA (${recommended.etaMinutes} min) among ${eligible.length} eligible unit(s) and is also the nearest. Simulated rule, not real routing.`;
  }
  return { bookingId: booking.id, candidates, recommended, nearestEligible, explanation };
}
