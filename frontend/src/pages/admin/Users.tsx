import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, Pencil, Power } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeading } from '../../components/common/PageHeading';
import { DataTable, type Column } from '../../components/tables/DataTable';
import { FilterBar, FilterSelect } from '../../components/tables/FilterBar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { SelectField, TextField } from '../../components/ui/Field';
import { useAuth } from '../../contexts/AuthContext';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { userEditSchema } from '../../lib/schemas';
import { ROLE_LABEL } from '../../routes/nav';
import { services } from '../../services';
import type { User } from '../../types';
import { formatDate } from '../../utils/format';

type Form = z.infer<typeof userEditSchema>;

export default function Users() {
  const { user: me } = useAuth();
  const state = useAppState();
  const { run, busy } = useAction();
  const [q, setQ] = useState(''); const [role, setRole] = useState('all'); const [status, setStatus] = useState('all');
  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [toggleId, setToggleId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return state.users.filter((u) => (role === 'all' || u.role === role) && (status === 'all' || u.status === status) && (!t || [u.name, u.email, u.phone].some((x) => x.toLowerCase().includes(t))));
  }, [state.users, q, role, status]);
  const byId = (id: string | null) => state.users.find((u) => u.id === id) ?? null;
  const viewing = byId(viewId), editing = byId(editId), toggling = byId(toggleId);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<Form>({ resolver: zodResolver(userEditSchema), defaultValues: { name: '', phone: '', status: 'active' } });
  useEffect(() => { if (editing) reset({ name: editing.name, phone: editing.phone, status: editing.status }); }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols: Column<User>[] = [
    { key: 'name', header: 'Name', sortValue: (u) => u.name, cell: (u) => <span className="font-medium">{u.name}</span> },
    { key: 'email', header: 'Email', sortValue: (u) => u.email, cell: (u) => u.email || <span className="text-ink-faint">Not yet verified</span> },
    { key: 'role', header: 'Role', sortValue: (u) => u.role, cell: (u) => ROLE_LABEL[u.role] },
    { key: 'status', header: 'Status', sortValue: (u) => u.status, cell: (u) => <Badge tone={u.status === 'active' ? 'success' : 'neutral'}>{u.status === 'active' ? 'Active' : 'Inactive'}</Badge> },
    { key: 'created', header: 'Joined', sortValue: (u) => u.createdAt, cell: (u) => formatDate(u.createdAt) },
    { key: 'a', header: 'Actions', cell: (u) => (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => setViewId(u.id)}><Eye className="h-3.5 w-3.5" aria-hidden />View<span className="sr-only"> {u.name}</span></Button>
        <Button size="sm" variant="outline" onClick={() => setEditId(u.id)}><Pencil className="h-3.5 w-3.5" aria-hidden />Edit<span className="sr-only"> {u.name}</span></Button>
        <Button size="sm" variant="ghost" disabled={u.role === 'admin'} title={u.role === 'admin' ? 'The booking administrator is protected' : undefined} onClick={() => setToggleId(u.id)}><Power className="h-3.5 w-3.5" aria-hidden />{u.status === 'active' ? 'Deactivate' : 'Activate'}<span className="sr-only"> {u.name}</span></Button>
      </div>) },
  ];

  return (
    <>
      <PageHeading title="Users" description="Manage booking users. Roles cannot be changed here; the booking administrator is protected." crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Users' }]} />
      <Card>
        <FilterBar search={q} onSearch={setQ} placeholder="Name, email or phone…" active={q !== '' || role !== 'all' || status !== 'all'} onClear={() => { setQ(''); setRole('all'); setStatus('all'); }}>
          <FilterSelect label="Role" value={role} onChange={setRole} options={[{ value: 'all', label: 'All roles' }, { value: 'patient', label: 'Patient' }, { value: 'driver', label: 'Driver' }, { value: 'admin', label: 'Administrator' }]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        </FilterBar>
        <DataTable rows={rows} columns={cols} rowKey={(u) => u.id} caption="Users" initialSort={{ key: 'name', dir: 'asc' }} emptyTitle="No users match your filters" emptyHint="Clear the filters to see all users." />
      </Card>

      <Dialog open={!!viewing} onClose={() => setViewId(null)} title={viewing?.name ?? 'User'} footer={<Button variant="outline" onClick={() => setViewId(null)}>Close</Button>}>
        {viewing && <dl className="space-y-2 text-sm">{[['Email', viewing.email || 'Not available until the email is verified'], ['Phone', viewing.phone], ['Role', ROLE_LABEL[viewing.role]], ['Status', viewing.status], ['Joined', formatDate(viewing.createdAt)], ['Bookings', String(state.bookings.filter((b) => b.patientId === viewing.id).length)]].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-ink-soft">{k}</dt><dd>{v}</dd></div>)}</dl>}
      </Dialog>

      <Dialog open={!!editing} onClose={() => setEditId(null)} title={`Edit ${editing?.name ?? 'user'}`} description="Role and email cannot be changed."
        footer={<><Button variant="outline" onClick={() => setEditId(null)} disabled={busy}>Cancel</Button><Button type="submit" form="user-edit" loading={busy}>Save changes</Button></>}>
        <form id="user-edit" noValidate className="space-y-4" onSubmit={handleSubmit(async (d) => { if (me && editing) { const r = await run('edit', () => services.users.updateUser(me.id, editing.id, d), 'User updated.'); if (r) setEditId(null); } })}>
          <TextField label="Full name" required error={errors.name?.message} {...register('name')} />
          <TextField label="Phone" type="tel" required error={errors.phone?.message} {...register('phone')} />
          <SelectField label="Status" disabled={editing?.role === 'admin'} hint={editing?.role === 'admin' ? 'The booking administrator stays active.' : undefined} error={errors.status?.message} {...register('status')}><option value="active">Active</option><option value="inactive">Inactive</option></SelectField>
        </form>
      </Dialog>

      <ConfirmDialog open={!!toggling} onClose={() => setToggleId(null)} loading={busy} danger={toggling?.status === 'active'} title={toggling?.status === 'active' ? 'Deactivate user?' : 'Activate user?'} confirmLabel={toggling?.status === 'active' ? 'Deactivate' : 'Activate'}
        message={<p>{toggling?.status === 'active' ? `${toggling?.name} will no longer be able to log in${toggling?.role === 'driver' ? ' and will be set offline' : ''}.` : `${toggling?.name} will be able to log in again.`}</p>}
        onConfirm={async () => { if (me && toggling) { const r = await run('tog', () => services.users.updateUser(me.id, toggling.id, { name: toggling.name, phone: toggling.phone, status: toggling.status === 'active' ? 'inactive' : 'active' }), 'User status updated.'); if (r) setToggleId(null); } }} />
    </>
  );
}
