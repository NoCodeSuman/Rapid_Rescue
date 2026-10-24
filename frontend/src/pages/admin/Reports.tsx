import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '../../components/common/ChartCard';
import { PageHeading } from '../../components/common/PageHeading';
import { StatCard } from '../../components/common/StatCard';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Alert } from '../../components/ui/misc';
import { bookingsCsv, filterByRange, reportSummary } from '../../domain/reports';
import { bookingsPerDay, statusDistribution } from '../../domain/selectors';
import { useAppState } from '../../hooks/useAppState';
import { notify } from '../../hooks/useNotify';
import { downloadCsv } from '../../lib/csv';
import { CheckCircle2, ClipboardList, Clock, XCircle } from 'lucide-react';

const PIE = ['#f59e0b', '#2f9fec', '#0b84d6', '#4f72ad', '#7d99c9', '#1e4073', '#16a34a', '#e5383b', '#a61e21'];
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function Reports() {
  const state = useAppState();
  const today = iso(new Date());
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(today);
  const invalid = !!from && !!to && from > to;
  const bookings = useMemo(() => (invalid ? [] : filterByRange(state.bookings, { from, to })), [state.bookings, from, to, invalid]);
  const sum = useMemo(() => reportSummary(state, bookings), [state, bookings]);
  const dist = useMemo(() => statusDistribution(bookings), [bookings]);
  const perDay = useMemo(() => bookingsPerDay(bookings, 14, `${to || today}T12:00:00.000Z`), [bookings, to, today]);
  const preset = (days: number | null) => { setTo(today); setFrom(days ? iso(new Date(Date.now() - (days - 1) * 86400000)) : ''); };

  const exportCsv = () => {
    if (bookings.length === 0) { notify.error('Nothing to export for the selected dates.'); return; }
    downloadCsv(`rapidrescue-bookings-${from || 'start'}_to_${to || 'today'}.csv`, bookingsCsv(state, bookings));
    notify.success(`Exported ${bookings.length} bookings to CSV.`);
  };

  return (
    <>
      <PageHeading title="Reports" description="Summaries computed from current local data." crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Reports' }]} actions={<Button onClick={exportCsv} disabled={invalid || bookings.length === 0}><Download className="h-4 w-4" aria-hidden />Export bookings CSV</Button>} />
      <Card className="mb-5"><CardBody className="flex flex-wrap items-end gap-3">
        <div><label htmlFor="from" className="mb-1 block text-xs font-medium text-ink-soft">From</label><input id="from" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="min-h-[40px] rounded-md border border-surface-border px-3 py-2 text-sm" /></div>
        <div><label htmlFor="to" className="mb-1 block text-xs font-medium text-ink-soft">To</label><input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="min-h-[40px] rounded-md border border-surface-border px-3 py-2 text-sm" /></div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Date presets"><Button size="sm" variant="outline" onClick={() => preset(7)}>Last 7 days</Button><Button size="sm" variant="outline" onClick={() => preset(30)}>Last 30 days</Button><Button size="sm" variant="outline" onClick={() => preset(null)}>All time</Button></div>
        <p className="text-xs text-ink-faint">Filters by booking creation date. CSV export matches these dates.</p>
      </CardBody></Card>
      {invalid && <Alert tone="danger" className="mb-5">The start date must not be after the end date.</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Bookings in range" value={sum.total} icon={ClipboardList} tone="navy" />
        <StatCard label="Completed trips" value={sum.completed} icon={CheckCircle2} tone="success" />
        <StatCard label="Cancelled / rejected" value={`${sum.cancelled} / ${sum.rejected}`} icon={XCircle} tone="danger" />
        <StatCard label="Avg simulated ETA" value={sum.avgEta == null ? 'N/A' : `${sum.avgEta} min`} icon={Clock} tone="brand" hint="illustrative estimates only" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartCard title="Bookings per day (14 days to end date)" summary={`${perDay.reduce((a, d) => a + d.bookings, 0)} bookings in the window.`}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={perDay}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Legend /><Bar dataKey="bookings" name="Created" fill="#0b84d6" /><Bar dataKey="completed" name="Completed" fill="#16a34a" /></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Booking summary by status" summary={dist.length ? dist.map((d) => `${d.name}: ${d.value}`).join(', ') : 'No bookings in range.'}>
          {dist.length === 0 ? <p className="flex h-full items-center justify-center text-sm text-ink-soft">No bookings in this range.</p> : <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dist} dataKey="value" nameKey="name" outerRadius={85} label={(e) => `${e.name} ${e.value}`}>{dist.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>}
        </ChartCard>
        <ChartCard title="Ambulance utilization (completed trips)" summary={sum.ambulanceUtilization.map((a) => `${a.name}: ${a.trips}`).join(', ')}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={sum.ambulanceUtilization}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={10} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Legend /><Bar dataKey="trips" name="Completed" fill="#16a34a" /><Bar dataKey="active" name="In progress" fill="#f59e0b" /></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Driver activity" summary={sum.driverActivity.map((d) => `${d.name}: ${d.completed} completed`).join(', ')}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={sum.driverActivity}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={10} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Legend /><Bar dataKey="completed" name="Completed" fill="#16a34a" /><Bar dataKey="cancelled" name="Cancelled" fill="#e5383b" /><Bar dataKey="declined" name="Declined" fill="#7d99c9" /></BarChart></ResponsiveContainer>
        </ChartCard>
      </div>
    </>
  );
}
