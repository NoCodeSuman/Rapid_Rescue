import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BookingTimeline } from '../../components/common/BookingTimeline';
import { bookingMarkers } from '../../components/common/BookingDetails';
import { PageHeading } from '../../components/common/PageHeading';
import { MapView } from '../../components/maps/MapView';
import { StatusBadge } from '../../components/ui/Badge';
import { LinkButton } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Alert, DemoNotice, EmptyState } from '../../components/ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { ambulanceById, driverById, patientBookings, userById } from '../../domain/selectors';
import { STATUS_META, isOpen } from '../../domain/status';
import { etaRemainingSeconds, simulatedPosition } from '../../domain/tracking';
import { haversineKm } from '../../lib/geo';
import { useAppState } from '../../hooks/useAppState';
import { formatKm } from '../../utils/format';

export default function TrackAmbulance() {
  const { user } = useAuth();
  const state = useAppState();
  const [now, setNow] = useState(() => Date.now());
  const booking = useMemo(() => { const list = user ? patientBookings(state, user.id) : []; return list.find((b) => isOpen(b.status)) ?? list[0]; }, [state, user]);
  const amb = booking ? ambulanceById(state, booking.ambulanceId) : undefined;
  const driver = booking ? driverById(state, booking.driverId) : undefined;
  const driverUser = driver ? userById(state, driver.userId) : undefined;
  useEffect(() => {
    if (!booking || !['accepted', 'on_the_way', 'in_progress'].includes(booking.status)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [booking?.id, booking?.status]);
  const pos = booking ? simulatedPosition(booking, amb, now) : null;
  const assignmentMissing = !!booking && ['accepted', 'on_the_way', 'arrived', 'in_progress'].includes(booking.status)
    && (!booking.driverId || !booking.ambulanceId);
  const liveVehicleGps = !!booking?.driverLocation && !!booking.driverLocationUpdatedAt
    && booking.status === 'on_the_way' && now - new Date(booking.driverLocationUpdatedAt).getTime() < 30_000;
  const etaSeconds = booking?.eta && ['accepted', 'on_the_way'].includes(booking.status) ? etaRemainingSeconds(booking, now) : null;
  const etaLabel = etaSeconds !== null
    ? etaSeconds === 0 ? 'Arriving now' : `${Math.floor(etaSeconds / 60)}m ${String(etaSeconds % 60).padStart(2, '0')}s left`
    : booking?.status === 'arrived' ? 'At pickup'
      : booking?.status === 'in_progress' ? 'Transport in progress'
        : booking?.eta ? `${booking.eta.minutes} min` : 'Not available';
  const route = booking && pos ? (['arrived', 'in_progress', 'completed'].includes(booking.status)
    ? [booking.pickup, booking.destination] : [pos, booking.pickup]) : undefined;
  const hospitalDistanceKm = booking ? haversineKm(booking.pickup, booking.destination) : null;
  const displayedHospitalDistanceKm = booking?.status === 'in_progress' && pos
    ? haversineKm(pos, booking.destination) : hospitalDistanceKm;

  return (
    <>
      <PageHeading title="Track ambulance" description="Watch shared driver GPS or animated trip progress on the map." crumbs={[{ label: 'Patient', to: '/patient/dashboard' }, { label: 'Track ambulance' }]} />
      <DemoNotice className="mb-3" />
      <Alert tone={liveVehicleGps ? 'success' : assignmentMissing ? 'warning' : 'info'} className="mb-5" title={liveVehicleGps ? 'Live ambulance GPS' : assignmentMissing ? 'Simulated ambulance tracking' : 'Ambulance tracking'}>
        {liveVehicleGps ? 'The marker shows the latest location shared by the driver’s device.' : assignmentMissing
          ? 'This booking has no linked driver or ambulance yet, so the map shows an animated demo marker. Once assignment and driver GPS are synced, the patient map will show the shared vehicle location.'
          : 'The marker shows animated movement until the driver’s device shares GPS. Patient pickup is taken from your device when you choose Use my device location.'}
      </Alert>
      {!booking ? (
        <Card><EmptyState title="Nothing to track yet" hint="Create a booking to see its simulated progress here." icon={Truck} action={<LinkButton to="/patient/book-ambulance">Book an ambulance</LinkButton>} /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {!isOpen(booking.status) && <Alert tone="info">Showing your most recent booking ({booking.ref}), which is {STATUS_META[booking.status].label.toLowerCase()}. <Link to="/patient/book-ambulance" className="font-medium underline">Book a new one</Link>.</Alert>}
            <Card><CardBody><MapView title="Booking tracking" markers={bookingMarkers(booking, amb, now)} route={route} height="h-80 md:h-96" /></CardBody></Card>
            {hospitalDistanceKm !== null && ['arrived', 'in_progress'].includes(booking.status) && (
              <Card><CardBody className="flex items-center justify-between gap-4">
                <div><p className="text-sm font-semibold text-ink">{booking.status === 'in_progress' ? 'Remaining distance to hospital' : 'Pickup confirmed · distance to hospital'}</p><p className="mt-1 text-xs text-ink-soft">{booking.status === 'in_progress' ? 'Updates as the simulated ambulance moves.' : `Direct estimate from your pickup to ${booking.destination.label}.`}</p></div>
                <p className="shrink-0 text-xl font-semibold tabular-nums text-brand-700">{displayedHospitalDistanceKm?.toFixed(1)} km</p>
              </CardBody></Card>
            )}
          </div>
          <div className="space-y-5">
            <Card>
              <CardHeader title={booking.ref} action={<StatusBadge status={booking.status} />} />
              <CardBody>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-ink-soft">Pickup</dt><dd className="text-right">{booking.pickup.label}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-soft">Destination</dt><dd className="text-right">{booking.destination.label}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-soft">Driver</dt><dd className="text-right">{driverUser ? `${driverUser.name} (${driver!.driverCode})` : 'Not assigned yet'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-soft">Ambulance</dt><dd className="text-right">{amb?.registration ?? 'Not assigned yet'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-soft">Estimated arrival</dt><dd className="text-right tabular-nums" aria-live="polite">{booking.eta && isOpen(booking.status) ? `${etaLabel} (simulated)` : 'Not available'}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-ink-soft">Distance {['arrived', 'in_progress'].includes(booking.status) ? 'to hospital' : 'to pickup'}</dt><dd className="text-right">{['arrived', 'in_progress'].includes(booking.status) && displayedHospitalDistanceKm !== null ? `${displayedHospitalDistanceKm.toFixed(1)} km (direct)` : booking.eta && isOpen(booking.status) ? `${formatKm(booking.eta.distanceKm)} (estimate)` : 'Not available'}</dd></div>
                </dl>
              </CardBody>
            </Card>
            <Card><CardHeader title="Progress" /><CardBody><BookingTimeline booking={booking} /></CardBody></Card>
          </div>
        </div>
      )}
    </>
  );
}
