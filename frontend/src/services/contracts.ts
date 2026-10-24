/**
 * Service contracts. Pages and hooks depend on these interfaces only; this phase ships local/mock implementations.
 * AuthService is backed by Firebase Authentication (Phase 2). The data services below remain local/mock; no database
 * (Firestore or otherwise) exists yet.
 */
import type {
  Ambulance, Booking, BookingStatus, DispatchRecommendation, Driver, User, UserRole,
} from '../types';
import type { AmbulanceInput, BookingInput } from '../domain/engine';

/** Normalised Firebase identity. Deliberately excludes tokens and credentials. */
export interface AuthIdentity { uid: string; email: string; emailVerified: boolean; displayName: string | null }

export interface RegisterInput { name: string; email: string; phone: string; password: string; role: Exclude<UserRole, 'admin'> }

export interface RegisterResult { identity: AuthIdentity; verificationEmailSent: boolean; verificationError?: string }

/** Identity/authentication only (Firebase Authentication). No application data lives behind this interface. */
export interface AuthService {
  readonly configured: boolean;
  readonly configError: string | null;
  /** Observes Firebase auth state. Calls back with null when signed out. Returns an unsubscribe function. */
  subscribe(cb: (identity: AuthIdentity | null) => void): () => void;
  register(input: { name: string; email: string; password: string }): Promise<RegisterResult>;
  login(email: string, password: string): Promise<AuthIdentity>;
  logout(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  resendVerification(): Promise<void>;
  /** Reloads the user from Firebase so emailVerified is current; when verified, also refreshes the ID token so Firestore sees it. */
  reload(): Promise<AuthIdentity | null>;
  /** UID of the currently signed-in Firebase user, or null. */
  getCurrentUid(): string | null;
}

/** Developer-only offline demo accounts (never used in production builds). */
export interface DemoAuthService {
  getSessionUserId(): string | null;
  login(email: string, password: string): Promise<User>;
  logout(): void;
}

export interface BookingService {
  isUtrAvailable(utr: string): Promise<boolean>;
  create(patientUserId: string, input: BookingInput): Promise<Booking>;
  submitBalancePayment(patientUserId: string, bookingId: string, utr: string): Promise<Booking>;
  cancel(actorUserId: string, bookingId: string, reason?: string): Promise<Booking>;
  driverAccept(driverUserId: string, bookingId: string): Promise<Booking>;
  driverReject(driverUserId: string, bookingId: string): Promise<Booking>;
  advanceTrip(driverUserId: string, bookingId: string, to: BookingStatus): Promise<Booking>;
  updateDriverLocation(driverUserId: string, bookingId: string, location: import('../types').LocationPoint): Promise<void>;
  adminAssign(adminUserId: string, bookingId: string, ambulanceId: string): Promise<Booking>;
  adminSetStatus(adminUserId: string, bookingId: string, to: BookingStatus, reason?: string): Promise<Booking>;
}

export interface UserService {
  updateUser(actorId: string, userId: string, patch: { name: string; phone: string; status?: 'active' | 'inactive' }): Promise<User>;
  updatePatientProfile(userId: string, patch: { name: string; phone: string; address: string; emergencyContactName: string; emergencyContactPhone: string }): Promise<User>;
  updateOwnContact(userId: string, patch: { name: string; phone: string }): Promise<User>;
  markNotificationsRead(userId: string): Promise<void>;
}

export interface CreateDriverInput {
  name: string;
  email: string;
  phone: string;
  driverCode?: string;
  licenseNumber?: string;
  ambulanceId?: string | null;
  availability?: 'online' | 'offline';
}

export interface DriverService {
  setAvailability(actorId: string, driverId: string, availability: 'online' | 'offline'): Promise<Driver>;
  assignAmbulance(actorId: string, driverId: string, ambulanceId: string | null): Promise<Driver>;
  equipAmbulance(actorId: string, driverId: string, ambulanceId?: string | null): Promise<Driver>;
  createDriver(actorId: string, input: CreateDriverInput): Promise<Driver>;
  verifyDocuments(adminId: string, driverId: string, input: import('../domain/engine').DriverDocumentInput): Promise<Driver>;
}

export interface AmbulanceService {
  create(actorId: string, input: AmbulanceInput): Promise<Ambulance>;
  update(actorId: string, id: string, input: AmbulanceInput): Promise<Ambulance>;
  remove(actorId: string, id: string): Promise<void>;
}

export interface DispatchService {
  recommend(bookingId: string): DispatchRecommendation;
}

export interface SettingsService {
  update(patch: Partial<import('../types').ApplicationSettings>): Promise<void>;
  resetDemoData(): Promise<void>;
}

/** Registration choices carried to profile creation. Role is only ever honoured for patient/driver. */
export interface ProfileHint { displayName?: string; phoneNumber?: string; role?: 'patient' | 'driver' }

/** Application profile persistence (Firestore users/{uid}). Identity and credentials are NOT handled here. */
export interface ProfileService {
  /** Verified users: read the profile; if it does not exist, create a safe default (role patient unless a registration hint says patient/driver). Never overwrites. */
  loadOrCreate(identity: AuthIdentity, hint?: ProfileHint): Promise<import('../types').RemoteProfile>;
  /** Registration: create-only write (works before email verification). Fails if a profile already exists. */
  createForRegistration(identity: AuthIdentity, hint: Required<ProfileHint>): Promise<void>;
  /** Self-editable fields only. */
  update(uid: string, patch: { displayName: string; phoneNumber: string }): Promise<void>;
}
