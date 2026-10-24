import { haversineKm, lerpPoint } from '../lib/geo';
import type { Ambulance, Booking, LocationPoint } from '../types';

/**
 * Ambulance position prefers fresh driver GPS, then smoothly simulates between known waypoints.
 * assigned: at its base; accepted/on_the_way: travels toward pickup; arrived: at pickup;
 * in_progress: travels from pickup to hospital; completed: at destination.
 */
export function simulatedPosition(b: Booking, amb: Ambulance | undefined, now: number = Date.now()): LocationPoint | null {
  const gpsTimestamp = b.driverLocationUpdatedAt ? new Date(b.driverLocationUpdatedAt).getTime() : NaN;
  const gpsAge = Number.isFinite(gpsTimestamp) ? Math.max(0, now - gpsTimestamp) : Infinity;
  const gpsFresh = b.status === 'on_the_way' && b.driverLocation && gpsAge < 30_000;
  if (gpsFresh) {
    const prior = b.driverLocationPrevious;
    const priorAt = b.driverLocationPreviousAt ? new Date(b.driverLocationPreviousAt).getTime() : NaN;
    const segmentMs = Number.isFinite(priorAt) && Number.isFinite(gpsTimestamp) ? Math.max(1000, Math.min(5000, gpsTimestamp - priorAt)) : 5000;
    const progress = prior ? Math.max(0, Math.min(1, (now - gpsTimestamp) / segmentMs)) : 1;
    const name = amb?.registration ?? 'Ambulance';
    return prior
      ? lerpPoint(prior, b.driverLocation!, progress, `${name} · live driver GPS`)
      : { ...b.driverLocation!, label: `${name} · live driver GPS` };
  }
  switch (b.status) {
    case 'assigned': return amb && b.ambulanceId ? { ...amb.location, label: `${amb.registration} (simulated position)` } : null;
    case 'accepted': return animatedPosition(b, amb, now);
    case 'on_the_way': {
      if (b.driverLocation) {
        const progress = Math.max(0, Math.min(1, (gpsAge - 30_000) / (3 * 60_000)));
        return lerpPoint(b.driverLocation, b.pickup, progress, `${amb?.registration ?? 'Ambulance'} · simulated continuation`);
      }
      return animatedPosition(b, amb, now);
    }
    case 'arrived': return { ...b.pickup, label: `${amb?.registration ?? 'Ambulance'} at pickup (simulated)` };
    case 'in_progress': return animatedPosition(b, amb, now);
    case 'completed': return { ...b.destination, label: `${amb?.registration ?? 'Ambulance'} at destination (simulated)` };
    default: return null;
  }
}

/**
 * Animated ambulance position that interpolates smoothly between waypoints based on real time.
 * Uses the dispatch time for the pickup leg and the driver's pickup-confirmation time for the hospital leg.
 */
export function animatedPosition(b: Booking, amb: Ambulance | undefined, now: number = Date.now()): LocationPoint | null {
  const name = amb?.registration ?? 'Simulated ambulance';
  switch (b.status) {
    case 'assigned': return amb && b.ambulanceId ? { ...amb.location, label: `${amb.registration} (waiting for driver)` } : null;
    case 'accepted':
    case 'on_the_way': {
      const start = new Date(b.eta?.computedAt ?? b.history.find((event) => event.status === 'accepted')?.at ?? b.updatedAt).getTime();
      const duration = Math.max(1, b.eta?.minutes ?? 10) * 60_000;
      const progress = Math.max(0, Math.min(1, (now - start) / duration));
      const origin = amb?.location ?? simulatedAmbulanceStart(b.pickup);
      return lerpPoint(origin, b.pickup, progress, `${name} (simulated en route)`);
    }
    case 'arrived': return { ...b.pickup, label: `${name} at your location` };
    case 'in_progress': {
      const startedAt = [...b.history].reverse().find((event) => event.status === 'in_progress')?.at ?? b.updatedAt;
      const estimatedTravelMs = (haversineKm(b.pickup, b.destination) * (amb?.routeProfile.detourFactor || 1.25) / (amb?.routeProfile.avgSpeedKmh || 30)) * 3_600_000;
      const duration = Math.max(45_000, Math.min(180_000, estimatedTravelMs));
      const progress = Math.max(0, Math.min(1, (now - new Date(startedAt).getTime()) / duration));
      return lerpPoint(b.pickup, b.destination, progress, `${name} (simulated to hospital)`);
    }
    case 'completed': return { ...b.destination, label: `${name} at destination` };
    default: return null;
  }
}

/** If an old or incomplete booking has no ambulance record, keep its simulated marker visible on the patient map. */
function simulatedAmbulanceStart(pickup: LocationPoint): LocationPoint {
  return { lat: pickup.lat + 0.009, lng: pickup.lng - 0.009, label: 'Simulated ambulance start' };
}

/**
 * Remaining ETA in seconds, computed from the dispatch estimate's timestamp.
 * Returns 0 when the time window has elapsed.
 */
export function etaRemainingSeconds(b: Booking, now: number = Date.now()): number {
  if (!b.eta) return 0;
  const deadline = new Date(b.eta.computedAt).getTime() + b.eta.minutes * 60 * 1000;
  return Math.max(0, Math.floor((deadline - now) / 1000));
}
