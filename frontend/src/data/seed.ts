import type { AppState, Booking, BookingStatus, EmergencyType, AmbulanceType, LocationPoint, ETAEstimate } from '../types';
import { DEMO_HOSPITALS, DEMO_PICKUPS, ROUTE_PROFILES } from './places';
import { simulateEta } from '../domain/dispatch';

export const DEMO_PASSWORD = 'Demo@1234';
export const DEMO_ACCOUNTS = {
  patient: 'patient@rapidrescue.demo',
  driver: 'driver@rapidrescue.demo',
  admin: 'admin@rapidrescue.demo',
} as const;

const PATH: BookingStatus[] = ['requested', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed'];

/** Builds consistent, fictional seed data relative to `nowMs` so charts always show recent activity. */
export function createSeedState(nowMs: number = Date.now()): AppState {
  const iso = (msAgo: number) => new Date(nowMs - msAgo).toISOString();
  const H = 3_600_000, D = 24 * H, M = 60_000;
  const nowIso = iso(0);

  const mkUser = (id: string, name: string, email: string, phone: string, role: 'patient' | 'driver' | 'admin', daysAgo: number, status: 'active' | 'inactive' = 'active') =>
    ({ id, name, email, phone, role, status, createdAt: iso(daysAgo * D), updatedAt: iso(daysAgo * D) });

  const users = [
    mkUser('u-pat-1', 'Asha Verma', DEMO_ACCOUNTS.patient, '+91 98000 10001', 'patient', 30),
    mkUser('u-pat-2', 'Rohan Das', 'rohan.das@rapidrescue.demo', '+91 98000 10002', 'patient', 28),
    mkUser('u-pat-3', 'Meera Iyer', 'meera.iyer@rapidrescue.demo', '+91 98000 10003', 'patient', 25),
    mkUser('u-pat-4', 'Nisha Kapoor', 'nisha.kapoor@rapidrescue.demo', '+91 98000 10004', 'patient', 20),
    mkUser('u-pat-5', 'Tarun Bose', 'tarun.bose@rapidrescue.demo', '+91 98000 10005', 'patient', 18, 'inactive'),
    mkUser('u-drv-1', 'Karan Singh', DEMO_ACCOUNTS.driver, '+91 98000 20001', 'driver', 40),
    mkUser('u-drv-2', 'Imran Shaikh', 'imran.shaikh@rapidrescue.demo', '+91 98000 20002', 'driver', 38),
    mkUser('u-drv-3', 'Sunita Rao', 'sunita.rao@rapidrescue.demo', '+91 98000 20003', 'driver', 35),
    mkUser('u-drv-4', 'Vikram Nair', 'vikram.nair@rapidrescue.demo', '+91 98000 20004', 'driver', 33),
    mkUser('u-drv-5', 'Leena Dsouza', 'leena.dsouza@rapidrescue.demo', '+91 98000 20005', 'driver', 30),
    mkUser('u-adm-1', 'Admin Demo', DEMO_ACCOUNTS.admin, '+91 98000 30001', 'admin', 60),
  ];

  const profiles = [
    { userId: 'u-pat-1', address: '12 Sample Street, Demo City', emergencyContactName: 'Rahul Verma', emergencyContactPhone: '+91 98000 40001' },
    { userId: 'u-pat-2', address: '4 Example Road, Demo City', emergencyContactName: 'Rina Das', emergencyContactPhone: '+91 98000 40002' },
    { userId: 'u-pat-3', address: '88 Fictional Avenue, Demo City', emergencyContactName: 'Arun Iyer', emergencyContactPhone: '+91 98000 40003' },
    { userId: 'u-pat-4', address: '7 Mock Lane, Demo City', emergencyContactName: 'Neel Kapoor', emergencyContactPhone: '+91 98000 40004' },
    { userId: 'u-pat-5', address: '19 Test Colony, Demo City', emergencyContactName: 'Tina Bose', emergencyContactPhone: '+91 98000 40005' },
  ];

  const drivers = [
    { id: 'd-1', userId: 'u-drv-1', driverCode: 'DRV-001', licenseNumber: 'DEMO-DL-1001', ambulanceId: 'amb-1', availability: 'online' as const, updatedAt: nowIso },
    { id: 'd-2', userId: 'u-drv-2', driverCode: 'DRV-002', licenseNumber: 'DEMO-DL-1002', ambulanceId: 'amb-2', availability: 'online' as const, updatedAt: nowIso },
    { id: 'd-3', userId: 'u-drv-3', driverCode: 'DRV-003', licenseNumber: 'DEMO-DL-1003', ambulanceId: 'amb-3', availability: 'online' as const, updatedAt: nowIso },
    { id: 'd-4', userId: 'u-drv-4', driverCode: 'DRV-004', licenseNumber: 'DEMO-DL-1004', ambulanceId: 'amb-4', availability: 'online' as const, updatedAt: nowIso },
    { id: 'd-5', userId: 'u-drv-5', driverCode: 'DRV-005', licenseNumber: 'DEMO-DL-1005', ambulanceId: 'amb-5', availability: 'offline' as const, updatedAt: nowIso },
  ];

  const loc = (lat: number, lng: number, label: string): LocationPoint => ({ lat, lng, label });
  const ambulances = [
    // Nearest to the "Green Park Apartments" demo pickup but on a slow mock route profile.
    { id: 'amb-1', registration: 'RR-AMB-01', type: 'basic' as const, operationalStatus: 'in_service' as const, availability: 'available' as const, driverId: 'd-1', location: loc(22.5899, 88.37, 'Central Market base'), routeProfile: ROUTE_PROFILES.congested, updatedAt: nowIso },
    { id: 'amb-2', registration: 'RR-AMB-02', type: 'advanced' as const, operationalStatus: 'in_service' as const, availability: 'available' as const, driverId: 'd-2', location: loc(22.5566, 88.37, 'Ring Road base'), routeProfile: ROUTE_PROFILES.arterial, updatedAt: nowIso },
    { id: 'amb-3', registration: 'RR-AMB-03', type: 'icu' as const, operationalStatus: 'in_service' as const, availability: 'available' as const, driverId: 'd-3', location: loc(22.54, 88.35, 'Lakeside base'), routeProfile: ROUTE_PROFILES.moderate, updatedAt: nowIso },
    { id: 'amb-4', registration: 'RR-AMB-04', type: 'basic' as const, operationalStatus: 'in_service' as const, availability: 'busy' as const, driverId: 'd-4', location: loc(22.595, 88.38, 'Riverside base'), routeProfile: ROUTE_PROFILES.moderate, updatedAt: nowIso },
    { id: 'amb-5', registration: 'RR-AMB-05', type: 'advanced' as const, operationalStatus: 'in_service' as const, availability: 'offline' as const, driverId: 'd-5', location: loc(22.53, 88.39, 'Southern base'), routeProfile: ROUTE_PROFILES.fast, updatedAt: nowIso },
    { id: 'amb-6', registration: 'RR-AMB-06', type: 'basic' as const, operationalStatus: 'maintenance' as const, availability: 'offline' as const, driverId: null, location: loc(22.565, 88.33, 'Old Town depot'), routeProfile: ROUTE_PROFILES.oldtown, updatedAt: nowIso },
  ];

  const zones = [
    { id: 'z-central', name: 'Central Market', center: loc(22.575, 88.365, 'Central Market'), radiusKm: 2, baseDemand: 70 },
    { id: 'z-river', name: 'Riverside', center: loc(22.59, 88.35, 'Riverside'), radiusKm: 2, baseDemand: 40 },
    { id: 'z-lake', name: 'Lakeside South', center: loc(22.54, 88.36, 'Lakeside South'), radiusKm: 2, baseDemand: 55 },
    { id: 'z-air', name: 'Airport Link', center: loc(22.61, 88.4, 'Airport Link'), radiusKm: 2, baseDemand: 30 },
    { id: 'z-old', name: 'Old Town', center: loc(22.565, 88.33, 'Old Town'), radiusKm: 2, baseDemand: 45 },
  ];

  let counter = 0;
  const bookings: Booking[] = [];
  const addBooking = (o: {
    patientId: string; agoMs: number; status: BookingStatus; pickup: number; dest: number; type: EmergencyType; amb: AmbulanceType;
    driverId?: string; ambulanceId?: string; notes: string; reason?: string; withEta?: boolean; declined?: string[];
  }) => {
    counter += 1;
    const u = users.find((x) => x.id === o.patientId)!;
    const created = nowMs - o.agoMs;
    const history: Booking['history'] = [{ status: 'requested', at: new Date(created).toISOString(), byUserId: o.patientId }];
    const idx = PATH.indexOf(o.status);
    if (idx > 0) for (let i = 1; i <= idx; i++) history.push({ status: PATH[i], at: new Date(created + i * 9 * M).toISOString(), byUserId: o.driverId ? drivers.find((d) => d.id === o.driverId)!.userId : null });
    if (o.status === 'cancelled') history.push({ status: 'cancelled', at: new Date(created + 6 * M).toISOString(), byUserId: o.patientId, note: o.reason });
    if (o.status === 'rejected') history.push({ status: 'rejected', at: new Date(created + 6 * M).toISOString(), byUserId: 'u-adm-1', note: o.reason });
    const amb = ambulances.find((a) => a.id === o.ambulanceId);
    let eta: ETAEstimate | null = null;
    if (o.withEta && amb) eta = simulateEta(amb, DEMO_PICKUPS[o.pickup], new Date(created).toISOString());
    const last = history[history.length - 1];
    bookings.push({
      id: `bk-${String(counter).padStart(3, '0')}`,
      ref: `RR-${new Date(created).getFullYear()}-${String(counter).padStart(4, '0')}`,
      patientId: o.patientId, contactName: u.name, contactPhone: u.phone,
      pickup: DEMO_PICKUPS[o.pickup], destination: DEMO_HOSPITALS[o.dest],
      emergencyType: o.type, notes: o.notes, ambulanceType: o.amb, status: o.status,
      createdAt: new Date(created).toISOString(), updatedAt: last.at,
      driverId: o.driverId ?? null, ambulanceId: o.ambulanceId ?? null, eta, reason: o.reason,
      declinedByDriverIds: o.declined ?? [], history,
    });
  };

  addBooking({ patientId: 'u-pat-1', agoMs: 12 * D, status: 'completed', pickup: 1, dest: 0, type: 'cardiac', amb: 'advanced', driverId: 'd-2', ambulanceId: 'amb-2', notes: 'Chest pain, conscious (fictional).' });
  addBooking({ patientId: 'u-pat-4', agoMs: 11 * D, status: 'completed', pickup: 3, dest: 2, type: 'transfer', amb: 'basic', driverId: 'd-1', ambulanceId: 'amb-1', notes: 'Scheduled transfer (fictional).' });
  addBooking({ patientId: 'u-pat-5', agoMs: 8 * D, status: 'completed', pickup: 4, dest: 0, type: 'accident', amb: 'basic', driverId: 'd-4', ambulanceId: 'amb-4', notes: 'Minor fall (fictional).' });
  addBooking({ patientId: 'u-pat-5', agoMs: 7 * D, status: 'rejected', pickup: 5, dest: 3, type: 'other', amb: 'icu', reason: 'No eligible unit in demo scenario', notes: 'Demo rejection.' });
  addBooking({ patientId: 'u-pat-1', agoMs: 9 * D, status: 'completed', pickup: 0, dest: 0, type: 'breathing', amb: 'advanced', driverId: 'd-2', ambulanceId: 'amb-2', notes: 'Shortness of breath (fictional).' });
  addBooking({ patientId: 'u-pat-2', agoMs: 6 * D, status: 'completed', pickup: 1, dest: 0, type: 'stroke', amb: 'icu', driverId: 'd-3', ambulanceId: 'amb-3', notes: 'Suspected stroke (fictional).' });
  addBooking({ patientId: 'u-pat-1', agoMs: 5 * D, status: 'cancelled', pickup: 0, dest: 0, type: 'other', amb: 'basic', reason: 'Patient cancelled (demo)', notes: 'Booked by mistake.' });
  addBooking({ patientId: 'u-pat-3', agoMs: 4 * D, status: 'completed', pickup: 2, dest: 1, type: 'pregnancy', amb: 'advanced', driverId: 'd-2', ambulanceId: 'amb-2', notes: 'Labour pains (fictional).' });
  addBooking({ patientId: 'u-pat-4', agoMs: 3 * D, status: 'completed', pickup: 3, dest: 2, type: 'cardiac', amb: 'advanced', driverId: 'd-1', ambulanceId: 'amb-1', notes: 'Palpitations (fictional).' });
  addBooking({ patientId: 'u-pat-2', agoMs: 2 * D, status: 'completed', pickup: 4, dest: 0, type: 'accident', amb: 'basic', driverId: 'd-1', ambulanceId: 'amb-1', notes: 'Bike accident (fictional).' });
  addBooking({ patientId: 'u-pat-2', agoMs: 40 * M, status: 'in_progress', pickup: 3, dest: 2, type: 'transfer', amb: 'basic', driverId: 'd-4', ambulanceId: 'amb-4', notes: 'Transfer to heart institute (fictional).', withEta: true });
  // Seeded scenario: nearest unit (RR-AMB-01) is NOT the fastest feasible unit (RR-AMB-02).
  addBooking({ patientId: 'u-pat-3', agoMs: 8 * M, status: 'requested', pickup: 0, dest: 0, type: 'accident', amb: 'basic', notes: 'Demo scenario: nearest-vs-fastest dispatch comparison.' });
  addBooking({ patientId: 'u-pat-4', agoMs: 5 * M, status: 'requested', pickup: 2, dest: 1, type: 'cardiac', amb: 'icu', notes: 'Demo scenario: requires Mobile ICU.' });

  const activity = [
    { id: 'act-1', at: iso(2 * H), actorId: 'u-adm-1', message: 'Admin Demo reviewed ambulance availability (seed activity).' },
    { id: 'act-2', at: iso(40 * M), actorId: 'u-drv-4', message: 'Vikram Nair started transport for a transfer booking (seed activity).', bookingId: 'bk-011' },
    { id: 'act-3', at: iso(8 * M), actorId: 'u-pat-3', message: 'Meera Iyer created demo booking (seed activity).', bookingId: 'bk-012' },
    { id: 'act-4', at: iso(5 * M), actorId: 'u-pat-4', message: 'Nisha Kapoor created demo booking (seed activity).', bookingId: 'bk-013' },
  ];

  return {
    users, profiles, drivers, ambulances, bookings, zones,
    notifications: [],
    activity,
    settings: { organisationName: 'RapidRescue Demo Operations', toastsEnabled: true, notifyBookingUpdates: true, notifyAssignments: true, compactTables: false, defaultPageSize: 10, upiQrCodeDataUrl: null, upiPaymentAddress: '', fareBaseInr: 300, farePerKmInr: 30 },
    counters: { booking: counter },
  };
}

/** True for records that only exist in the built-in demo data set (never for anything a real person created). */
export const isDemoRecordId = (collection: string, id: string): boolean => {
  switch (collection) {
    case 'appUsers': case 'patientProfiles': return id.startsWith('u-');
    case 'drivers': return /^d-\d+$/.test(id);
    case 'ambulances': return /^amb-\d+$/.test(id);
    case 'activity': return /^act-\d+$/.test(id);
    default: return false;
  }
};

/**
 * Starting state when the app is connected to Firebase: NO demo people, fleet or bookings. Everything comes from
 * Firestore. Only the demand-zone reference areas are kept, because the admin console has no screen to create them.
 */
export function createEmptyState(): AppState {
  const base = createSeedState();
  return {
    users: [], profiles: [], drivers: [], ambulances: [], bookings: [], notifications: [], activity: [],
    zones: base.zones,
    settings: { ...base.settings, organisationName: 'RapidRescue' },
    counters: { booking: 0 },
  };
}
