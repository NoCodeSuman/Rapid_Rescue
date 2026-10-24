import { Eye, Plus, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeading } from '../../components/common/PageHeading';
import { DataTable, type Column } from '../../components/tables/DataTable';
import { FilterBar, FilterSelect } from '../../components/tables/FilterBar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { SelectField, TextField, Toggle } from '../../components/ui/Field';
import { useAuth } from '../../contexts/AuthContext';
import { activeDriverBooking, userById } from '../../domain/selectors';
import { AMBULANCE_TYPE_LABELS } from '../../domain/status';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { services } from '../../services';
import type { Driver } from '../../types';

export default function Drivers() {
  const { user: me } = useAuth();
  const state = useAppState();
  const { run, busy } = useAction();
  const [q, setQ] = useState(''); const [avail, setAvail] = useState('all');
  const [viewId, setViewId] = useState<string | null>(null);
  const [assignId, setAssignId] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newDriver, setNewDriver] = useState({
    name: '',
    email: '',
    phone: '',
    driverCode: '',
    licenseNumber: '',
    ambulanceId: '',
    availability: 'offline' as 'online' | 'offline',
  });

  const resetAddForm = () => {
    setNewDriver({
      name: '',
      email: '',
      phone: '',
      driverCode: '',
      licenseNumber: '',
      ambulanceId: '',
      availability: 'offline',
    });
  };

  const handleAddDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) return;
    if (!newDriver.name.trim() || !newDriver.email.trim() || !newDriver.phone.trim()) return;
    const r = await run('add-driver', () => services.drivers.createDriver(me.id, {
      name: newDriver.name.trim(),
      email: newDriver.email.trim().toLowerCase(),
      phone: newDriver.phone.trim(),
      driverCode: newDriver.driverCode.trim() || undefined,
      licenseNumber: newDriver.licenseNumber.trim() || undefined,
      ambulanceId: newDriver.ambulanceId || null,
      availability: newDriver.availability,
    }), 'Driver added successfully.');
    if (r) {
      resetAddForm();
      setAddOpen(false);
    }
  };

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return state.drivers.filter((d) => {
      const u = userById(state, d.userId); const amb = state.ambulances.find((a) => a.id === d.ambulanceId);
      return (avail === 'all' || d.availability === avail) && (!t || [u?.name ?? d.contactName ?? '', d.driverCode, amb?.registration ?? ''].some((x) => x.toLowerCase().includes(t)));
    });
  }, [state, q, avail]);
  const viewing = state.drivers.find((d) => d.id === viewId); const assigning = state.drivers.find((d) => d.id === assignId);
  const free = state.ambulances.filter((a) => !a.driverId || a.driverId === assigning?.id);
  const unassignedAmbs = state.ambulances.filter((a) => !a.driverId);
  const completed = (d: Driver) => state.bookings.filter((b) => b.driverId === d.id && b.status === 'completed').length;

  const cols: Column<Driver>[] = [
    { key: 'name', header: 'Driver', sortValue: (d) => userById(state, d.userId)?.name ?? d.contactName ?? '', cell: (d) => <div><p className="font-medium">{userById(state, d.userId)?.name ?? d.contactName ?? 'Unnamed driver'}</p><p className="text-xs text-ink-faint">{d.driverCode}</p></div> },
    { key: 'amb', header: 'Ambulance', sortValue: (d) => state.ambulances.find((a) => a.id === d.ambulanceId)?.registration ?? '', cell: (d) => state.ambulances.find((a) => a.id === d.ambulanceId)?.registration ?? <span className="text-ink-faint">None</span> },
    { key: 'av', header: 'Availability', sortValue: (d) => d.availability, cell: (d) => <Badge tone={d.availability === 'online' ? 'success' : 'neutral'}>{d.availability === 'online' ? 'Online' : 'Offline'}</Badge> },
    { key: 'cur', header: 'Current assignment', cell: (d) => activeDriverBooking(state, d.id)?.ref ?? <span className="text-ink-faint">None</span> },
    { key: 'done', header: 'Completed trips', sortValue: completed, cell: completed },
    { key: 'a', header: 'Actions', cell: (d) => {
      const active = !!activeDriverBooking(state, d.id);
      return (<div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => setViewId(d.id)}><Eye className="h-3.5 w-3.5" aria-hidden />Details</Button>
        <Button size="sm" variant="outline" disabled={busy || (active && d.availability === 'online')} title={active ? 'Active trip in progress' : undefined} onClick={() => me && run('av', () => services.drivers.setAvailability(me.id, d.id, d.availability === 'online' ? 'offline' : 'online'), 'Availability updated.')}>{d.availability === 'online' ? 'Set offline' : 'Set online'}</Button>
        <Button size="sm" variant="outline" disabled={active} title={active ? 'Active trip in progress' : undefined} onClick={() => { setAssignId(d.id); setPick(d.ambulanceId ?? ''); }}><Truck className="h-3.5 w-3.5" aria-hidden />Ambulance</Button>
      </div>);
    } },
  ];

  return (
    <>
      <PageHeading
        title="Drivers"
        description="Driver availability and ambulance assignment."
        crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Drivers' }]}
        actions={<Button onClick={() => { resetAddForm(); setAddOpen(true); }}><Plus className="h-4 w-4" aria-hidden />Add driver</Button>}
      />
      <Card>
        <FilterBar search={q} onSearch={setQ} placeholder="Name, driver ID or ambulance…" active={q !== '' || avail !== 'all'} onClear={() => { setQ(''); setAvail('all'); }}>
          <FilterSelect label="Availability" value={avail} onChange={setAvail} options={[{ value: 'all', label: 'All' }, { value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }]} />
        </FilterBar>
        <DataTable rows={rows} columns={cols} rowKey={(d) => d.id} caption="Drivers" initialSort={{ key: 'name', dir: 'asc' }} emptyTitle="No drivers match your filters" />
      </Card>

      <Dialog open={!!viewing} onClose={() => setViewId(null)} title={viewing ? userById(state, viewing.userId)?.name ?? 'Driver' : 'Driver'} footer={<Button variant="outline" onClick={() => setViewId(null)}>Close</Button>}>
        {viewing && (() => { const u = userById(state, viewing.userId); const amb = state.ambulances.find((a) => a.id === viewing.ambulanceId); return (
          <dl className="space-y-2 text-sm">{[['Driver ID', viewing.driverCode], ['Licence record', viewing.licenseNumber], ['Email', u?.email || viewing.contactEmail || 'Not available until the email is verified'], ['Phone', u?.phone || viewing.contactPhone || 'Not set'], ['Account status', u?.status ?? 'unknown'], ['Ambulance', amb ? `${amb.registration} · ${AMBULANCE_TYPE_LABELS[amb.type]}` : 'None'], ['Availability', viewing.availability], ['Current assignment', activeDriverBooking(state, viewing.id)?.ref ?? 'None'], ['Completed trips', String(completed(viewing))]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-ink-soft">{k}</dt><dd>{v}</dd></div>)}
            <div className="pt-2"><Toggle label="Online" checked={viewing.availability === 'online'} disabled={busy || (!!activeDriverBooking(state, viewing.id) && viewing.availability === 'online')} onChange={(v) => me && run('av2', () => services.drivers.setAvailability(me.id, viewing.id, v ? 'online' : 'offline'), 'Availability updated.')} /></div></dl>); })()}
      </Dialog>

      <Dialog open={!!assigning} onClose={() => setAssignId(null)} title="Assign ambulance" description={assigning ? `For ${userById(state, assigning.userId)?.name}` : ''}
        footer={<><Button variant="outline" onClick={() => setAssignId(null)} disabled={busy}>Cancel</Button><Button loading={busy} onClick={async () => { if (me && assigning) { const r = await run('as', () => services.drivers.assignAmbulance(me.id, assigning.id, pick || null), 'Ambulance assignment updated.'); if (r) setAssignId(null); } }}>Save</Button></>}>
        <label htmlFor="amb-pick" className="mb-1 block text-sm font-medium">Ambulance</label>
        <select id="amb-pick" value={pick} onChange={(e) => setPick(e.target.value)} className="block min-h-[40px] w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm">
          <option value="">No ambulance</option>
          {free.map((a) => <option key={a.id} value={a.id}>{a.registration} · {AMBULANCE_TYPE_LABELS[a.type]}</option>)}
        </select>
        <p className="mt-2 text-xs text-ink-faint">Only ambulances without another driver are listed.</p>
      </Dialog>

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add new driver"
        description="Add an ambulance driver to the roster."
        footer={
          <>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" form="add-driver-form" loading={busy}>Add driver</Button>
          </>
        }
      >
        <form id="add-driver-form" onSubmit={handleAddDriver} className="space-y-4">
          <TextField
            label="Full name"
            required
            value={newDriver.name}
            onChange={(e) => setNewDriver({ ...newDriver, name: e.target.value })}
            placeholder="e.g. Ramesh Patel"
          />
          <TextField
            label="Email"
            type="email"
            required
            value={newDriver.email}
            onChange={(e) => setNewDriver({ ...newDriver, email: e.target.value })}
            placeholder="e.g. ramesh@example.com"
          />
          <TextField
            label="Phone"
            type="tel"
            required
            value={newDriver.phone}
            onChange={(e) => setNewDriver({ ...newDriver, phone: e.target.value })}
            placeholder="e.g. +91 98000 12345"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Driver ID / Code"
              value={newDriver.driverCode}
              onChange={(e) => setNewDriver({ ...newDriver, driverCode: e.target.value })}
              placeholder="e.g. DRV-008 (auto if blank)"
            />
            <TextField
              label="Licence number"
              value={newDriver.licenseNumber}
              onChange={(e) => setNewDriver({ ...newDriver, licenseNumber: e.target.value })}
              placeholder="e.g. DL-0420110012345"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Ambulance assignment"
              value={newDriver.ambulanceId}
              onChange={(e) => setNewDriver({ ...newDriver, ambulanceId: e.target.value })}
            >
              <option value="">No ambulance (assign later)</option>
              {unassignedAmbs.map((a) => (
                <option key={a.id} value={a.id}>{a.registration} · {AMBULANCE_TYPE_LABELS[a.type]}</option>
              ))}
            </SelectField>
            <SelectField
              label="Initial availability"
              value={newDriver.availability}
              onChange={(e) => setNewDriver({ ...newDriver, availability: e.target.value as 'online' | 'offline' })}
            >
              <option value="offline">Offline</option>
              <option value="online">Online</option>
            </SelectField>
          </div>
        </form>
      </Dialog>
    </>
  );
}
