/** Domain types. All timestamps are ISO-8601 strings. All records reference each other by stable id. */

export type UserRole = 'patient' | 'driver' | 'admin';
export type UserStatus = 'active' | 'inactive';

export interface User {
  id: string;
  /** Firebase Auth UID of the person this record belongs to (set for accounts created through Firebase registration). */
  firebaseUid?: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PatientProfile {
  userId: string;
  /** Firebase UID of the owner plus denormalised contact details so an administrator can list the patient. */
  userFirebaseUid?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
}

export type AmbulanceType = 'basic' | 'advanced' | 'icu';
export type AmbulanceAvailability = 'available' | 'busy' | 'offline';
export type OperationalStatus = 'in_service' | 'maintenance' | 'out_of_service';
export type DriverAvailability = 'online' | 'offline';

export interface LocationPoint {
  lat: number;
  lng: number;
  label: string;
}

/** Mock road assumptions used by the ETA simulation. Not real routing data. */
export interface RouteProfile {
  label: string;
  avgSpeedKmh: number;
  detourFactor: number;
  note: string;
}

export interface Driver {
  id: string;
  userId: string;
  /** Firebase UID of the driver's account; lets admin-created assignments reach the driver's device. */
  userFirebaseUid?: string;
  /** Denormalised contact details written by the driver's own client so the admin console can show who registered. */
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  driverCode: string;
  licenseNumber: string;
  ambulanceId: string | null;
  availability: DriverAvailability;
  updatedAt: string;
  // Document verification by admin
  governmentIdNumber?: string;
  governmentIdType?: string; // 'aadhar' | 'pan' | 'passport' | 'voter_id' | 'driving_licence'
  licenseExpiry?: string; // ISO date string
  vehicleRegistrationNumber?: string; // ambulance registration for verification
  documentsVerified?: boolean;
  documentsVerifiedAt?: string;
  documentsVerifiedBy?: string; // admin user ID
  documentNotes?: string;
}

export interface Ambulance {
  id: string;
  registration: string;
  type: AmbulanceType;
  operationalStatus: OperationalStatus;
  availability: AmbulanceAvailability;
  driverId: string | null;
  location: LocationPoint;
  routeProfile: RouteProfile;
  updatedAt: string;
}

export type BookingStatus =
  | 'requested'
  | 'assigned'
  | 'accepted'
  | 'on_the_way'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type EmergencyType = 'cardiac' | 'accident' | 'breathing' | 'stroke' | 'pregnancy' | 'transfer' | 'other';

export interface ETAEstimate {
  minutes: number;
  distanceKm: number;
  computedAt: string;
  simulated: true;
}

export interface StatusEvent {
  status: BookingStatus;
  at: string;
  byUserId: string | null;
  note?: string;
}

export interface Booking {
  id: string;
  ref: string;
  patientId: string;
  /** Firebase Auth UID used for cross-device Firestore security and ownership. */
  patientFirebaseUid?: string;
  /** Firebase Auth UID of the driver who accepted/owns this request. */
  driverFirebaseUid?: string;
  contactName: string;
  contactPhone: string;
  pickup: LocationPoint;
  destination: LocationPoint;
  emergencyType: EmergencyType;
  notes: string;
  ambulanceType: AmbulanceType;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
  driverId: string | null;
  ambulanceId: string | null;
  eta: ETAEstimate | null;
  /** UTR submissions are recorded as pending verification; this app does not verify bank payments. */
  payment?: BookingPayment | null;
  /** Most recent GPS point published by the assigned driver's device while travelling to pickup. */
  driverLocation?: LocationPoint;
  driverLocationUpdatedAt?: string;
  /** Previous fix and timestamp let the patient map animate smoothly between device GPS updates. */
  driverLocationPrevious?: LocationPoint;
  driverLocationPreviousAt?: string;
  reason?: string;
  /** Drivers who declined this request; it remains available to others. */
  declinedByDriverIds: string[];
  history: StatusEvent[];
}

export interface BookingPayment {
  totalInr: number;
  upfrontInr: number;
  balanceInr: number;
  upfrontUtr: string;
  upfrontSubmittedAt: string;
  balanceUtr?: string;
  balanceSubmittedAt?: string;
}

export interface DispatchCandidate {
  ambulanceId: string;
  driverId: string | null;
  distanceKm: number;
  etaMinutes: number | null;
  eligible: boolean;
  reasons: string[];
}

export interface DispatchRecommendation {
  bookingId: string;
  candidates: DispatchCandidate[];
  recommended: DispatchCandidate | null;
  nearestEligible: DispatchCandidate | null;
  explanation: string;
}

export interface DemandZone {
  id: string;
  name: string;
  center: LocationPoint;
  radiusKm: number;
  baseDemand: number;
}

export interface Notification {
  id: string;
  userId: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface ActivityEntry {
  id: string;
  at: string;
  actorId: string | null;
  message: string;
  bookingId?: string;
}

export interface ApplicationSettings {
  organisationName: string;
  toastsEnabled: boolean;
  notifyBookingUpdates: boolean;
  notifyAssignments: boolean;
  compactTables: boolean;
  defaultPageSize: 5 | 10 | 20;
  /** Admin-configured UPI QR image, stored as a small data URL for this prototype. */
  upiQrCodeDataUrl: string | null;
  /** UPI VPA used to generate amount-specific payment QR codes. */
  upiPaymentAddress: string;
  fareBaseInr: number;
  farePerKmInr: number;
}

export interface AppState {
  users: User[];
  profiles: PatientProfile[];
  drivers: Driver[];
  ambulances: Ambulance[];
  bookings: Booking[];
  zones: DemandZone[];
  notifications: Notification[];
  activity: ActivityEntry[];
  settings: ApplicationSettings;
  counters: { booking: number };
}

export type Result<T> = { ok: true; state: AppState; value: T } | { ok: false; error: string };

/** Application profile stored in Firestore users/{uid}. Separate from the Firebase Auth identity. */
export interface RemoteProfile {
  uid: string;
  displayName: string;
  phoneNumber: string;
  /** Trusted: clients can only self-declare patient/driver at creation; admin is set via a privileged write. */
  role: UserRole;
  accountStatus: UserStatus;
  schemaVersion: number;
  createdAt: string | null;
  updatedAt: string | null;
}
