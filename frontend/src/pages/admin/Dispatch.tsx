import { Radar, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeading } from '../../components/common/PageHeading';
import { MapView, type MapMarker } from '../../components/maps/MapView';
import { Badge, StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Alert, EmptyState } from '../../components/ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { ambulanceLabel, driverName } from '../../domain/selectors';
import { AMBULANCE_TYPE_LABELS } from '../../domain/status';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { services } from '../../services';
import { formatEta, formatKm } from '../../utils/format';

export default function Dispatch() {
  const { user: me } = useAuth();
  const state = useAppState();
  const { run, pending } = useAction();
  const open = useMemo(() => state.bookings.filter((b) => ['requested', 'assigned', 'accepted'].includes(b.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [state.bookings]);
  const [sel, setSel] = useState<string | null>(null);
  const booking = open.find((b) => b.id === sel) ?? open[0];
  const rec = useMemo(() => (booking ? services.dispatch.recommend(booking.id) : null), [booking, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const reg = (id: string) => state.ambulances.find((a) => a.id === id)?.registration ?? id;
  const assign = (ambId: string, msg: string) => me && booking && run(`a-${ambId}`, () => services.bookings.adminAssign(me.id, booking.id, ambId), msg);

  const markers: MapMarker[] = booking && rec ? [
    { id: 'p', kind: 'pickup', lat: booking.pickup.lat, lng: booking.pickup.lng, label: booking.pickup.label },
    ...rec.candidates.filter((c) => c.eligible).map((c) => { const a = state.ambulances.find((x) => x.id === c.ambulanceId)!; return { id: a.id, kind: 'ambulance' as const, lat: a.location.lat, lng: a.location.lng, label: a.registration, detail: `ETA ${c.etaMinutes} min (simulated)` }; }),
  ] : [];

  return (
    <>
      <PageHeading title="Dispatch monitoring" description="Simulated ETA-based dispatch: eligible ambulances are compared by estimated arrival time, not distance alone." crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Dispatch monitoring' }]} />
      <Alert tone="warning" className="mb-5" title="Simulated recommendations">ETAs come from a deterministic dispatch rule using route profiles. They are not live, traffic-aware, or guaranteed, and no real ambulance is dispatched.</Alert>
      {!booking || !rec ? <Card><EmptyState icon={Radar} title="No bookings awaiting dispatch" hint="New patient bookings will appear here for assignment." /></Card> : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="self-start">
            <CardHeader title="Bookings to dispatch" description={`${open.length} open`} />
            <ul className="divide-y divide-surface-border" aria-label="Bookings to dispatch">
              {open.map((b) => (
                <li key={b.id}><button type="button" onClick={() => setSel(b.id)} aria-pressed={b.id === booking.id} className={`block w-full px-5 py-3 text-left text-sm hover:bg-navy-50 ${b.id === booking.id ? 'bg-brand-50' : ''}`}>
                  <span className="flex items-center justify-between gap-2"><span className="font-medium">{b.ref}</span><StatusBadge status={b.status} /></span>
                  <span className="block text-xs text-ink-soft">{b.pickup.label} · needs {AMBULANCE_TYPE_LABELS[b.ambulanceType]}</span></button></li>
              ))}
            </ul>
          </Card>

          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader title={`${booking.ref} — dispatch status`} action={<StatusBadge status={booking.status} />} />
              <CardBody className="space-y-1 text-sm">
                <p><span className="text-ink-soft">Pickup:</span> {booking.pickup.label} → {booking.destination.label}</p>
                <p><span className="text-ink-soft">Requested type:</span> {AMBULANCE_TYPE_LABELS[booking.ambulanceType]}</p>
                <p><span className="text-ink-soft">Assigned:</span> {booking.ambulanceId ? `${ambulanceLabel(state, booking.ambulanceId)} · ${driverName(state, booking.driverId)} (ETA ${formatEta(booking.eta?.minutes)}, simulated)` : 'Not assigned'}</p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Recommendation" />
              <CardBody className="space-y-3">
                {rec.recommended ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-success-50 p-4">
                    <div><p className="flex items-center gap-2 font-semibold text-success-700"><Sparkles className="h-4 w-4" aria-hidden />{reg(rec.recommended.ambulanceId)} — simulated ETA {formatEta(rec.recommended.etaMinutes)}</p>
                      <p className="text-sm text-ink-soft">{rec.explanation}</p></div>
                    <Button loading={pending === `a-${rec.recommended.ambulanceId}`} disabled={pending !== null} onClick={() => assign(rec.recommended!.ambulanceId, `Assigned ${booking.ref} to ${reg(rec.recommended!.ambulanceId)} (illustrative).`)}>{booking.ambulanceId ? 'Reassign to recommended' : 'Assign recommended'}</Button>
                  </div>
                ) : <Alert tone="danger" title="No eligible ambulance">{rec.explanation} Check driver availability or add an ambulance.</Alert>}
                <MapView title="Dispatch candidates" markers={markers} height="h-56" />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Candidate comparison" description="Distance is straight-line (booking coordinates)" />
              <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Candidate comparison (scrollable)">
                <table className="min-w-full text-sm">
                  <caption className="sr-only">Candidate ambulances with distance, simulated ETA and feasibility</caption>
                  <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-soft"><tr><th className="px-4 py-2">Ambulance</th><th className="px-4 py-2">Distance</th><th className="px-4 py-2">Simulated ETA</th><th className="px-4 py-2">Feasibility</th><th className="px-4 py-2">Action</th></tr></thead>
                  <tbody className="divide-y divide-surface-border">
                    {[...rec.candidates].sort((a, b) => Number(b.eligible) - Number(a.eligible) || (a.etaMinutes ?? 0) - (b.etaMinutes ?? 0)).map((c) => (
                      <tr key={c.ambulanceId} className={c.ambulanceId === rec.recommended?.ambulanceId ? 'bg-success-50/60' : ''}>
                        <td className="px-4 py-3 font-medium">{reg(c.ambulanceId)}{c.ambulanceId === rec.recommended?.ambulanceId && <span className="ml-2"><Badge tone="success">Recommended</Badge></span>}{c.ambulanceId === rec.nearestEligible?.ambulanceId && c.ambulanceId !== rec.recommended?.ambulanceId && <span className="ml-2"><Badge tone="warning">Nearest only</Badge></span>}</td>
                        <td className="px-4 py-3">{formatKm(c.distanceKm)}</td>
                        <td className="px-4 py-3">{c.eligible ? formatEta(c.etaMinutes) : <span className="text-ink-faint">{formatEta(c.etaMinutes)} (not eligible)</span>}</td>
                        <td className="px-4 py-3">{c.eligible ? <span className="text-success-700">Eligible</span> : <span className="text-danger-700">{c.reasons.join('; ')}</span>}</td>
                        <td className="px-4 py-3"><Button size="sm" variant="outline" disabled={!c.eligible || pending !== null} loading={pending === `a-${c.ambulanceId}`} onClick={() => assign(c.ambulanceId, `${booking.ref} assigned to ${reg(c.ambulanceId)} (illustrative).`)}>{booking.ambulanceId ? 'Reassign' : 'Assign'}<span className="sr-only"> {reg(c.ambulanceId)}</span></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
