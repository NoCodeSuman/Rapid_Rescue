import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeading } from '../../components/common/PageHeading';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { TextField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { activeDriverBooking, ambulanceById, driverByUserId } from '../../domain/selectors';
import { AMBULANCE_TYPE_LABELS } from '../../domain/status';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { contactSchema } from '../../lib/schemas';
import { services } from '../../services';

type Form = z.infer<typeof contactSchema>;

export default function DriverProfile() {
  const { user, isDemoSession } = useAuth();
  const state = useAppState();
  const { run, busy } = useAction();
  const driver = user ? driverByUserId(state, user.id) : undefined;
  const values: Form = { name: user?.name ?? '', phone: user?.phone ?? '' };
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<Form>({ resolver: zodResolver(contactSchema), defaultValues: values });
  useEffect(() => { reset(values); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name, user?.phone]);
  if (!user || !driver) return <Alert tone="danger">Driver profile not found.</Alert>;
  const amb = ambulanceById(state, driver.ambulanceId);
  const active = activeDriverBooking(state, driver.id);

  return (
    <>
      <PageHeading title="Profile" description={isDemoSession ? 'Your driver details.' : 'Name and phone are saved to your account profile. The driver record is local data on this device.'} crumbs={[{ label: 'Driver', to: '/driver/dashboard' }, { label: 'Profile' }]} />
      <div className="grid gap-5 lg:grid-cols-3">
        <form noValidate className="lg:col-span-2" onSubmit={handleSubmit((d) => run('save', () => services.users.updateOwnContact(user.id, d), isDemoSession ? 'Profile saved in the local data.' : 'Profile saved. Name and phone are stored in your account profile; the driver record below is local data on this device.'))}>
          <Card>
            <CardHeader title="Contact details" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <TextField label="Full name" required error={errors.name?.message} {...register('name')} />
              <TextField label="Phone" type="tel" required error={errors.phone?.message} {...register('phone')} />
              <div className="sm:col-span-2"><TextField label="Email" value={user.email} readOnly disabled hint={isDemoSession ? undefined : 'Your sign-in email (from Firebase Authentication). It cannot be changed here.'} /></div>
            </CardBody>
            <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3"><Button variant="outline" disabled={!isDirty || busy} onClick={() => reset(values)}>Cancel changes</Button><Button type="submit" disabled={!isDirty} loading={busy}>Save</Button></div>
          </Card>
        </form>
        <Card className="self-start">
          <CardHeader title="Driver record" description={isDemoSession ? 'Managed by administrators' : 'local data on this device (not in your account profile). Driver approval is not implemented yet.'} />
          <CardBody className="space-y-2 text-sm">
            <p><span className="text-ink-soft">Driver ID:</span> {driver.driverCode}</p>
            <p><span className="text-ink-soft">Licence record:</span> {driver.licenseNumber}</p>
            <p><span className="text-ink-soft">Ambulance:</span> {amb ? `${amb.registration} · ${AMBULANCE_TYPE_LABELS[amb.type]}` : 'None assigned'}</p>
            <p className="flex items-center gap-2"><span className="text-ink-soft">Availability:</span><Badge tone={driver.availability === 'online' ? 'success' : 'neutral'}>{driver.availability === 'online' ? 'Online' : 'Offline'}</Badge></p>
            <p><span className="text-ink-soft">Current assignment:</span> {active ? active.ref : 'None'}</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
