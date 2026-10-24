import { describe, expect, it } from 'vitest';
import { createSeedState } from '../data/seed';
import * as e from '../domain/engine';
import { recommendDispatch } from '../domain/dispatch';
import { computeDemand } from '../domain/demand';
import { canTransition } from '../domain/status';
import { toCsv } from '../lib/csv';
import type { AppState } from '../types';

const fresh = () => createSeedState(Date.UTC(2026, 9, 11, 12, 0, 0));
const must = <T,>(r: { ok: boolean; state?: AppState; value?: T; error?: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r as { ok: true; state: AppState; value: T };
};
const input = (s: AppState) => ({ contactName: 'Test', contactPhone: '+91 98000 99999', pickup: s.bookings[0].pickup, destination: s.bookings[0].destination, emergencyType: 'other' as const, notes: 'n', ambulanceType: 'basic' as const });

describe('status transitions', () => {
  it('blocks illegal moves', () => {
    expect(canTransition('completed', 'requested')).toBe(false);
    expect(canTransition('cancelled', 'accepted')).toBe(false);
    expect(canTransition('in_progress', 'cancelled')).toBe(false);
    expect(canTransition('requested', 'accepted')).toBe(true);
  });
});

describe('dispatch simulation', () => {
  it('recommends the fastest feasible unit, not the nearest (seeded scenario)', () => {
    const s = fresh();
    const b = s.bookings.find((x) => x.notes.startsWith('Demo scenario: nearest'))!;
    const rec = recommendDispatch(s, b);
    expect(rec.nearestEligible?.ambulanceId).toBe('amb-1');
    expect(rec.recommended?.ambulanceId).toBe('amb-2');
    expect(rec.recommended!.etaMinutes!).toBeLessThan(rec.nearestEligible!.etaMinutes!);
    expect(rec.explanation).toMatch(/Simulated/);
  });
  it('is deterministic', () => {
    const s = fresh();
    const b = s.bookings.find((x) => x.status === 'requested')!;
    expect(recommendDispatch(s, b)).toEqual(recommendDispatch(s, b));
  });
  it('respects ICU type and handles no eligible unit', () => {
    let s = fresh();
    const icu = s.bookings.find((x) => x.ambulanceType === 'icu' && x.status === 'requested')!;
    expect(recommendDispatch(s, icu).recommended?.ambulanceId).toBe('amb-3');
    s = { ...s, ambulances: s.ambulances.map((a) => (a.id === 'amb-3' ? { ...a, availability: 'offline' as const } : a)) };
    const rec = recommendDispatch(s, icu);
    expect(rec.recommended).toBeNull();
    expect(rec.explanation).toMatch(/No eligible/);
  });
});

describe('booking lifecycle', () => {
  it('create -> accept assigns driver, ambulance, ETA and marks the ambulance busy', () => {
    let s = fresh();
    const created = must(e.createBooking(s, 'u-pat-1', input(s)));
    s = created.state;
    const id = created.value.id;
    expect(created.value.status).toBe('requested');
    expect(s.counters.booking).toBe(14);
    s = must(e.driverAccept(s, 'u-drv-1', id)).state;
    const b = s.bookings.find((x) => x.id === id)!;
    expect(b.status).toBe('accepted');
    expect(b.driverId).toBe('d-1');
    expect(b.ambulanceId).toBe('amb-1');
    expect(b.eta?.simulated).toBe(true);
    expect(s.ambulances.find((a) => a.id === 'amb-1')!.availability).toBe('busy');
    expect(b.history.map((h) => h.status)).toEqual(['requested', 'accepted']);
  });
  it('blocks duplicate open bookings per patient and double acceptance', () => {
    let s = fresh();
    const r1 = e.createBooking(s, 'u-pat-3', input(s)); // Meera already has a requested booking
    expect(r1.ok).toBe(false);
    s = must(e.createBooking(s, 'u-pat-1', input(s))).state;
    const first = s.bookings.find((b) => b.patientId === 'u-pat-1' && b.status === 'requested')!;
    s = must(e.driverAccept(s, 'u-drv-1', first.id)).state;
    const second = s.bookings.find((b) => b.id !== first.id && b.status === 'requested')!;
    expect(e.driverAccept(s, 'u-drv-1', second.id).ok).toBe(false);
    expect(e.driverAccept(s, 'u-drv-2', first.id).ok).toBe(false); // no longer available
  });
  it('walks the full driver lifecycle and releases resources', () => {
    let s = fresh();
    s = must(e.createBooking(s, 'u-pat-1', input(s))).state;
    const bk = s.bookings.find((b) => b.patientId === 'u-pat-1' && b.status === 'requested')!;
    s = must(e.driverAccept(s, 'u-drv-1', bk.id)).state;
    expect(e.advanceTrip(s, 'u-drv-1', bk.id, 'completed').ok).toBe(false);
    for (const to of ['on_the_way', 'arrived', 'in_progress', 'completed'] as const) s = must(e.advanceTrip(s, 'u-drv-1', bk.id, to)).state;
    expect(s.bookings.find((b) => b.id === bk.id)!.status).toBe('completed');
    expect(s.ambulances.find((a) => a.id === 'amb-1')!.availability).toBe('available');
    expect(e.cancelBooking(s, 'u-pat-1', bk.id).ok).toBe(false);
  });
  it('cancellation frees the ambulance; reject keeps request for others', () => {
    let s = fresh();
    const b = s.bookings.find((x) => x.status === 'requested')!;
    s = must(e.driverReject(s, 'u-drv-1', b.id)).state;
    expect(s.bookings.find((x) => x.id === b.id)!.status).toBe('requested');
    expect(e.driverAccept(s, 'u-drv-1', b.id).ok).toBe(false);
    s = must(e.driverAccept(s, 'u-drv-2', b.id)).state;
    s = must(e.cancelBooking(s, b.patientId, b.id)).state;
    expect(s.ambulances.find((a) => a.id === 'amb-2')!.availability).toBe('available');
  });
  it('admin assign then driver decline returns the booking to the queue', () => {
    let s = fresh();
    const b = s.bookings.find((x) => x.status === 'requested')!;
    s = must(e.adminAssign(s, 'u-adm-1', b.id, 'amb-2')).state;
    expect(s.bookings.find((x) => x.id === b.id)!.status).toBe('assigned');
    expect(e.adminAssign(s, 'u-adm-1', s.bookings.find((x) => x.status === 'requested')!.id, 'amb-2').ok).toBe(false);
    s = must(e.driverReject(s, 'u-drv-2', b.id)).state;
    const after = s.bookings.find((x) => x.id === b.id)!;
    expect(after.status).toBe('requested');
    expect(after.ambulanceId).toBeNull();
    expect(s.ambulances.find((a) => a.id === 'amb-2')!.availability).toBe('available');
  });
});

describe('drivers, ambulances, users', () => {
  it('driver cannot go offline mid-trip; offline driver is not dispatchable', () => {
    let s = fresh();
    expect(e.setDriverAvailability(s, 'u-drv-4', 'd-4', 'offline').ok).toBe(false);
    s = must(e.setDriverAvailability(s, 'u-drv-1', 'd-1', 'offline')).state;
    expect(s.ambulances.find((a) => a.id === 'amb-1')!.availability).toBe('offline');
    const b = s.bookings.find((x) => x.notes.startsWith('Demo scenario: nearest'))!;
    expect(recommendDispatch(s, b).candidates.find((c) => c.ambulanceId === 'amb-1')!.eligible).toBe(false);
  });
  it('ambulance CRUD validates uniqueness and active assignments', () => {
    const s = fresh();
    const a = s.ambulances[0];
    const base = { registration: 'rr-amb-09', type: 'basic' as const, operationalStatus: 'in_service' as const, availability: 'available' as const, driverId: null, location: a.location, routeProfileKey: 'moderate' };
    const created = must(e.createAmbulance(s, 'u-adm-1', base));
    expect(created.value.registration).toBe('RR-AMB-09');
    expect(e.createAmbulance(created.state, 'u-adm-1', { ...base, registration: 'RR-AMB-09' }).ok).toBe(false);
    expect(e.deleteAmbulance(s, 'u-adm-1', 'amb-4').ok).toBe(false); // active booking
    const del = must(e.deleteAmbulance(s, 'u-adm-1', 'amb-1'));
    expect(del.state.drivers.find((d) => d.id === 'd-1')!.ambulanceId).toBeNull();
  });
  it('protects the admin account and prevents public admin registration', () => {
    const s = fresh();
    expect(e.updateUser(s, 'u-adm-1', 'u-adm-1', { name: 'Admin Demo', phone: '+91 98000 30001', status: 'inactive' }).ok).toBe(false);
    // @ts-expect-error role is intentionally restricted
    expect(e.registerUser(s, { name: 'x', email: 'x@y.z', phone: '1', role: 'admin' }).ok).toBe(false);
  });
});

describe('demand + csv', () => {
  it('demand targets sum to fleet and are deterministic', () => {
    const s = fresh();
    const d1 = computeDemand(s), d2 = computeDemand(s);
    expect(d1).toEqual(d2);
    expect(d1.rows.reduce((a, r) => a + r.target, 0)).toBe(d1.fleetSize);
  });
  it('csv escapes and neutralises formulas', () => {
    expect(toCsv(['a'], [['=SUM(1)'], ['x,"y"']])).toBe("a\r\n'=SUM(1)\r\n\"x,\"\"y\"\"\"");
  });
});
