import { describe, expect, it } from 'vitest';
import { buildAdminView } from '../domain/adminSync';
import { createSeedState } from '../data/seed';
import { resetKeepingRegisteredAccounts, upsertUserFromProfile } from '../domain/engine';
import type { AppState, Booking, Driver, RemoteProfile, User } from '../types';

const profile = (over: Partial<RemoteProfile> = {}): RemoteProfile => ({
  uid: 'uid-drv', displayName: 'Ravi Kumar', phoneNumber: '+91 98765 43210', role: 'driver', accountStatus: 'active',
  schemaVersion: 1, createdAt: '2026-10-24T05:00:00.000Z', updatedAt: '2026-10-24T05:00:00.000Z', ...over,
});
const empty = { appUsers: [] as User[], drivers: [] as Driver[], patientProfiles: [], bookings: [] as Booking[] };

describe('admin view of registered people (the reported bug)', () => {
  it('lists a driver who only has a Firestore profile (registered, nothing else published yet) with name and phone', () => {
    const v = buildAdminView({ ...empty, profiles: [profile()] });
    const u = v.users.find((x) => x.firebaseUid === 'uid-drv')!;
    expect(u).toMatchObject({ name: 'Ravi Kumar', phone: '+91 98765 43210', role: 'driver', status: 'active' });
    const d = v.drivers.find((x) => x.userFirebaseUid === 'uid-drv')!;
    expect(d.userId).toBe(u.id);
    expect(d.availability).toBe('offline');
    expect(d.ambulanceId).toBeNull();
  });
  it('uses the email and ids the driver device published, and live name/status from the trusted profile', () => {
    const published: Driver = { id: 'd_old', userId: 'u_old', userFirebaseUid: 'uid-drv', contactEmail: 'ravi@example.com', driverCode: 'DRV-009', licenseNumber: 'L', ambulanceId: 'amb-9', availability: 'online', updatedAt: 'x' };
    const v = buildAdminView({ ...empty, drivers: [published], profiles: [profile({ displayName: 'Ravi K', accountStatus: 'inactive' })] });
    const u = v.users.find((x) => x.firebaseUid === 'uid-drv')!;
    expect(u.id).toBe('u_old');
    expect(u.email).toBe('ravi@example.com');
    expect(u.name).toBe('Ravi K');
    expect(u.status).toBe('inactive');
    expect(v.drivers).toHaveLength(1); // no duplicate synthetic driver
    expect(v.drivers[0].ambulanceId).toBe('amb-9');
  });
  it('keeps demo/seeded records and does not duplicate people already in appUsers', () => {
    const seed = createSeedState();
    const v = buildAdminView({ ...empty, appUsers: seed.users, drivers: seed.drivers, patientProfiles: seed.profiles, profiles: [profile()] });
    expect(v.users.length).toBe(seed.users.length + 1);
    expect(v.drivers.length).toBe(seed.drivers.length + 1);
  });
  it('maps a patient to the local id their bookings already use', () => {
    const b = { id: 'bk1', patientId: 'u_pat', patientFirebaseUid: 'uid-pat' } as Booking;
    const v = buildAdminView({ ...empty, bookings: [b], profiles: [profile({ uid: 'uid-pat', role: 'patient', displayName: 'Asha' })] });
    expect(v.users.find((x) => x.firebaseUid === 'uid-pat')!.id).toBe('u_pat');
  });
  it('shows the signed-in administrator with their own email so the route guard keeps them signed in', () => {
    const v = buildAdminView({ ...empty, profiles: [profile({ uid: 'uid-adm', role: 'admin', displayName: 'Boss' })], knownEmails: { 'uid-adm': 'boss@example.com' } });
    expect(v.users.find((x) => x.firebaseUid === 'uid-adm')!.email).toBe('boss@example.com');
  });
});

describe('Firebase accounts get stable ids', () => {
  const input = { email: 'ravi@example.com', name: 'Ravi', phone: '', role: 'driver' as const, status: 'active' as const, firebaseUid: 'uid-drv-123456' };
  it('uses the same user and driver id on every device and records the Firebase uid', () => {
    const a = upsertUserFromProfile(createSeedState(), input);
    const b = upsertUserFromProfile(createSeedState(), input);
    if (!a.ok || !b.ok) throw new Error('upsert failed');
    expect(a.value.id).toBe(b.value.id);
    expect(a.value.firebaseUid).toBe('uid-drv-123456');
    const d = a.state.drivers.find((x) => x.userId === a.value.id)!;
    expect(d.id).toBe('d_uid-drv-123456');
    expect(d.userFirebaseUid).toBe('uid-drv-123456');
  });
});

describe('Reset demo data', () => {
  it('restores demo records but never removes registered accounts or their bookings', () => {
    const seed = createSeedState();
    const r = upsertUserFromProfile(seed, { email: 'ravi@example.com', name: 'Ravi', phone: '', role: 'driver', status: 'active', firebaseUid: 'uid-1' });
    if (!r.ok) throw new Error('x');
    const dirty = { ...r.state, ambulances: [], users: r.state.users.filter((u) => !u.id.startsWith('u-pat')) };
    const reset = resetKeepingRegisteredAccounts(dirty, createSeedState());
    expect(reset.users.some((u) => u.firebaseUid === 'uid-1')).toBe(true);
    expect(reset.drivers.some((d) => d.userFirebaseUid === 'uid-1')).toBe(true);
    expect(reset.users.some((u) => u.id === 'u-pat-1')).toBe(true);
    expect(reset.ambulances.length).toBe(seed.ambulances.length);
  });
});

import { createEmptyState, isDemoRecordId } from '../data/seed';
import { adminStats, statusDistribution, bookingsPerDay } from '../domain/selectors';
import { computeDemand } from '../domain/demand';

describe('Firebase mode starts without demo data', () => {
  it('has no demo people, fleet or bookings, and admin screens\' calculations work on empty data', () => {
    const s = createEmptyState();
    expect([s.users, s.drivers, s.ambulances, s.bookings, s.activity].every((x) => x.length === 0)).toBe(true);
    expect(adminStats(s).totalBookings).toBe(0);
    expect(statusDistribution(s.bookings)).toEqual([]);
    expect(bookingsPerDay(s.bookings, 7)).toHaveLength(7);
    expect(() => computeDemand(s)).not.toThrow();
  });
  it('recognises only the fixed demo ids as demo records', () => {
    expect(isDemoRecordId('drivers', 'd-3')).toBe(true);
    expect(isDemoRecordId('drivers', 'd_uid123')).toBe(false);
    expect(isDemoRecordId('appUsers', 'u-drv-1')).toBe(true);
    expect(isDemoRecordId('appUsers', 'f_uid123')).toBe(false);
    expect(isDemoRecordId('ambulances', 'amb-2')).toBe(true);
    expect(isDemoRecordId('ambulances', 'amb_k3j2x')).toBe(false);
  });
});

import { createDriver, equipAmbulance } from '../domain/engine';
import { driverByUserId } from '../domain/selectors';

describe('Admin createDriver and active user tracking', () => {
  it('allows an administrator to add a driver directly with ambulance assignment', () => {
    const s = createSeedState();
    const admin = s.users.find((u) => u.role === 'admin')!;
    const res = createDriver(s, admin.id, {
      name: 'Ramesh Patel',
      email: 'ramesh.patel@rapidrescue.demo',
      phone: '+91 98111 22233',
      driverCode: 'DRV-777',
      licenseNumber: 'DL-IND-999',
      ambulanceId: 'amb-6',
      availability: 'online',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.value.driverCode).toBe('DRV-777');
    expect(res.value.ambulanceId).toBe('amb-6');
    expect(res.value.availability).toBe('online');
    // Ambulance should be assigned to this driver; since amb-6 is in maintenance it stays offline safely
    const amb = res.state.ambulances.find((a) => a.id === 'amb-6')!;
    expect(amb.driverId).toBe(res.value.id);
    expect(amb.availability).toBe('offline');

    // If assigned to an in-service ambulance, availability becomes available when driver is online
    const s2 = { ...s, ambulances: s.ambulances.map((a) => (a.id === 'amb-6' ? { ...a, operationalStatus: 'in_service' as const } : a)) };
    const res2 = createDriver(s2, admin.id, {
      name: 'Suresh Kumar',
      email: 'suresh.kumar@rapidrescue.demo',
      phone: '+91 98111 44455',
      ambulanceId: 'amb-6',
      availability: 'online',
    });
    expect(res2.ok).toBe(true);
    if (!res2.ok) throw new Error(res2.error);
    const ambInService = res2.state.ambulances.find((a) => a.id === 'amb-6')!;
    expect(ambInService.availability).toBe('available');
    // User should exist with role driver
    const u = res.state.users.find((x) => x.id === res.value.userId)!;
    expect(u.role).toBe('driver');
    expect(u.status).toBe('active');
  });

  it('tracks active users and active drivers in adminStats accurately', () => {
    const s = createSeedState();
    const stats = adminStats(s);
    expect(stats.activeUsers).toBe(s.users.filter((u) => u.status === 'active').length);
    expect(stats.activeDrivers).toBe(s.drivers.filter((d) => d.availability === 'online').length);
    expect(stats.totalUsers).toBe(s.users.length);
    expect(stats.totalDrivers).toBe(s.drivers.length);
  });

  it('driverByUserId resolves driver even if stored only by userFirebaseUid or creates synthetic fallback', () => {
    const s = createSeedState();
    const testUser: User = {
      id: 'f_test_uid',
      name: 'Test Driver',
      email: 'testdriver@rapidrescue.demo',
      phone: '+91 99999 00000',
      role: 'driver',
      status: 'active',
      firebaseUid: 'test_uid',
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    };
    const stateWithUser: AppState = { ...s, users: [...s.users, testUser] };
    const resolved = driverByUserId(stateWithUser, testUser.id);
    expect(resolved).toBeDefined();
    expect(resolved?.userId).toBe(testUser.id);
    expect(resolved?.contactName).toBe('Test Driver');
  });

  it('allows a driver to equip an ambulance for their shift', () => {
    const s = createSeedState();
    const driver = s.drivers[0];
    const res = equipAmbulance(s, driver.userId, driver.id, 'amb-2');
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error(res.error);
    expect(res.value.ambulanceId).toBe('amb-2');
    expect(res.value.availability).toBe('online');
    const amb = res.state.ambulances.find((a) => a.id === 'amb-2')!;
    expect(amb.driverId).toBe(driver.id);
    expect(amb.availability).toBe('available');
  });
});
