import { Eye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { BookingDetailsDialog } from '../../components/common/BookingDetails';
import { PageHeading } from '../../components/common/PageHeading';
import { DataTable, type Column } from '../../components/tables/DataTable';
import { FilterBar, FilterSelect } from '../../components/tables/FilterBar';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Alert } from '../../components/ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { driverByUserId } from '../../domain/selectors';
import { STATUS_META, isTerminal } from '../../domain/status';
import { useAppState } from '../../hooks/useAppState';
import type { Booking } from '../../types';
import { formatDateTime } from '../../utils/format';

export default function TripHistory() {
  const { user } = useAuth();
  const state = useAppState();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [view, setView] = useState<string | null>(null);
  const driver = user ? driverByUserId(state, user.id) : undefined;

  const all = useMemo(() => (driver ? state.bookings.filter((b) => (b.driverId === driver.id && isTerminal(b.status)) || b.declinedByDriverIds.includes(driver.id)) : []), [state.bookings, driver]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((b) => (status === 'all' || b.status === status) && (!t || [b.ref, b.pickup.label, b.destination.label].some((x) => x.toLowerCase().includes(t))));
  }, [all, q, status]);
  if (!driver) return <Alert tone="danger">Driver profile not found.</Alert>;

  const cols: Column<Booking>[] = [
    { key: 'date', header: 'Date', sortValue: (b) => b.updatedAt, cell: (b) => formatDateTime(b.updatedAt) },
    { key: 'ref', header: 'Booking ID', sortValue: (b) => b.ref, cell: (b) => <span className="font-medium">{b.ref}</span> },
    { key: 'pickup', header: 'Pickup', sortValue: (b) => b.pickup.label, cell: (b) => b.pickup.label },
    { key: 'dest', header: 'Destination', sortValue: (b) => b.destination.label, cell: (b) => b.destination.label },
    { key: 'status', header: 'Status', sortValue: (b) => b.status, cell: (b) => <StatusBadge status={b.status} /> },
    { key: 'note', header: 'Note', cell: (b) => (b.declinedByDriverIds.includes(driver.id) && b.driverId !== driver.id ? 'Declined by you' : b.reason ?? '—') },
    { key: 'a', header: 'Details', cell: (b) => <Button size="sm" variant="outline" onClick={() => setView(b.id)}><Eye className="h-3.5 w-3.5" aria-hidden />View<span className="sr-only"> {b.ref}</span></Button> },
  ];

  return (
    <>
      <PageHeading title="Trip history" description="Completed and cancelled trips, plus requests you declined." crumbs={[{ label: 'Driver', to: '/driver/dashboard' }, { label: 'Trip history' }]} />
      <Card>
        <FilterBar search={q} onSearch={setQ} placeholder="Booking ID or place…" active={q !== '' || status !== 'all'} onClear={() => { setQ(''); setStatus('all'); }}>
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, ...(['completed', 'cancelled', 'rejected', 'requested', 'assigned'] as const).map((s) => ({ value: s, label: STATUS_META[s].label }))]} />
        </FilterBar>
        <DataTable rows={rows} columns={cols} rowKey={(b) => b.id} caption="Trip history" initialSort={{ key: 'date', dir: 'desc' }} emptyTitle={all.length ? 'No trips match your filters' : 'No trips yet'} emptyHint={all.length ? 'Clear the filters to see everything.' : 'Completed trips will appear here.'} />
      </Card>
      <BookingDetailsDialog bookingId={view} onClose={() => setView(null)} showPatient />
    </>
  );
}
