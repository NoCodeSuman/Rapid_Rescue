import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { PageHeading } from '../../components/common/PageHeading';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { TextField } from '../../components/ui/Field';
import { useAuth } from '../../contexts/AuthContext';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { patientProfileSchema } from '../../lib/schemas';
import { services } from '../../services';

type Form = z.infer<typeof patientProfileSchema>;

export default function PatientProfile() {
  const { user, isDemoSession } = useAuth();
  const state = useAppState();
  const profile = state.profiles.find((p) => p.userId === user?.id);
  const { run, busy } = useAction();
  const values: Form = { name: user?.name ?? '', phone: user?.phone ?? '', address: profile?.address ?? '', emergencyContactName: profile?.emergencyContactName ?? '', emergencyContactPhone: profile?.emergencyContactPhone ?? '' };
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<Form>({ resolver: zodResolver(patientProfileSchema), defaultValues: values });
  useEffect(() => { reset(values); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name, user?.phone, profile?.address, profile?.emergencyContactName, profile?.emergencyContactPhone]);

  const save = handleSubmit(async (d) => { if (user) await run('save', () => services.users.updatePatientProfile(user.id, d), isDemoSession ? 'Profile saved in the local data.' : 'Profile saved. Name and phone are stored in your account profile; address and emergency contact stay on this device.'); });

  return (
    <>
      <PageHeading title="Profile" description={isDemoSession ? 'Edit your profile. Changes are stored in this browser only.' : 'Name and phone are saved to your account profile. Address and emergency contact are stored in this browser only.'} crumbs={[{ label: 'Patient', to: '/patient/dashboard' }, { label: 'Profile' }]} />
      <form noValidate onSubmit={save} className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Personal details" />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <TextField label="Full name" required error={errors.name?.message} {...register('name')} />
            <TextField label="Phone" type="tel" required error={errors.phone?.message} {...register('phone')} />
            <div className="sm:col-span-2"><TextField label="Email" value={user?.email ?? ''} readOnly disabled hint={isDemoSession ? 'Email is your sign-in and cannot be changed here.' : 'Your sign-in email (from Firebase Authentication). It cannot be changed here.'} /></div>
            <div className="sm:col-span-2"><TextField label="Address" hint={isDemoSession ? undefined : 'Saved on this device only (not in your account profile).'} error={errors.address?.message} {...register('address')} /></div>
            <TextField label="Emergency contact name" hint={isDemoSession ? undefined : 'Saved on this device only (not in your account profile).'} error={errors.emergencyContactName?.message} {...register('emergencyContactName')} />
            <TextField label="Emergency contact phone" type="tel" hint={isDemoSession ? undefined : 'Saved on this device only (not in your account profile).'} error={errors.emergencyContactPhone?.message} {...register('emergencyContactPhone')} />
          </CardBody>
          <div className="flex justify-end gap-2 border-t border-surface-border px-5 py-3">
            <Button variant="outline" disabled={!isDirty || busy} onClick={() => reset(values)}>Cancel changes</Button>
            <Button type="submit" loading={busy} disabled={!isDirty}>Save profile</Button>
          </div>
        </Card>
        <Card className="self-start"><CardHeader title="Account" /><CardBody className="space-y-1 text-sm"><p><span className="text-ink-soft">Role:</span> Patient</p><p><span className="text-ink-soft">Status:</span> {user?.status}</p><p className="pt-2 text-xs text-ink-faint">Fictional local data only. Do not enter real personal or medical information.</p></CardBody></Card>
      </form>
    </>
  );
}
