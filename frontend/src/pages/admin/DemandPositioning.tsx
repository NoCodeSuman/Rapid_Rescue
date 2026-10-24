import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { PageHeading } from '../../components/common/PageHeading';
import { MapView, type MapMarker } from '../../components/maps/MapView';
import { Badge } from '../../components/ui/Badge';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Alert, EmptyState } from '../../components/ui/misc';
import { computeDemand } from '../../domain/demand';
import { useAppState } from '../../hooks/useAppState';

export default function DemandPositioning() {
  const state = useAppState();
  const { rows, moves, fleetSize } = useMemo(() => computeDemand(state), [state]);
  const reg = (id: string) => state.ambulances.find((a) => a.id === id)?.registration ?? id;
  const zoneName = (id: string) => state.zones.find((z) => z.id === id)?.name ?? id;
  const maxScore = Math.max(...rows.map((r) => r.demandScore), 1);
  const markers: MapMarker[] = [
    ...state.zones.map((z) => ({ id: z.id, kind: 'zone' as const, lat: z.center.lat, lng: z.center.lng, label: z.name, radiusKm: z.radiusKm })),
    ...state.ambulances.filter((a) => a.operationalStatus === 'in_service' && a.driverId).map((a) => ({ id: a.id, kind: 'ambulance' as const, lat: a.location.lat, lng: a.location.lng, label: a.registration, detail: 'current mock location' })),
  ];

  return (
    <>
      <PageHeading title="Demand positioning" description="A rule-based demonstration of where idle ambulances could be placed. Not forecasting or AI." crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Demand positioning' }]} />
      <Alert tone="info" className="mb-5" title="How the dispatch rule works">
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Zone demand score = zone base index (mock history) + 4 × bookings whose pickup is nearest that zone.</li>
          <li>Fleet = in-service ambulances that have a driver ({fleetSize} now).</li>
          <li>Target per zone = fleet × score ÷ total score, rounded by largest remainder.</li>
          <li>Surplus zones lend an available (not busy) ambulance to deficit zones, choosing the one nearest to the deficit zone.</li>
        </ol>
      </Alert>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader title="Zones and ambulances" description="Operational overview" /><CardBody><MapView title="Demand zones" markers={markers} height="h-80" /></CardBody></Card>
        <Card>
          <CardHeader title="Current vs recommended placement" />
          <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Zone table (scrollable)">
            <table className="min-w-full text-sm">
              <caption className="sr-only">Demand score, current and recommended ambulance counts per zone</caption>
              <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-soft"><tr><th className="px-4 py-2">Zone</th><th className="px-4 py-2">Demand</th><th className="px-4 py-2">Current</th><th className="px-4 py-2">Recommended</th></tr></thead>
              <tbody className="divide-y divide-surface-border">
                {rows.map((r) => (
                  <tr key={r.zone.id}>
                    <td className="px-4 py-3 font-medium">{r.zone.name}<p className="text-xs font-normal text-ink-faint">{r.bookingCount} booking(s) nearby</p></td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-2 w-20 rounded bg-navy-100" aria-hidden><div className="h-2 rounded bg-brand-500" style={{ width: `${(r.demandScore / maxScore) * 100}%` }} /></div><span>{r.demandScore}</span></div></td>
                    <td className="px-4 py-3">{r.current.length} <span className="text-xs text-ink-faint">{r.current.map(reg).join(', ')}</span></td>
                    <td className="px-4 py-3">{r.target} {r.target > r.current.length ? <Badge tone="warning">needs {r.target - r.current.length} more</Badge> : r.target < r.current.length ? <Badge tone="info">surplus {r.current.length - r.target}</Badge> : <Badge tone="success">balanced</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader title="Suggested repositioning" description="Only ambulances that are available (not busy or offline) are suggested" />
        {moves.length === 0 ? <EmptyState title="No moves suggested" hint="Placement already matches the booking targets, or no spare available ambulance exists." /> : (
          <ul className="divide-y divide-surface-border">{moves.map((m) => <li key={m.ambulanceId} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm"><span className="font-medium">{reg(m.ambulanceId)}</span>{zoneName(m.fromZoneId)}<ArrowRight className="h-4 w-4 text-ink-faint" aria-hidden /><span className="sr-only">to</span>{zoneName(m.toZoneId)}<span className="text-xs text-ink-faint">({m.distanceKm} km, straight-line)</span></li>)}</ul>
        )}
      </Card>
    </>
  );
}
