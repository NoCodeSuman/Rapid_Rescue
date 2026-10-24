import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeading } from '../../components/common/PageHeading';
import { MapView } from '../../components/maps/MapView';
import { DataTable, type Column } from '../../components/tables/DataTable';
import { FilterBar, FilterSelect } from '../../components/tables/FilterBar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { SelectField, TextField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { DEMO_PICKUPS, ROUTE_PROFILES } from '../../data/places';
import { ambulanceHasActiveBooking } from '../../domain/dispatch';
import type { AmbulanceInput } from '../../domain/engine';
import { userById } from '../../domain/selectors';
import { AMBULANCE_TYPE_LABELS, AVAILABILITY_META, OPERATIONAL_META } from '../../domain/status';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { ambulanceSchema } from '../../lib/schemas';
import { services } from '../../services';
import type { Ambulance } from '../../types';
import { formatDateTime } from '../../utils/format';

type FormIn = z.input<typeof ambulanceSchema>; type FormOut = z.output<typeof ambulanceSchema>;
const profileKeyOf = (a: Ambulance) => Object.entries(ROUTE_PROFILES).find(([, p]) => p.label === a.routeProfile.label)?.[0] ?? 'moderate';

export default function Ambulances() {
  const { user: me } = useAuth();
  const state = useAppState();
  const { run, busy } = useAction();
  const [q, setQ] = useState(''); const [type, setType] = useState('all'); const [av, setAv] = useState('all'); const [op, setOp] = useState('all');
  const [form, setForm] = useState<'new' | string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return state.ambulances.filter((a) => (type === 'all' || a.type === type) && (av === 'all' || a.availability === av) && (op === 'all' || a.operationalStatus === op) && (!t || a.registration.toLowerCase().includes(t) || a.location.label.toLowerCase().includes(t)));
  }, [state.ambulances, q, type, av, op]);
  const editing = form && form !== 'new' ? state.ambulances.find((a) => a.id === form) : undefined;
  const viewing = state.ambulances.find((a) => a.id === viewId); const deleting = state.ambulances.find((a) => a.id === delId);
  const driverName = (id: string | null) => { const d = state.drivers.find((x) => x.id === id); return d ? userById(state, d.userId)?.name ?? d.driverCode : null; };
  const lockedActive = editing ? ambulanceHasActiveBooking(state, editing.id) : false;
  const driverOptions = state.drivers.filter((d) => !d.ambulanceId || d.ambulanceId === editing?.id);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(ambulanceSchema) });
  useEffect(() => {
    if (form === 'new') reset({ registration: '', type: 'basic', operationalStatus: 'in_service', availability: 'available', driverId: '', locationIndex: 0, routeProfileKey: 'moderate' });
    else if (editing) reset({ registration: editing.registration, type: editing.type, operationalStatus: editing.operationalStatus, availability: editing.availability === 'available' ? 'available' : 'offline', driverId: editing.driverId ?? '', locationIndex: Math.max(0, DEMO_PICKUPS.findIndex((p) => p.label === editing.location.label)), routeProfileKey: profileKeyOf(editing) });
  }, [form]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = handleSubmit(async (d) => {
    if (!me) return;
    const input: AmbulanceInput = { registration: d.registration, type: d.type, operationalStatus: d.operationalStatus, availability: d.availability, driverId: d.driverId || null, location: DEMO_PICKUPS[d.locationIndex] ?? DEMO_PICKUPS[0], routeProfileKey: d.routeProfileKey };
    const r = await run('save', () => (editing ? services.ambulances.update(me.id, editing.id, input) : services.ambulances.create(me.id, input)), editing ? 'Ambulance updated.' : 'Ambulance added.');
    if (r) setForm(null);
  });

  const cols: Column<Ambulance>[] = [
    { key: 'reg', header: 'Registration', sortValue: (a) => a.registration, cell: (a) => <span className="font-medium">{a.registration}</span> },
    { key: 'type', header: 'Type', sortValue: (a) => a.type, cell: (a) => AMBULANCE_TYPE_LABELS[a.type] },
    { key: 'drv', header: 'Driver', sortValue: (a) => driverName(a.driverId) ?? '', cell: (a) => driverName(a.driverId) ?? <span className="text-ink-faint">Unassigned</span> },
    { key: 'loc', header: 'Location', sortValue: (a) => a.location.label, cell: (a) => a.location.label },
    { key: 'av', header: 'Availability', sortValue: (a) => a.availability, cell: (a) => <Badge tone={AVAILABILITY_META[a.availability].tone}>{AVAILABILITY_META[a.availability].label}</Badge> },
    { key: 'op', header: 'Operational', sortValue: (a) => a.operationalStatus, cell: (a) => <Badge tone={OPERATIONAL_META[a.operationalStatus].tone}>{OPERATIONAL_META[a.operationalStatus].label}</Badge> },
    { key: 'a', header: 'Actions', cell: (a) => (<div className="flex gap-1">
      <Button size="sm" variant="outline" onClick={() => setViewId(a.id)}><Eye className="h-3.5 w-3.5" aria-hidden />View<span className="sr-only"> {a.registration}</span></Button>
      <Button size="sm" variant="outline" onClick={() => setForm(a.id)}><Pencil className="h-3.5 w-3.5" aria-hidden />Edit<span className="sr-only"> {a.registration}</span></Button>
      <Button size="sm" variant="ghost" className="text-danger-700" onClick={() => setDelId(a.id)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Delete<span className="sr-only"> {a.registration}</span></Button></div>) },
  ];

  return (
    <>
      <PageHeading title="Ambulances" description="Fleet records used by dispatch. Locations are fictional." crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Ambulances' }]} actions={<Button onClick={() => setForm('new')}><Plus className="h-4 w-4" aria-hidden />Add ambulance</Button>} />
      <Card>
        <FilterBar search={q} onSearch={setQ} placeholder="Registration or location…" active={q !== '' || type !== 'all' || av !== 'all' || op !== 'all'} onClear={() => { setQ(''); setType('all'); setAv('all'); setOp('all'); }}>
          <FilterSelect label="Type" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, ...Object.entries(AMBULANCE_TYPE_LABELS).map(([value, label]) => ({ value, label }))]} />
          <FilterSelect label="Availability" value={av} onChange={setAv} options={[{ value: 'all', label: 'All' }, ...Object.entries(AVAILABILITY_META).map(([value, m]) => ({ value, label: m.label }))]} />
          <FilterSelect label="Operational" value={op} onChange={setOp} options={[{ value: 'all', label: 'All' }, ...Object.entries(OPERATIONAL_META).map(([value, m]) => ({ value, label: m.label }))]} />
        </FilterBar>
        <DataTable rows={rows} columns={cols} rowKey={(a) => a.id} caption="Ambulances" initialSort={{ key: 'reg', dir: 'asc' }} emptyTitle="No ambulances match your filters" />
      </Card>

      <Dialog open={form !== null} onClose={() => setForm(null)} title={editing ? `Edit ${editing.registration}` : 'Add ambulance'}
        footer={<><Button variant="outline" onClick={() => setForm(null)} disabled={busy}>Cancel</Button><Button type="submit" form="amb-form" loading={busy}>{editing ? 'Save changes' : 'Add ambulance'}</Button></>}>
        <form id="amb-form" noValidate onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          {lockedActive && <div className="sm:col-span-2"><Alert tone="warning">This ambulance has an active booking: type, status and driver are locked until it ends.</Alert></div>}
          <TextField label="Registration / vehicle ID" required hint="Must be unique." error={errors.registration?.message} {...register('registration')} />
          <SelectField label="Type" required disabled={lockedActive} {...register('type')}>{Object.entries(AMBULANCE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectField>
          <SelectField label="Operational status" disabled={lockedActive} {...register('operationalStatus')}>{Object.entries(OPERATIONAL_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</SelectField>
          <SelectField label="Availability" hint="'Busy' is set automatically while on a trip." disabled={lockedActive} {...register('availability')}><option value="available">Available</option><option value="offline">Offline</option></SelectField>
          <SelectField label="Driver" disabled={lockedActive} {...register('driverId')}><option value="">Unassigned</option>{driverOptions.map((d) => <option key={d.id} value={d.id}>{userById(state, d.userId)?.name} ({d.driverCode})</option>)}</SelectField>
          <SelectField label="Location" {...register('locationIndex')}>{DEMO_PICKUPS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}</SelectField>
          <div className="sm:col-span-2"><SelectField label="Route profile (drives simulated ETA)" {...register('routeProfileKey')}>{Object.entries(ROUTE_PROFILES).map(([k, p]) => <option key={k} value={k}>{p.label} (~{p.avgSpeedKmh} km/h, x{p.detourFactor} detour)</option>)}</SelectField></div>
        </form>
      </Dialog>

      <Dialog open={!!viewing} onClose={() => setViewId(null)} title={viewing?.registration ?? 'Ambulance'} size="lg" footer={<Button variant="outline" onClick={() => setViewId(null)}>Close</Button>}>
        {viewing && <div className="grid gap-4 md:grid-cols-2">
          <dl className="space-y-2 text-sm">{[['Type', AMBULANCE_TYPE_LABELS[viewing.type]], ['Driver', driverName(viewing.driverId) ?? 'Unassigned'], ['Availability', AVAILABILITY_META[viewing.availability].label], ['Operational', OPERATIONAL_META[viewing.operationalStatus].label], ['Location (mock)', viewing.location.label], ['Route profile', `${viewing.routeProfile.label} (~${viewing.routeProfile.avgSpeedKmh} km/h, x${viewing.routeProfile.detourFactor})`], ['Active booking', state.bookings.find((b) => b.ambulanceId === viewing.id && ['assigned', 'accepted', 'on_the_way', 'arrived', 'in_progress'].includes(b.status))?.ref ?? 'None'], ['Updated', formatDateTime(viewing.updatedAt)]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-ink-soft">{k}</dt><dd className="text-right">{v}</dd></div>)}</dl>
          <MapView title="Ambulance location" markers={[{ id: viewing.id, kind: 'ambulance', lat: viewing.location.lat, lng: viewing.location.lng, label: viewing.location.label }]} height="h-48" />
        </div>}
      </Dialog>

      <ConfirmDialog open={!!deleting} onClose={() => setDelId(null)} loading={busy} danger title="Delete ambulance?" confirmLabel="Delete ambulance"
        message={<p>Delete <strong>{deleting?.registration}</strong>? Its driver will be unassigned. Past bookings keep their history. This cannot be undone (except via Reset local data).</p>}
        onConfirm={async () => { if (me && deleting) { const r = await run('del', async () => { await services.ambulances.remove(me.id, deleting.id); return true; }, 'Ambulance deleted.'); if (r) setDelId(null); } }} />
    </>
  );
}
