import { Eye, Plus, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookingDetailsDialog } from '../../components/common/BookingDetails';
import { PageHeading } from '../../components/common/PageHeading';
import { DataTable, type Column } from '../../components/tables/DataTable';
import { FilterBar, FilterSelect } from '../../components/tables/FilterBar';
import { Button, LinkButton } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useAuth } from '../../contexts/AuthContext';
import { ambulanceLabel, driverName, patientBookings } from '../../domain/selectors';
import { AMBULANCE_TYPE_LABELS, BOOKING_STATUSES, STATUS_META, canCancel } from '../../domain/status';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { services } from '../../services';
import type { Booking } from '../../types';
import { formatDateTime, formatEta } from '../../utils/format';

export default function MyBookings() {
  const { user } = useAuth();
  const state = useAppState();
  const [params, setParams] = useSearchParams();
  const { run, busy } = useAction();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const viewId = params.get('view');

  const all = useMemo(() => (user ? patientBookings(state, user.id) : []), [state, user]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((b) => (status === 'all' || b.status === status) && (!t || [b.ref, b.pickup.label, b.destination.label, driverName(state, b.driverId) ?? '', ambulanceLabel(state, b.ambulanceId) ?? ''].some((x) => x.toLowerCase().includes(t))));
  }, [all, q, status, state]);

  const cols: Column<Booking>[] = [
    { key: 'ref', header: 'Booking ID', sortValue: (b) => b.ref, cell: (b) => <span className="font-medium">{b.ref}</span> },
    { key: 'date', header: 'Date / time', sortValue: (b) => b.createdAt, cell: (b) => formatDateTime(b.createdAt) },
    { key: 'route', header: 'Pickup → destination', sortValue: (b) => b.pickup.label, cell: (b) => <span>{b.pickup.label} <span className="text-ink-faint">→</span> {b.destination.label}</span> },
    { key: 'type', header: 'Ambulance', sortValue: (b) => b.ambulanceType, cell: (b) => AMBULANCE_TYPE_LABELS[b.ambulanceType] },
    { key: 'status', header: 'Status', sortValue: (b) => STATUS_META[b.status].label, cell: (b) => <StatusBadge status={b.status} /> },
    { key: 'assigned', header: 'Driver / ambulance', cell: (b) => (b.driverId ? `${driverName(state, b.driverId)} · ${ambulanceLabel(state, b.ambulanceId)}` : <span className="text-ink-faint">Not assigned</span>) },
    { key: 'eta', header: 'ETA (illustrative)', sortValue: (b) => b.eta?.minutes ?? 9999, cell: (b) => (b.eta && !['completed', 'cancelled', 'rejected'].includes(b.status) ? formatEta(b.eta.minutes) : <span className="text-ink-faint">Not available</span>) },
    { key: 'actions', header: 'Actions', cell: (b) => (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => setParams({ view: b.id })}><Eye className="h-3.5 w-3.5" aria-hidden />View<span className="sr-only"> {b.ref}</span></Button>
        {canCancel(b.status) && <Button size="sm" variant="ghost" className="text-danger-700" onClick={() => setCancelId(b.id)}><XCircle className="h-3.5 w-3.5" aria-hidden />Cancel<span className="sr-only"> {b.ref}</span></Button>}
      </div>
    ) },
  ];

  const target = state.bookings.find((b) => b.id === cancelId);
  const doCancel = async () => {
    if (!user || !cancelId) return;
    const r = await run('cancel', () => services.bookings.cancel(user.id, cancelId), 'booking cancelled.');
    if (r) setCancelId(null);
  };

  return (
    <>
      <PageHeading title="My bookings" description="All your bookings. Cancellation is available until transport starts." crumbs={[{ label: 'Patient', to: '/patient/dashboard' }, { label: 'My bookings' }]}
        actions={<LinkButton to="/patient/book-ambulance"><Plus className="h-4 w-4" aria-hidden />New booking</LinkButton>} />
      <Card>
        <FilterBar search={q} onSearch={setQ} placeholder="Booking ID, place, driver…" active={q !== '' || status !== 'all'} onClear={() => { setQ(''); setStatus('all'); }}>
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, ...BOOKING_STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))]} />
        </FilterBar>
        <DataTable rows={rows} columns={cols} rowKey={(b) => b.id} caption="My bookings" initialSort={{ key: 'date', dir: 'desc' }}
          emptyTitle={all.length ? 'No bookings match your filters' : 'No bookings yet'} emptyHint={all.length ? 'Try clearing the search or status filter.' : 'Create your first booking to see it here.'}
          emptyAction={!all.length ? <LinkButton to="/patient/book-ambulance">Book an ambulance</LinkButton> : undefined} />
      </Card>
      <BookingDetailsDialog bookingId={viewId} onClose={() => setParams({})} />
      <ConfirmDialog open={!!cancelId} onClose={() => setCancelId(null)} onConfirm={doCancel} loading={busy} danger title="Cancel this booking?" confirmLabel="Yes, cancel booking"
        message={<p>Cancel booking <strong>{target?.ref}</strong>? Any assigned driver and ambulance will be released. This cannot be undone.</p>} />
    </>
  );
}
