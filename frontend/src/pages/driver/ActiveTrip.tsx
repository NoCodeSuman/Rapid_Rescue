import { Phone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BookingTimeline } from '../../components/common/BookingTimeline';
import { bookingMarkers } from '../../components/common/BookingDetails';
import { PageHeading } from '../../components/common/PageHeading';
import { MapView } from '../../components/maps/MapView';
import { StatusBadge } from '../../components/ui/Badge';
import { Button, LinkButton } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Alert, DemoNotice, EmptyState } from '../../components/ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { activeDriverBooking, ambulanceById, driverByUserId, userById } from '../../domain/selectors';
import { DRIVER_TRIP_ACTIONS, EMERGENCY_LABELS } from '../../domain/status';
import { simulatedPosition } from '../../domain/tracking';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { services } from '../../services';
import { formatEta, formatKm } from '../../utils/format';

export default function ActiveTrip() {
  const { user } = useAuth();
  const state = useAppState();
  const { run, busy } = useAction();
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [gpsMessage, setGpsMessage] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const lastGpsWrite = useRef(0);
  const driver = user ? driverByUserId(state, user.id) : undefined;
  const b = driver ? activeDriverBooking(state, driver.id) : undefined;
  const amb = b ? ambulanceById(state, b.ambulanceId) : undefined;
  const patient = b ? userById(state, b.patientId) : undefined;
  const action = b ? DRIVER_TRIP_ACTIONS[b.status] : undefined;
  useEffect(() => {
    if (!b || !['accepted', 'on_the_way', 'in_progress'].includes(b.status)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [b?.id, b?.status]);
  const pos = b ? simulatedPosition(b, amb, now) : null;
  const route = b && pos ? (['arrived', 'in_progress', 'completed'].includes(b.status) ? [b.pickup, b.destination] : [pos, b.pickup]) : undefined;

  useEffect(() => {
    if (!user || !b || b.status !== 'on_the_way') { setGpsMessage(undefined); return; }
    if (!navigator.geolocation) { setGpsMessage('This browser does not support GPS sharing. The patient will see simulated movement.'); return; }
    setGpsMessage('Waiting for a GPS fix from this device…');
    const watchId = navigator.geolocation.watchPosition(async ({ coords }) => {
      const now = Date.now();
      if (now - lastGpsWrite.current < 5000) return;
      lastGpsWrite.current = now;
      const point = {
        lat: coords.latitude,
        lng: coords.longitude,
        label: `Driver GPS · ±${Math.max(1, Math.round(coords.accuracy))} m`,
      };
      try {
        await services.bookings.updateDriverLocation(user.id, b.id, point);
        setGpsMessage('Live GPS location is being shared with the patient.');
      } catch {
        setGpsMessage('Could not share this GPS update. Check your connection and location permission.');
      }
    }, (error) => {
      setGpsMessage(error.code === 1
        ? 'Location permission is off. Allow location access so the patient can see the ambulance on the map.'
        : 'Waiting for device GPS. Keep location services enabled while travelling to pickup.');
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [user?.id, b?.id, b?.status]);

  if (!user || !driver) return <Alert tone="danger">Driver profile not found.</Alert>;

  const advance = (to: Parameters<typeof services.bookings.advanceTrip>[2], msg: string) => b && run('adv', async () => {
    const updated = await services.bookings.advanceTrip(user.id, b.id, to);
    // Keep each Firestore status change on the allowed lifecycle path, then start the hospital leg immediately.
    if (b.status === 'on_the_way' && to === 'arrived') return services.bookings.advanceTrip(user.id, b.id, 'in_progress');
    return updated;
  }, msg);

  return (
    <>
      <PageHeading title="Active trip" description="Move the current booking trip through each step." crumbs={[{ label: 'Driver', to: '/driver/dashboard' }, { label: 'Active trip' }]} />
      <DemoNotice className="mb-5" />
      {!b ? <Card><EmptyState title="No active trip" hint="Accept a request to start a booking trip." action={<LinkButton to="/driver/requests">View requests</LinkButton>} /></Card> : (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {b.status === 'on_the_way' && gpsMessage && <Alert tone={gpsMessage.startsWith('Live GPS') ? 'success' : 'info'} title="Ambulance location">{gpsMessage}</Alert>}
            <Card><CardBody><MapView title="Active trip" markers={bookingMarkers(b, amb, now)} route={route} height="h-72 md:h-96" /></CardBody></Card>
            <Card>
              <CardHeader title={b.ref} action={<StatusBadge status={b.status} />} />
              <CardBody className="grid gap-4 text-sm sm:grid-cols-2">
                <dl className="space-y-1.5">
                  <div><dt className="inline text-ink-soft">Pickup: </dt><dd className="inline">{b.pickup.label}</dd></div>
                  <div><dt className="inline text-ink-soft">Destination: </dt><dd className="inline">{b.destination.label}</dd></div>
                  <div><dt className="inline text-ink-soft">Emergency: </dt><dd className="inline">{EMERGENCY_LABELS[b.emergencyType]}</dd></div>
                  <div><dt className="inline text-ink-soft">Notes: </dt><dd className="inline whitespace-pre-line">{b.notes}</dd></div>
                  <div><dt className="inline text-ink-soft">Simulated ETA / distance: </dt><dd className="inline">{b.eta ? `${formatEta(b.eta.minutes)} · ${formatKm(b.eta.distanceKm)} (illustrative)` : 'Not available'}</dd></div>
                </dl>
                <div className="rounded-lg bg-surface-muted p-3">
                  <p className="text-xs font-medium uppercase text-ink-soft">Patient contact details</p>
                  <p className="mt-1 font-medium">{patient?.name ?? b.contactName}</p>
                  <p className="flex items-center gap-1 text-ink-soft"><Phone className="h-3.5 w-3.5" aria-hidden />{b.contactPhone}</p>
                </div>
              </CardBody>
              <div className="flex flex-wrap gap-2 border-t border-surface-border px-5 py-3">
                {b.status === 'assigned' ? (<>
                  <Button loading={busy} onClick={() => run('acc', () => services.bookings.driverAccept(user.id, b.id), `Accepted ${b.ref} (illustrative).`)}>Accept assignment</Button>
                  <Button variant="outline" disabled={busy} onClick={() => run('rej', () => services.bookings.driverReject(user.id, b.id), 'Assignment declined; the request returns to the queue.')}>Decline assignment</Button>
                </>) : action ? (
                  <Button size="lg" loading={busy} onClick={() => (action.to === 'completed' ? setConfirmComplete(true) : advance(action.to, `Trip updated: ${action.label} (illustrative).`))}>{action.label}</Button>
                ) : null}
              </div>
            </Card>
          </div>
          <Card className="self-start"><CardHeader title="Trip progress" /><CardBody><BookingTimeline booking={b} /></CardBody></Card>
        </div>
      )}
      <ConfirmDialog open={confirmComplete} onClose={() => setConfirmComplete(false)} loading={busy} title="Complete this trip?" confirmLabel="Complete trip"
        message={<p>Mark <strong>{b?.ref}</strong> as completed. Your ambulance will become available again.</p>}
        onConfirm={async () => { if (b) { const r = await advance('completed', 'Trip completed (illustrative).'); if (r) setConfirmComplete(false); } }} />
    </>
  );
}
