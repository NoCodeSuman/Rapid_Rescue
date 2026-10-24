import { CheckCircle2, ClipboardList, Navigation, Plus, Truck, User, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { bookingMarkers } from '../../components/common/BookingDetails';
import { PageHeading } from '../../components/common/PageHeading';
import { StatCard } from '../../components/common/StatCard';
import { MapView } from '../../components/maps/MapView';
import { StatusBadge } from '../../components/ui/Badge';
import { LinkButton } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { DemoNotice, EmptyState } from '../../components/ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { activePatientBooking, ambulanceById, ambulanceLabel, driverName, patientBookings, patientStats } from '../../domain/selectors';
import { etaRemainingSeconds, simulatedPosition } from '../../domain/tracking';
import { useAppState } from '../../hooks/useAppState';
import { formatDateTime, formatEta } from '../../utils/format';

export default function PatientDashboard() {
  const { user } = useAuth();
  const state = useAppState();
  const [now, setNow] = useState(() => Date.now());
  const stats = useMemo(() => (user ? patientStats(state, user.id) : { total: 0, active: 0, completed: 0, cancelled: 0 }), [state, user]);
  const active = user ? activePatientBooking(state, user.id) : undefined;
  useEffect(() => {
    if (!active || !['accepted', 'on_the_way', 'in_progress'].includes(active.status)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active?.id, active?.status]);
  const activeAmbulance = active ? ambulanceById(state, active.ambulanceId) : undefined;
  const activePosition = active ? simulatedPosition(active, activeAmbulance, now) : null;
  const activeRoute = active && activePosition
    ? (['arrived', 'in_progress', 'completed'].includes(active.status) ? [active.pickup, active.destination] : [activePosition, active.pickup])
    : undefined;
  const etaSeconds = active?.eta && ['accepted', 'on_the_way'].includes(active.status) ? etaRemainingSeconds(active, now) : null;
  const recent = useMemo(() => (user ? patientBookings(state, user.id).slice(0, 5) : []), [state, user]);
  const profile = state.profiles.find((p) => p.userId === user?.id);

  return (
    <>
      <PageHeading title={`Welcome, ${user?.name.split(' ')[0]}`} description="Your booking overview." actions={<LinkButton to="/patient/book-ambulance" variant="secondary"><Plus className="h-4 w-4" aria-hidden />Book ambulance</LinkButton>} />
      <DemoNotice className="mb-5" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total bookings" hint="local data" value={stats.total} icon={ClipboardList} tone="navy" />
        <StatCard label="Active bookings" hint="local data" value={stats.active} icon={Truck} tone="warning" />
        <StatCard label="Completed trips" hint="local data" value={stats.completed} icon={CheckCircle2} tone="success" />
        <StatCard label="Cancelled bookings" hint="local data" value={stats.cancelled} icon={XCircle} tone="danger" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Current active booking" description="Live GPS or animated trip progress" action={active && <LinkButton to="/patient/track-ambulance" size="sm" variant="outline"><Navigation className="h-4 w-4" aria-hidden />Open full map</LinkButton>} />
            {active ? (
              <CardBody className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2"><span className="font-semibold">{active.ref}</span><StatusBadge status={active.status} /></p>
                  <p><span className="text-ink-soft">From:</span> {active.pickup.label}</p><p><span className="text-ink-soft">To:</span> {active.destination.label}</p>
                  <p><span className="text-ink-soft">Driver:</span> {driverName(state, active.driverId) ?? 'Not assigned yet'}</p>
                  <p><span className="text-ink-soft">Ambulance:</span> {ambulanceLabel(state, active.ambulanceId) ?? 'Not assigned yet'}</p>
                  <p><span className="text-ink-soft">Estimated arrival:</span> {etaSeconds !== null ? (etaSeconds === 0 ? 'Arriving now' : `${Math.floor(etaSeconds / 60)}m ${String(etaSeconds % 60).padStart(2, '0')}s`) : active.eta ? `${formatEta(active.eta.minutes)} (illustrative)` : 'Not available'}</p>
                </div>
                <MapView title="Active ambulance tracking" markers={bookingMarkers(active, activeAmbulance, now)} route={activeRoute} height="h-60" />
              </CardBody>
            ) : <EmptyState title="No active booking" hint="When you book, your current booking and tracking preview appear here." action={<LinkButton to="/patient/book-ambulance">Book an ambulance</LinkButton>} />}
          </Card>
          <Card>
            <CardHeader title="Recent bookings" description="local data" action={<Link to="/patient/bookings" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
            {recent.length === 0 ? <EmptyState title="No bookings yet" /> : (
              <ul className="divide-y divide-surface-border">
                {recent.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div><Link to={`/patient/bookings?view=${b.id}`} className="font-medium text-navy-800 hover:underline">{b.ref}</Link><p className="text-xs text-ink-faint">{formatDateTime(b.createdAt)} · {b.pickup.label} → {b.destination.label}</p></div>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader title="Profile summary" action={<Link to="/patient/profile" className="text-sm font-medium text-brand-700 hover:underline">Edit</Link>} />
            <CardBody className="flex gap-3 text-sm"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-50 text-navy-700"><User className="h-5 w-5" aria-hidden /></span>
              <div><p className="font-medium">{user?.name}</p><p className="text-ink-soft">{user?.email}</p><p className="text-ink-soft">{user?.phone || 'Phone not set'}</p>{profile?.emergencyContactName && <p className="mt-1 text-xs text-ink-faint">Emergency contact: {profile.emergencyContactName} (this device only)</p>}</div></CardBody>
          </Card>
          <Card>
            <CardHeader title="Quick actions" />
            <CardBody className="grid gap-2">
              <LinkButton to="/patient/book-ambulance" variant="outline">Book ambulance</LinkButton>
              <LinkButton to="/patient/bookings" variant="outline">My bookings</LinkButton>
              <LinkButton to="/patient/track-ambulance" variant="outline">Track ambulance</LinkButton>
              <LinkButton to="/patient/profile" variant="outline">Edit profile</LinkButton>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
