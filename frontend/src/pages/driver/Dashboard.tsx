import { Bell, CheckCircle2, ClipboardList, Navigation, Truck } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { PageHeading } from '../../components/common/PageHeading';
import { StatCard } from '../../components/common/StatCard';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Button, LinkButton } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Toggle } from '../../components/ui/Field';
import { Alert, EmptyState } from '../../components/ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { activeDriverBooking, ambulanceById, driverByUserId, driverStats } from '../../domain/selectors';
import { AVAILABILITY_META, AMBULANCE_TYPE_LABELS } from '../../domain/status';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { services } from '../../services';
import { formatEta } from '../../utils/format';

export default function DriverDashboard() {
  const { user } = useAuth();
  const state = useAppState();
  const { run, busy } = useAction();
  const driver = useMemo(() => (user ? driverByUserId(state, user.id) : undefined), [state, user]);
  if (!user || !driver) return <Alert tone="danger">Driver profile not found.</Alert>;
  const amb = ambulanceById(state, driver.ambulanceId);
  const active = activeDriverBooking(state, driver.id);
  const stats = driverStats(state, driver);
  const online = driver.availability === 'online';

  const toggle = (v: boolean) => run('avail', () => services.drivers.setAvailability(user.id, driver.id, v ? 'online' : 'offline'), v ? 'You are online and eligible for requests (illustrative).' : 'You are offline and will not receive requests (illustrative).');

  return (
    <>
      <PageHeading title={`Welcome, ${user.name.split(' ')[0]}`} description="Your driver operations console." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Availability" description="booking status (this device only)" />
          <CardBody className="space-y-4">
            <Toggle checked={online} onChange={toggle} disabled={busy || !!active} label={online ? 'Online — eligible for requests' : 'Offline — not eligible for requests'} description={active ? 'Finish your active trip before going offline.' : 'Going offline removes you from dispatch candidates.'} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={online ? 'success' : 'neutral'}>{online ? 'Online' : 'Offline'}</Badge>
              {amb ? (
                <Badge tone={AVAILABILITY_META[amb.availability].tone}>{amb.registration}: {AVAILABILITY_META[amb.availability].label}</Badge>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge tone="warning">No ambulance assigned</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy}
                    onClick={() => run('equip-dash', () => services.drivers.equipAmbulance(user.id, driver.id, null), 'Ambulance equipped for your shift.')}
                  >
                    <Truck className="h-3.5 w-3.5 mr-1" aria-hidden />
                    Equip ambulance
                  </Button>
                </div>
              )}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Profile summary" action={<Link to="/driver/profile" className="text-sm font-medium text-brand-700 hover:underline">View</Link>} />
          <CardBody className="space-y-1 text-sm"><p className="font-medium">{user.name}</p><p className="text-ink-soft">{driver.driverCode} · {user.phone || 'Phone not set'}</p><p className="text-ink-soft">{amb ? `${amb.registration} · ${AMBULANCE_TYPE_LABELS[amb.type]}` : 'No ambulance assigned'}</p></CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending requests" hint="local data" value={stats.pending} icon={Bell} tone="warning" />
        <StatCard label="Today's trips" hint="local data" value={stats.todayTrips} icon={ClipboardList} tone="navy" />
        <StatCard label="Completed trips" hint="local data" value={stats.completed} icon={CheckCircle2} tone="success" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Assigned / current booking" description="local data" />
          {active ? (
            <CardBody className="space-y-2 text-sm">
              <p className="flex items-center gap-2"><span className="font-semibold">{active.ref}</span><StatusBadge status={active.status} /></p>
              <p><span className="text-ink-soft">Pickup:</span> {active.pickup.label}</p><p><span className="text-ink-soft">Destination:</span> {active.destination.label}</p>
              <p><span className="text-ink-soft">Simulated ETA to pickup:</span> {active.eta ? `${formatEta(active.eta.minutes)} (illustrative)` : 'Not available'}</p>
              <LinkButton to="/driver/active-trip" className="mt-2"><Navigation className="h-4 w-4" aria-hidden />Open active trip</LinkButton>
            </CardBody>
          ) : <EmptyState icon={Truck} title="No current assignment" hint={online ? 'Check Assigned Requests for open requests.' : 'Go online to receive requests.'} action={<LinkButton to="/driver/requests" variant="outline">Assigned requests</LinkButton>} />}
        </Card>
        <Card>
          <CardHeader title="Quick actions" />
          <CardBody className="grid gap-2"><LinkButton to="/driver/requests" variant="outline">Assigned requests</LinkButton><LinkButton to="/driver/active-trip" variant="outline">Active trip</LinkButton><LinkButton to="/driver/trip-history" variant="outline">Trip history</LinkButton><LinkButton to="/driver/profile" variant="outline">Profile</LinkButton></CardBody>
        </Card>
      </div>
    </>
  );
}
