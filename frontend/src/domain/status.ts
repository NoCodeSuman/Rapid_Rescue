import type { AmbulanceAvailability, AmbulanceType, BookingStatus, EmergencyType, OperationalStatus } from '../types';

/** Single source of truth for booking statuses: labels, badge tone, lifecycle and transition rules. */
export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export const BOOKING_STATUSES: BookingStatus[] = [
  'requested', 'assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled', 'rejected',
];

export const STATUS_META: Record<BookingStatus, { label: string; tone: Tone; description: string }> = {
  requested: { label: 'Requested', tone: 'warning', description: 'Waiting for a driver to accept or an admin to assign.' },
  assigned: { label: 'Assigned', tone: 'info', description: 'Assigned to a driver who has not accepted yet.' },
  accepted: { label: 'Accepted', tone: 'info', description: 'Driver accepted the assignment.' },
  on_the_way: { label: 'On the way', tone: 'info', description: 'Ambulance is heading to the pickup point (simulated).' },
  arrived: { label: 'Arrived at pickup', tone: 'info', description: 'Ambulance reached the pickup point (simulated).' },
  in_progress: { label: 'In transit', tone: 'info', description: 'Patient is being transported to the destination (simulated).' },
  completed: { label: 'Completed', tone: 'success', description: 'Trip finished.' },
  cancelled: { label: 'Cancelled', tone: 'danger', description: 'Booking was cancelled.' },
  rejected: { label: 'Rejected', tone: 'danger', description: 'Booking could not be served.' },
};

export const ACTIVE_STATUSES: BookingStatus[] = ['assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress'];
export const OPEN_STATUSES: BookingStatus[] = ['requested', ...ACTIVE_STATUSES];
export const TERMINAL_STATUSES: BookingStatus[] = ['completed', 'cancelled', 'rejected'];

export const isActive = (s: BookingStatus) => ACTIVE_STATUSES.includes(s);
export const isOpen = (s: BookingStatus) => OPEN_STATUSES.includes(s);
export const isTerminal = (s: BookingStatus) => TERMINAL_STATUSES.includes(s);

/** Allowed transitions. Anything not listed is rejected by the engine. */
export const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ['assigned', 'accepted', 'cancelled', 'rejected'],
  assigned: ['accepted', 'requested', 'assigned', 'cancelled'],
  accepted: ['on_the_way', 'assigned', 'cancelled'],
  on_the_way: ['arrived', 'cancelled'],
  arrived: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  rejected: [],
};

export const canTransition = (from: BookingStatus, to: BookingStatus) => TRANSITIONS[from].includes(to);
export const canCancel = (s: BookingStatus) => canTransition(s, 'cancelled');

/** Driver lifecycle actions mapped to canonical statuses. */
export const DRIVER_TRIP_ACTIONS: Partial<Record<BookingStatus, { to: BookingStatus; label: string }>> = {
  accepted: { to: 'on_the_way', label: 'Start trip (head to pickup)' },
  on_the_way: { to: 'arrived', label: 'Confirm pickup & start trip' },
  arrived: { to: 'in_progress', label: 'Start transport' },
  in_progress: { to: 'completed', label: 'Complete trip' },
};

/** Timeline steps for the happy path (cancelled/rejected shown separately). */
export const TIMELINE_STEPS: BookingStatus[] = ['requested', 'accepted', 'on_the_way', 'arrived', 'in_progress', 'completed'];

export const EMERGENCY_LABELS: Record<EmergencyType, string> = {
  cardiac: 'Cardiac / chest pain', accident: 'Road accident / injury', breathing: 'Breathing difficulty', stroke: 'Suspected stroke',
  pregnancy: 'Pregnancy / labour', transfer: 'Inter-hospital transfer', other: 'Other',
};
export const AMBULANCE_TYPE_LABELS: Record<AmbulanceType, string> = {
  basic: 'Basic Life Support', advanced: 'Advanced Life Support', icu: 'Mobile ICU',
};
export const AVAILABILITY_META: Record<AmbulanceAvailability, { label: string; tone: Tone }> = {
  available: { label: 'Available', tone: 'success' }, busy: { label: 'Busy', tone: 'warning' }, offline: { label: 'Offline', tone: 'neutral' },
};
export const OPERATIONAL_META: Record<OperationalStatus, { label: string; tone: Tone }> = {
  in_service: { label: 'In service', tone: 'success' }, maintenance: { label: 'Maintenance', tone: 'warning' }, out_of_service: { label: 'Out of service', tone: 'danger' },
};

const TYPE_RANK: Record<AmbulanceType, number> = { basic: 1, advanced: 2, icu: 3 };
/** An ambulance satisfies a request when its capability is equal to or higher than requested. */
export const typeSatisfies = (have: AmbulanceType, need: AmbulanceType) => TYPE_RANK[have] >= TYPE_RANK[need];
