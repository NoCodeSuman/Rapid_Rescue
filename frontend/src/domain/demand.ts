import { haversineKm } from '../lib/geo';
import type { AppState, DemandZone } from '../types';

/**
 * Rule-based demand positioning DEMO (not forecasting, not AI):
 *  1. demandScore(zone) = zone.baseDemand + 4 * (bookings whose pickup is nearest to that zone)
 *  2. Fleet = in-service ambulances that have a driver.
 *  3. Target count per zone = fleet * score / totalScore, rounded by largest remainder.
 *  4. Current zone = nearest zone centre to each ambulance's mock location.
 *  5. Surplus zones lend a non-busy ambulance (nearest to the deficit zone) to deficit zones.
 */
export interface ZoneRow { zone: DemandZone; demandScore: number; bookingCount: number; current: string[]; target: number }
export interface Move { ambulanceId: string; fromZoneId: string; toZoneId: string; distanceKm: number }

const nearestZone = (zones: DemandZone[], p: { lat: number; lng: number }) =>
  zones.reduce((best, z) => (haversineKm(z.center, p) < haversineKm(best.center, p) ? z : best), zones[0]);

export function computeDemand(state: AppState): { rows: ZoneRow[]; moves: Move[]; fleetSize: number } {
  const { zones } = state;
  const fleet = state.ambulances.filter((a) => a.operationalStatus === 'in_service' && a.driverId);
  const counts = new Map(zones.map((z) => [z.id, 0]));
  for (const b of state.bookings) {
    const z = nearestZone(zones, b.pickup);
    counts.set(z.id, (counts.get(z.id) ?? 0) + 1);
  }
  const scores = zones.map((z) => z.baseDemand + 4 * (counts.get(z.id) ?? 0));
  const total = scores.reduce((a, b) => a + b, 0) || 1;
  const raw = scores.map((s) => (fleet.length * s) / total);
  const target = raw.map((r) => Math.floor(r));
  let left = fleet.length - target.reduce((a, b) => a + b, 0);
  raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i).forEach(({ i }) => {
    if (left > 0) { target[i] += 1; left -= 1; }
  });
  const currentBy = new Map<string, string[]>(zones.map((z) => [z.id, []]));
  for (const a of fleet) currentBy.get(nearestZone(zones, a.location).id)!.push(a.id);

  const rows: ZoneRow[] = zones.map((zone, i) => ({
    zone, demandScore: scores[i], bookingCount: counts.get(zone.id) ?? 0, current: currentBy.get(zone.id)!, target: target[i],
  }));

  const moves: Move[] = [];
  const pool = new Map(rows.map((r) => [r.zone.id, r.current.filter((id) => state.ambulances.find((a) => a.id === id)?.availability === 'available')]));
  const surplus = new Map(rows.map((r) => [r.zone.id, Math.min(r.current.length - r.target, pool.get(r.zone.id)!.length)]));
  const deficits = rows.filter((r) => r.current.length < r.target).sort((a, b) => (b.target - b.current.length) - (a.target - a.current.length) || a.zone.id.localeCompare(b.zone.id));
  for (const d of deficits) {
    let need = d.target - d.current.length;
    while (need > 0) {
      let pick: { id: string; from: string; km: number } | null = null;
      for (const [zid, s] of surplus) {
        if (s <= 0 || zid === d.zone.id) continue;
        for (const id of pool.get(zid)!) {
          const amb = state.ambulances.find((a) => a.id === id)!;
          const km = haversineKm(amb.location, d.zone.center);
          if (!pick || km < pick.km || (km === pick.km && id < pick.id)) pick = { id, from: zid, km };
        }
      }
      if (!pick) break;
      pool.set(pick.from, pool.get(pick.from)!.filter((x) => x !== pick!.id));
      surplus.set(pick.from, surplus.get(pick.from)! - 1);
      moves.push({ ambulanceId: pick.id, fromZoneId: pick.from, toZoneId: d.zone.id, distanceKm: Math.round(pick.km * 10) / 10 });
      need -= 1;
    }
  }
  return { rows, moves, fleetSize: fleet.length };
}
