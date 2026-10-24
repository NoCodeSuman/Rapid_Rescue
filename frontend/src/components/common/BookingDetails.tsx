import { useEffect, useMemo, useState } from 'react';
import { ambulanceLabel, ambulanceById, driverById, driverName, userById } from '../../domain/selectors';
import { AMBULANCE_TYPE_LABELS, EMERGENCY_LABELS } from '../../domain/status';
import { simulatedPosition } from '../../domain/tracking';
import { etaRemainingSeconds } from '../../domain/tracking';
import { haversineKm } from '../../lib/geo';
import { useAppState } from '../../hooks/useAppState';
import type { Booking } from '../../types';
import { formatDateTime, formatEta, formatKm } from '../../utils/format';
import { MapView, type MapMarker } from '../maps/MapView';
import { StatusBadge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { BookingTimeline } from './BookingTimeline';

export function bookingMarkers(b: Booking, amb: ReturnType<typeof ambulanceById>, now: number = Date.now()): MapMarker[] {
  const pos = simulatedPosition(b, amb, now);
  const m: MapMarker[] = [
    { id: 'p', kind: 'pickup', lat: b.pickup.lat, lng: b.pickup.lng, label: b.pickup.label },
    { id: 'd', kind: 'destination', lat: b.destination.lat, lng: b.destination.lng, label: b.destination.label },
  ];
  if (pos) m.push({ id: 'a', kind: 'ambulance', lat: pos.lat, lng: pos.lng, label: pos.label });
  return m;
}

const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-2 py-1.5 text-sm"><dt className="text-ink-soft">{k}</dt><dd className="col-span-2 break-words text-ink">{v}</dd></div>
);

/** Booking detail dialog shared by patient, driver and admin views. `showPatient` reveals patient contact (admin/driver). */
export function BookingDetailsDialog({ bookingId, onClose, showPatient }: { bookingId: string | null; onClose: () => void; showPatient?: boolean }) {
  const state = useAppState();
  const [now, setNow] = useState(() => Date.now());
  const b = useMemo(() => state.bookings.find((x) => x.id === bookingId) ?? null, [state.bookings, bookingId]);
  const amb = b ? ambulanceById(state, b.ambulanceId) : undefined;
  const driver = b ? driverById(state, b.driverId) : undefined;
  useEffect(() => {
    if (!bookingId || !b || !['accepted', 'on_the_way', 'in_progress'].includes(b.status)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [bookingId, b?.status]);
  const position = b ? simulatedPosition(b, amb, now) : null;
  const route = b && position
    ? (['arrived', 'in_progress', 'completed'].includes(b.status) ? [b.pickup, b.destination] : [position, b.pickup])
    : undefined;
  const remainingEta = b?.eta && ['accepted', 'on_the_way'].includes(b.status) ? etaRemainingSeconds(b, now) : null;
  const distanceToHospital = b && position && ['arrived', 'in_progress'].includes(b.status)
    ? haversineKm(position, b.destination) : null;
  return (
    <Dialog open={!!bookingId} onClose={onClose} title={b ? `Booking ${b.ref}` : 'Booking'} description="booking — simulated data" size="lg" footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      {!b ? <p className="text-sm text-ink-soft">This booking could not be found. It may have been removed by a booking reset.</p> : (
        <div className="grid gap-6 md:grid-cols-2">
          <dl className="divide-y divide-surface-border">
            <Row k="Status" v={<StatusBadge status={b.status} />} />
            <Row k="Created" v={formatDateTime(b.createdAt)} />
            <Row k="Updated" v={formatDateTime(b.updatedAt)} />
            {showPatient && <Row k="Patient" v={`${userById(state, b.patientId)?.name ?? 'Unknown'} · ${b.contactPhone}`} />}
            <Row k="Contact" v={b.contactName} />
            <Row k="Pickup" v={b.pickup.label} />
            <Row k="Destination" v={b.destination.label} />
            <Row k="Emergency type" v={EMERGENCY_LABELS[b.emergencyType]} />
            <Row k="Ambulance type" v={AMBULANCE_TYPE_LABELS[b.ambulanceType]} />
            <Row k="Condition / notes" v={<span className="whitespace-pre-line">{b.notes || '—'}</span>} />
            <Row k="Driver" v={driverName(state, b.driverId) ?? 'Not assigned'} />
            <Row k="Driver ID" v={driver?.driverCode ?? '—'} />
            <Row k="Ambulance" v={ambulanceLabel(state, b.ambulanceId) ?? 'Not assigned'} />
            <Row k="Estimated arrival" v={remainingEta !== null
              ? remainingEta === 0 ? 'Arriving now' : `${Math.floor(remainingEta / 60)}m ${String(remainingEta % 60).padStart(2, '0')}s`
              : b.eta ? <>{formatEta(b.eta.minutes)} · {formatKm(b.eta.distanceKm)}</> : 'Not available'} />
            {distanceToHospital !== null && <Row k="Direct distance to hospital" v={`${distanceToHospital.toFixed(1)} km`} />}
            {b.reason && <Row k="Reason" v={b.reason} />}
          </dl>
          <div className="space-y-4">
            <BookingTimeline booking={b} />
            <MapView title="Booking tracking" markers={bookingMarkers(b, amb, now)} route={route} height="h-52" />
          </div>
        </div>
      )}
    </Dialog>
  );
}
