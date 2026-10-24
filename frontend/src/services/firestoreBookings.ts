/** Firestore persistence and live synchronization for patient bookings and driver requests. */
import { getFirebaseAuth, getFirebaseDb } from '../lib/firebase';
import { appStore } from './store';
import type { Booking, UserRole } from '../types';
import { isValidUtr } from '../domain/payment';
import type { LocationPoint } from '../types';

function bookingFromDoc(id: string, data: Record<string, unknown>): Booking {
  return { ...data, id } as unknown as Booking;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).map(([k, v]) => [k, stripUndefined(v)]));
  }
  return value;
}

export async function saveBookingToFirestore(booking: Booking): Promise<void> {
  const auth = getFirebaseAuth();
  const uid = auth?.currentUser?.uid;
  if (!auth || !uid) throw new Error('You must be signed in to save a booking.');
  const db = await getFirebaseDb();
  if (!db) throw new Error('Firebase Firestore is not configured.');
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const patientFirebaseUid = booking.patientFirebaseUid || (booking.patientId === appStore.getState().users.find(u => u.email.toLowerCase() === auth.currentUser?.email?.toLowerCase())?.id ? uid : undefined);
  const driverFirebaseUid = booking.driverFirebaseUid || undefined;
  const payload = stripUndefined({
    ...booking, patientFirebaseUid, driverFirebaseUid: driverFirebaseUid ?? null,
    updatedAt: booking.updatedAt, firestoreUpdatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, 'bookings', booking.id), payload as Record<string, unknown>, { merge: true });
}

/** Exact-document lookup used for immediate duplicate feedback; the transaction remains the race-safe check. */
export async function isUtrAvailableInFirestore(utr: string): Promise<boolean> {
  if (!isValidUtr(utr)) return false;
  const db = await getFirebaseDb();
  if (!db) throw new Error('Firebase Firestore is not configured, so this UTR cannot be checked against the database.');
  const { doc, getDoc } = await import('firebase/firestore');
  const claim = await getDoc(doc(db, 'paymentUtrs', utr));
  return !claim.exists();
}

/** Create the booking and claim its upfront UTR in one atomic transaction. */
export async function saveNewBookingWithUtrClaim(booking: Booking): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) throw new Error('You must be signed in to save a booking.');
  const db = await getFirebaseDb();
  if (!db) throw new Error('Firebase Firestore is not configured.');
  const utr = booking.payment?.upfrontUtr;
  if (!utr || !isValidUtr(utr)) throw new Error('Enter a valid 16-digit UTR number.');
  const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');
  const patientFirebaseUid = booking.patientFirebaseUid || auth.currentUser.uid;
  const payload = stripUndefined({ ...booking, patientFirebaseUid, driverFirebaseUid: null, updatedAt: booking.updatedAt, firestoreUpdatedAt: serverTimestamp() }) as Record<string, unknown>;
  await runTransaction(db, async (transaction) => {
    const claimRef = doc(db, 'paymentUtrs', utr);
    const existingClaim = await transaction.get(claimRef);
    if (existingClaim.exists()) throw new Error('Invalid UTR Number. This UTR is already in use.');
    transaction.set(doc(db, 'bookings', booking.id), payload);
    transaction.set(claimRef, { utr, bookingId: booking.id, stage: 'upfront', createdAt: serverTimestamp() });
  });
}

/** Persist only the two balance receipt fields so patient completion writes do not resend trip data. */
export async function saveBalancePaymentToFirestore(booking: Booking): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) throw new Error('Sign in before submitting the balance UTR.');
  if (!booking.payment?.balanceUtr || !booking.payment.balanceSubmittedAt) throw new Error('Balance payment details are incomplete.');
  const db = await getFirebaseDb();
  if (!db) throw new Error('Firebase Firestore is not configured.');
  const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');
  const utr = booking.payment.balanceUtr;
  if (!isValidUtr(utr) || utr === booking.payment.upfrontUtr) throw new Error('Invalid UTR Number. Use a different 16-digit UTR for the balance payment.');
  await runTransaction(db, async (transaction) => {
    const bookingRef = doc(db, 'bookings', booking.id);
    const claimRef = doc(db, 'paymentUtrs', utr);
    const [remoteBooking, existingClaim] = await Promise.all([transaction.get(bookingRef), transaction.get(claimRef)]);
    if (existingClaim.exists()) throw new Error('Invalid UTR Number. This UTR is already in use.');
    if (!remoteBooking.exists()) throw new Error('Booking not found in the database.');
    const remote = remoteBooking.data();
    if (remote.patientFirebaseUid !== auth.currentUser!.uid || remote.status !== 'completed') throw new Error('Only the patient can submit balance payment after trip completion.');
    if (!remote.payment || remote.payment.balanceUtr) throw new Error('Balance payment has already been submitted.');
    if (remote.payment.upfrontUtr === utr) throw new Error('Invalid UTR Number. Use a different UTR for the balance payment.');
    transaction.update(bookingRef, {
      'payment.balanceUtr': utr,
      'payment.balanceSubmittedAt': booking.payment!.balanceSubmittedAt,
      firestoreUpdatedAt: serverTimestamp(),
    });
    transaction.set(claimRef, { utr, bookingId: booking.id, stage: 'balance', createdAt: serverTimestamp() });
  });
}

/** Admin-only migration for UTRs saved before the global uniqueness registry existed. */
export async function indexExistingPaymentUtrs(bookings: Booking[]): Promise<void> {
  const db = await getFirebaseDb();
  if (!db) return;
  const auth = getFirebaseAuth()?.currentUser;
  if (!auth) return;
  const { doc, runTransaction, serverTimestamp } = await import('firebase/firestore');
  const existing = bookings.flatMap((b) => [
    b.payment?.upfrontUtr ? { booking: b, utr: b.payment.upfrontUtr, stage: 'upfront' as const } : null,
    b.payment?.balanceUtr ? { booking: b, utr: b.payment.balanceUtr, stage: 'balance' as const } : null,
  ]).filter((row): row is { booking: Booking; utr: string; stage: 'upfront' | 'balance' } => Boolean(row && isValidUtr(row.utr)));
  for (const row of existing) {
    await runTransaction(db, async (transaction) => {
      const claimRef = doc(db, 'paymentUtrs', row.utr);
      const claim = await transaction.get(claimRef);
      if (!claim.exists()) transaction.set(claimRef, { utr: row.utr, bookingId: row.booking.id, stage: row.stage, createdAt: serverTimestamp() });
    });
  }
}

/** Publish only the current driver's GPS fields; Firestore rules limit this to the assigned driver en route to pickup. */
export async function saveDriverLocationToFirestore(booking: Booking, location: LocationPoint): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth?.currentUser) throw new Error('Sign in as the assigned driver to share your location.');
  const db = await getFirebaseDb();
  if (!db) throw new Error('Firebase Firestore is not configured.');
  const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
  await updateDoc(doc(db, 'bookings', booking.id), {
    driverLocationPrevious: booking.driverLocationPrevious ?? null,
    driverLocationPreviousAt: booking.driverLocationPreviousAt ?? null,
    driverLocation: location,
    driverLocationUpdatedAt: booking.driverLocationUpdatedAt,
    firestoreUpdatedAt: serverTimestamp(),
  });
}

/** Subscribe to only the records a signed-in user is allowed to query under firestore.rules. */
export async function subscribeToRemoteBookings(uid: string, role: UserRole): Promise<() => void> {
  const db = await getFirebaseDb();
  if (!db) return () => undefined;
  const { collection, onSnapshot, query, where } = await import('firebase/firestore');
  const coll = collection(db, 'bookings');
  const records = new Map<string, Booking>();
  const unsubscribers: Array<() => void> = [];
  const attach = (q: ReturnType<typeof query>, key: string) => onSnapshot(q, (snap) => {
    // Each query is authoritative only for its own slice; rebuild from the union of active slices.
    const slice = new Map(snap.docs.map(d => [d.id, bookingFromDoc(d.id, d.data() as Record<string, unknown>)]));
    for (const [id, value] of slice) records.set(`${key}:${id}`, value);
    for (const id of [...records.keys()]) if (id.startsWith(`${key}:`) && !slice.has(id.slice(key.length + 1))) records.delete(id);
    const unique = new Map<string, Booking>();
    for (const b of records.values()) unique.set(b.id, b);
    appStore.replaceRemoteBookings([...unique.values()]);
  }, (error) => console.error('RapidRescue booking sync failed:', error.code, error.message));

  if (role === 'patient') unsubscribers.push(attach(query(coll, where('patientFirebaseUid', '==', uid)), 'patient'));
  if (role === 'driver') {
    unsubscribers.push(attach(query(coll, where('status', '==', 'requested')), 'requests'));
    unsubscribers.push(attach(query(coll, where('driverFirebaseUid', '==', uid)), 'assigned'));
  }
  // Administrators receive every booking through subscribeToAdminAppData (rules grant admins read access).
  return () => unsubscribers.forEach(fn => fn());
}
