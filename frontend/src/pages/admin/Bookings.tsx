import { Eye, Radar } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookingDetailsDialog } from '../../components/common/BookingDetails';
import { PageHeading } from '../../components/common/PageHeading';
import { DataTable, type Column } from '../../components/tables/DataTable';
import { FilterBar, FilterSelect } from '../../components/tables/FilterBar';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { useAuth } from '../../contexts/AuthContext';
import { adminNextStatuses } from '../../domain/engine';
import { ambulanceLabel, driverName, userById } from '../../domain/selectors';
import { BOOKING_STATUSES, STATUS_META } from '../../domain/status';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { services } from '../../services';
import type { Booking, BookingStatus } from '../../types';
import { formatDateTime, formatEta } from '../../utils/format';

export default function AdminBookings() {
  const { user: me } = useAuth();
  const state = useAppState();
  const { run, busy } = useAction();
  const [q, setQ] = useState(''); const [status, setStatus] = useState('all');
  const [view, setView] = useState<string | null>(null);
  const [manage, setManage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; to: BookingStatus } | null>(null);
  const [reason, setReason] = useState('');

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return state.bookings.filter((b) => (status === 'all' || b.status === status) && (!t || [b.ref, userById(state, b.patientId)?.name ?? '', driverName(state, b.driverId) ?? '', ambulanceLabel(state, b.ambulanceId) ?? '', b.pickup.label, b.destination.label].some((x) => x.toLowerCase().includes(t))));
  }, [state, q, status]);
  const managing = state.bookings.find((b) => b.id === manage);
  const confirmB = confirm ? state.bookings.find((b) => b.id === confirm.id) : undefined;

  const cols: Column<Booking>[] = [
    { key: 'ref', header: 'Booking ID', sortValue: (b) => b.ref, cell: (b) => <span className="font-medium">{b.ref}</span> },
    { key: 'patient', header: 'Patient', sortValue: (b) => userById(state, b.patientId)?.name ?? '', cell: (b) => userById(state, b.patientId)?.name ?? 'Unknown' },
    { key: 'driver', header: 'Driver', sortValue: (b) => driverName(state, b.driverId) ?? '', cell: (b) => driverName(state, b.driverId) ?? <span className="text-ink-faint">—</span> },
    { key: 'amb', header: 'Ambulance', sortValue: (b) => ambulanceLabel(state, b.ambulanceId) ?? '', cell: (b) => ambulanceLabel(state, b.ambulanceId) ?? <span className="text-ink-faint">—</span> },
    { key: 'route', header: 'Pickup → destination', sortValue: (b) => b.pickup.label, cell: (b) => `${b.pickup.label} → ${b.destination.label}` },
    { key: 'time', header: 'Booked', sortValue: (b) => b.createdAt, cell: (b) => formatDateTime(b.createdAt) },
    { key: 'status', header: 'Status', sortValue: (b) => STATUS_META[b.status].label, cell: (b) => <StatusBadge status={b.status} /> },
    { key: 'eta', header: 'ETA (illustrative)', sortValue: (b) => b.eta?.minutes ?? 9999, cell: (b) => (b.eta ? formatEta(b.eta.minutes) : <span className="text-ink-faint">Not available</span>) },
    { key: 'a', header: 'Actions', cell: (b) => (<div className="flex gap-1">
      <Button size="sm" variant="outline" onClick={() => setView(b.id)}><Eye className="h-3.5 w-3.5" aria-hidden />View<span className="sr-only"> {b.ref}</span></Button>
      <Button size="sm" variant="outline" disabled={adminNextStatuses(b).length === 0 && !['requested', 'assigned', 'accepted'].includes(b.status)} onClick={() => setManage(b.id)}>Update<span className="sr-only"> {b.ref}</span></Button></div>) },
  ];

  const doStatus = async () => {
    if (!me || !confirm) return;
    const r = await run('st', () => services.bookings.adminSetStatus(me.id, confirm.id, confirm.to, reason), `Booking set to ${STATUS_META[confirm.to].label}.`);
    if (r) { setConfirm(null); setReason(''); setManage(null); }
  };

  return (
    <>
      <PageHeading title="Bookings" description="All bookings. Changes propagate to patient, driver and dashboard views." crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Bookings' }]} />
      <Card>
        <FilterBar search={q} onSearch={setQ} placeholder="ID, patient, driver, place…" active={q !== '' || status !== 'all'} onClear={() => { setQ(''); setStatus('all'); }}>
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, ...BOOKING_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))]} />
        </FilterBar>
        <DataTable rows={rows} columns={cols} rowKey={(b) => b.id} caption="All bookings" initialSort={{ key: 'time', dir: 'desc' }} emptyTitle="No bookings match your filters" />
      </Card>
      <BookingDetailsDialog bookingId={view} onClose={() => setView(null)} showPatient />

      <Dialog open={!!managing} onClose={() => setManage(null)} title={`Update ${managing?.ref ?? ''}`} description="Only valid next steps are offered." footer={<Button variant="outline" onClick={() => setManage(null)}>Close</Button>}>
        {managing && <div className="space-y-4 text-sm">
          <p className="flex items-center gap-2">Current status: <StatusBadge status={managing.status} /></p>
          {['requested', 'assigned', 'accepted'].includes(managing.status) && <p><Link to="/admin/dispatch" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"><Radar className="h-4 w-4" aria-hidden />Assign or reassign in Dispatch Monitoring</Link></p>}
          {adminNextStatuses(managing).length === 0 ? <p className="text-ink-soft">No further status changes are possible.</p> : (
            <div className="flex flex-wrap gap-2">{adminNextStatuses(managing).map((s) => <Button key={s} variant={s === 'cancelled' || s === 'rejected' ? 'danger' : 'primary'} size="sm" onClick={() => { setReason(''); setConfirm({ id: managing.id, to: s }); }}>{s === 'cancelled' ? 'Cancel booking' : s === 'rejected' ? 'Reject booking' : `Mark ${STATUS_META[s].label}`}</Button>)}</div>
          )}
        </div>}
      </Dialog>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={doStatus} loading={busy} danger={confirm?.to === 'cancelled' || confirm?.to === 'rejected'}
        title={confirm?.to === 'cancelled' ? 'Cancel this booking?' : confirm?.to === 'rejected' ? 'Reject this booking?' : 'Change booking status?'} confirmLabel={confirm ? `Confirm: ${STATUS_META[confirm.to].label}` : 'Confirm'}
        message={<p>Set <strong>{confirmB?.ref}</strong> to <strong>{confirm ? STATUS_META[confirm.to].label : ''}</strong>. The patient, driver and dashboards will update.</p>}>
        {(confirm?.to === 'cancelled' || confirm?.to === 'rejected') && (<div><label htmlFor="reason" className="mb-1 block text-sm font-medium text-ink">Reason (optional)</label><input id="reason" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} className="block min-h-[40px] w-full rounded-md border border-surface-border px-3 py-2 text-sm" /></div>)}
      </ConfirmDialog>
    </>
  );
}
