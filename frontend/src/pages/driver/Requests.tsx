import { Check, Truck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BookingDetailsDialog } from '../../components/common/BookingDetails';
import { PageHeading } from '../../components/common/PageHeading';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Button, LinkButton } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Alert, EmptyState } from '../../components/ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { simulateEta } from '../../domain/dispatch';
import { activeDriverBooking, ambulanceById, driverByUserId, driverQueue } from '../../domain/selectors';
import { AMBULANCE_TYPE_LABELS, EMERGENCY_LABELS, typeSatisfies } from '../../domain/status';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { services } from '../../services';
import { formatDateTime, formatEta, formatKm } from '../../utils/format';

export default function Requests() {
  const { user } = useAuth();
  const state = useAppState();
  const { run, pending, busy } = useAction();
  const [view, setView] = useState<string | null>(null);
  const [selectedAmbId, setSelectedAmbId] = useState('');
  const driver = user ? driverByUserId(state, user.id) : undefined;
  const queue = useMemo(() => (driver ? driverQueue(state, driver) : []), [state, driver]);
  if (!user || !driver) return <Alert tone="danger">Driver profile not found.</Alert>;
  const amb = ambulanceById(state, driver.ambulanceId);
  const active = activeDriverBooking(state, driver.id);
  const online = driver.availability === 'online';

  const freeAmbs = useMemo(() => {
    return state.ambulances.filter((a) => (!a.driverId || a.driverId === driver.id) && a.operationalStatus === 'in_service');
  }, [state.ambulances, driver.id]);

  return (
    <>
      <PageHeading title="Assigned requests" description="requests you can accept or decline. Declining keeps the request available for other drivers." crumbs={[{ label: 'Driver', to: '/driver/dashboard' }, { label: 'Assigned requests' }]} />
      {!online && (
        <Alert tone="warning" className="mb-4" title="You are offline">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>You are offline. Go online to accept incoming requests.</span>
            <Button
              size="sm"
              loading={busy}
              onClick={() => run('go-online', () => services.drivers.setAvailability(user.id, driver.id, 'online'), 'You are now online.')}
            >
              Go online now
            </Button>
          </div>
        </Alert>
      )}
      {active && <Alert tone="info" className="mb-4" title={`You have an active trip (${active.ref})`}>Finish it before accepting another request. <LinkButton to="/driver/active-trip" size="sm" variant="outline" className="ml-2">Open trip</LinkButton></Alert>}
      {!amb ? (
        <Alert tone="warning" className="mb-4" title="No ambulance assigned">
          <div className="space-y-3">
            <p>An ambulance vehicle must be equipped for your shift before you can accept incoming emergency requests.</p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {freeAmbs.length > 0 && (
                <select
                  value={selectedAmbId}
                  onChange={(e) => setSelectedAmbId(e.target.value)}
                  className="rounded border border-surface-border bg-white px-3 py-1.5 text-xs font-medium"
                >
                  <option value="">Select vehicle from fleet...</option>
                  {freeAmbs.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.registration} · {AMBULANCE_TYPE_LABELS[a.type]}
                    </option>
                  ))}
                </select>
              )}
              <Button
                size="sm"
                loading={busy}
                onClick={async () => {
                  const ambToEquip = selectedAmbId || (freeAmbs[0]?.id ?? null);
                  await run('equip', () => services.drivers.equipAmbulance(user.id, driver.id, ambToEquip), 'Ambulance equipped! You can now accept requests.');
                }}
              >
                <Truck className="h-4 w-4 mr-1.5" aria-hidden />
                {selectedAmbId ? 'Equip selected ambulance' : freeAmbs[0] ? `Equip ${freeAmbs[0].registration} (${AMBULANCE_TYPE_LABELS[freeAmbs[0].type]})` : 'Equip default ambulance (RR-AMB-01 · Basic Life Support)'}
              </Button>
            </div>
          </div>
        </Alert>
      ) : (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface-subtle px-4 py-2.5 text-sm">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-brand-600" aria-hidden />
            <span>Active shift unit: <strong>{amb.registration}</strong> ({AMBULANCE_TYPE_LABELS[amb.type]})</span>
            <Badge tone="success">In service</Badge>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !!active}
            title={active ? 'Finish active trip before changing ambulance' : undefined}
            onClick={async () => {
              await run('unassign', () => services.drivers.assignAmbulance(user.id, driver.id, null), 'Ambulance unequipped.');
            }}
          >
            Change unit
          </Button>
        </div>
      )}
      {queue.length === 0 ? <Card><EmptyState title="No pending requests" hint="New bookings and admin assignments will appear here automatically." /></Card> : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {queue.map((b) => {
            const mismatch = amb ? !typeSatisfies(amb.type, b.ambulanceType) && b.status === 'requested' : false;
            const eta = amb ? simulateEta(amb, b.pickup, b.updatedAt) : null;
            const blocked = !online || !!active || !amb || mismatch;
            const reason = !online ? 'Go online first' : active ? 'Active trip in progress' : !amb ? 'No ambulance' : mismatch ? 'Ambulance type too low' : '';
            return (
              <li key={b.id}>
                <Card><CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{b.ref}</p><p className="text-xs text-ink-faint">Requested {formatDateTime(b.createdAt)}</p></div>
                    <div className="flex flex-wrap justify-end gap-1">{b.status === 'assigned' && <Badge tone="info">Assigned to you</Badge>}<StatusBadge status={b.status} /></div></div>
                  <dl className="space-y-1 text-sm">
                    <div><dt className="inline text-ink-soft">Pickup: </dt><dd className="inline">{b.pickup.label}</dd></div>
                    <div><dt className="inline text-ink-soft">Destination: </dt><dd className="inline">{b.destination.label}</dd></div>
                    <div><dt className="inline text-ink-soft">Emergency: </dt><dd className="inline">{EMERGENCY_LABELS[b.emergencyType]}</dd></div>
                    <div><dt className="inline text-ink-soft">Requested type: </dt><dd className="inline">{AMBULANCE_TYPE_LABELS[b.ambulanceType]}</dd></div>
                    <div><dt className="inline text-ink-soft">Simulated pickup ETA for your ambulance: </dt><dd className="inline">{eta ? `${formatEta(eta.minutes)} · ${formatKm(eta.distanceKm)} (illustrative)` : 'Not available'}</dd></div>
                  </dl>
                  {mismatch && <p className="text-xs font-medium text-warning-700">Your ambulance ({amb ? AMBULANCE_TYPE_LABELS[amb.type] : ''}) does not meet this requested type.</p>}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" disabled={blocked || pending !== null} loading={pending === `a-${b.id}`} onClick={() => run(`a-${b.id}`, () => services.bookings.driverAccept(user.id, b.id), `Accepted ${b.ref} (illustrative).`)}><Check className="h-4 w-4" aria-hidden />Accept<span className="sr-only"> {b.ref}</span></Button>
                    <Button size="sm" variant="outline" disabled={pending !== null} loading={pending === `r-${b.id}`} onClick={() => run(`r-${b.id}`, () => services.bookings.driverReject(user.id, b.id), `Declined ${b.ref}. It stays available for other drivers.`)}><X className="h-4 w-4" aria-hidden />Decline<span className="sr-only"> {b.ref}</span></Button>
                    <Button size="sm" variant="ghost" onClick={() => setView(b.id)}>Details</Button>
                    {blocked && <span className="self-center text-xs text-ink-faint">Accept disabled: {reason}</span>}
                  </div>
                </CardBody></Card>
              </li>
            );
          })}
        </ul>
      )}
      <BookingDetailsDialog bookingId={view} onClose={() => setView(null)} />
    </>
  );
}
