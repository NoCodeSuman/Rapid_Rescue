import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/misc';
import { useAction } from '../../hooks/useAction';
import { forgotSchema } from '../../lib/schemas';
import { useAuth } from '../../contexts/AuthContext';

type Form = z.infer<typeof forgotSchema>;

export default function ForgotPassword() {
  const { sendPasswordReset, configError } = useAuth();
  const { run, busy } = useAction();
  const [done, setDone] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(forgotSchema), defaultValues: { email: '' } });
  const submit = handleSubmit(async (d) => { const r = await run('reset', async () => { await sendPasswordReset(d.email); return true; }); if (r) setDone(true); });
  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 lg:py-20">
      <h1 className="text-3xl font-semibold">Forgot password</h1>
      <p className="mt-1 text-sm text-ink-soft">Enter your account email and Firebase will send reset instructions.</p>
      {configError && <Alert tone="danger" className="mt-4" title="Firebase is not configured">{configError}</Alert>}
      {done ? (
        <Alert tone="success" title="Request submitted" className="mt-6">If an account exists for this address, Firebase will send password-reset instructions. Check your inbox and spam folder; delivery can take a few minutes.</Alert>
      ) : (
        <form className="mt-6 space-y-4" noValidate onSubmit={submit}>
          <TextField label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email')} />
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!!configError}>Send reset email</Button>
        </form>
      )}
      <p className="mt-4 text-sm"><Link to="/login" className="font-medium text-brand-700 hover:underline">Back to log in</Link></p>
    </div>
  );
}
