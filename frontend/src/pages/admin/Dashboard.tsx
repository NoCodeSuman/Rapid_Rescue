import { Activity, CheckCircle2, ClipboardList, Truck, Users, UserCog, Wrench } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from '../../components/common/ChartCard';
import { PageHeading } from '../../components/common/PageHeading';
import { StatCard } from '../../components/common/StatCard';
import { StatusBadge } from '../../components/ui/Badge';
import { LinkButton } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Alert, EmptyState } from '../../components/ui/misc';
import { recommendDispatch } from '../../domain/dispatch';
import { adminStats, bookingsPerDay, statusDistribution, userById } from '../../domain/selectors';
import { useAppState } from '../../hooks/useAppState';
import { IS_LIVE_DATA } from '../../services/store';
import { formatDateTime } from '../../utils/format';

const PIE = ['#f59e0b', '#2f9fec', '#0b84d6', '#4f72ad', '#7d99c9', '#1e4073', '#16a34a', '#e5383b', '#a61e21'];

export default function AdminDashboard() {
  const state = useAppState();
  const stats = useMemo(() => adminStats(state), [state]);
  const perDay = useMemo(() => bookingsPerDay(state.bookings, 14), [state.bookings]);
  const dist = useMemo(() => statusDistribution(state.bookings), [state.bookings]);
  const avail = useMemo(() => [{ name: 'Available', value: stats.availableAmbulances }, { name: 'Busy', value: stats.busyAmbulances }, { name: 'Offline', value: stats.offlineAmbulances }], [stats]);
  const recent = useMemo(() => [...state.bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), [state.bookings]);
  const pending = useMemo(() => state.bookings.filter((b) => b.status === 'requested').map((b) => ({ b, rec: recommendDispatch(state, b) })), [state]);

  return (
    <>
      <PageHeading title="Admin dashboard" description="Operations overview across all local data." />
      {IS_LIVE_DATA ? (
        <Alert tone="info" className="mb-5" title="Live Operations">
          Connected to Cloud Firestore. Live synchronized operational figures across all users, drivers, fleet, and bookings.
        </Alert>
      ) : (
        <Alert tone="warning" className="mb-5" title="Operational overview">
          All figures below come from simulated illustrative records stored in this browser.
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total bookings" value={stats.totalBookings} icon={ClipboardList} tone="navy" />
        <StatCard label="Active bookings" value={stats.activeBookings} icon={Activity} tone="warning" />
        <StatCard label="Available ambulances" value={stats.availableAmbulances} icon={Truck} tone="success" />
        <StatCard label="Busy ambulances" value={stats.busyAmbulances} icon={Wrench} tone="danger" />
        <StatCard label="Active users" value={stats.activeUsers} hint={`${stats.totalUsers} registered users`} icon={Users} tone="brand" />
        <StatCard label="Total drivers" value={stats.totalDrivers} hint={`${stats.activeDrivers} online now`} icon={UserCog} tone="brand" />
        <StatCard label="Pending requests" value={stats.pendingRequests} icon={ClipboardList} tone="warning" />
        <StatCard label="Completed trips" value={state.bookings.filter((b) => b.status === 'completed').length} icon={CheckCircle2} tone="success" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <ChartCard title="Booking activity (last 14 days)" summary={`${perDay.reduce((a, d) => a + d.bookings, 0)} bookings created in the last 14 days.`}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={perDay}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Legend /><Line type="monotone" dataKey="bookings" name="Created" stroke="#0b84d6" strokeWidth={2} /><Line type="monotone" dataKey="completed" name="Completed" stroke="#16a34a" strokeWidth={2} /></LineChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Booking status distribution" summary={dist.map((d) => `${d.name}: ${d.value}`).join(', ')}>
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dist} dataKey="value" nameKey="name" outerRadius={85} label={(e) => `${e.name} ${e.value}`}>{dist.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Ambulance availability" summary={avail.map((d) => `${d.name}: ${d.value}`).join(', ')}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={avail}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="value" name="Ambulances">{avail.map((d, i) => <Cell key={d.name} fill={['#16a34a', '#f59e0b', '#7d99c9'][i]} />)}</Bar></BarChart></ResponsiveContainer>
        </ChartCard>
        <Card>
          <CardHeader title="Dispatch overview" description="Simulated recommendations for pending requests" action={<LinkButton to="/admin/dispatch" size="sm" variant="outline">Open dispatch</LinkButton>} />
          {pending.length === 0 ? <EmptyState title="No pending requests" /> : (
            <ul className="divide-y divide-surface-border">
              {pending.map(({ b, rec }) => (
                <li key={b.id} className="px-5 py-3 text-sm"><p className="font-medium">{b.ref} <span className="font-normal text-ink-soft">· {b.pickup.label}</span></p>
                  <p className="text-xs text-ink-soft">{rec.recommended ? `Recommended: ${state.ambulances.find((a) => a.id === rec.recommended!.ambulanceId)?.registration} (~${rec.recommended.etaMinutes} min, simulated)` : 'No eligible ambulance'}</p></li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent bookings" action={<Link to="/admin/bookings" className="text-sm font-medium text-brand-700 hover:underline">View all</Link>} />
          <ul className="divide-y divide-surface-border">
            {recent.map((b) => <li key={b.id} className="flex items-center justify-between gap-2 px-5 py-3 text-sm"><div><p className="font-medium">{b.ref}</p><p className="text-xs text-ink-faint">{userById(state, b.patientId)?.name} · {formatDateTime(b.createdAt)}</p></div><StatusBadge status={b.status} /></li>)}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recent activity" />
          <CardBody className="p-0">{state.activity.length === 0 ? <EmptyState title="No activity yet" /> : (
            <ul className="divide-y divide-surface-border">{state.activity.slice(0, 6).map((a) => <li key={a.id} className="px-5 py-3 text-sm"><p>{a.message}</p><p className="text-xs text-ink-faint">{formatDateTime(a.at)}</p></li>)}</ul>
          )}</CardBody>
        </Card>
      </div>
    </>
  );
}
