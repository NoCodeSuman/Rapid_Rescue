import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '../../components/ui/Button';
import { PasswordField, SelectField, TextField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/misc';
import { dashboardPath, useAuth } from '../../contexts/AuthContext';
import { useAction } from '../../hooks/useAction';
import { registerSchema } from '../../lib/schemas';

type Form = z.input<typeof registerSchema>;

export default function Register() {
  const reduceMotion = useReducedMotion();
  const { user, register: signUp, configError } = useAuth();
  const nav = useNavigate();
  const { run, busy } = useAction();
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(registerSchema), defaultValues: { role: 'patient', name: '', email: '', phone: '', password: '', confirmPassword: '' } });
  if (user) return <Navigate to={dashboardPath(user.role)} replace />;

  const submit = handleSubmit(async (d) => {
    const parsed = registerSchema.parse(d);
    const r = await run('register', () => signUp({ name: parsed.name, email: parsed.email, phone: parsed.phone, password: parsed.password, role: parsed.role }));
    // The account exists even if the verification email failed; the verification page lets the user resend it.
    if (r) nav('/verify-email', { replace: true, state: { fresh: true, emailSent: r.verificationEmailSent, emailError: r.verificationError, profileError: r.profileError } });
  });

  return (
    <motion.div className="mx-auto max-w-xl px-4 py-10 sm:px-6 lg:py-14" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.68, ease: [0.16, 1, 0.3, 1] }}>
      <h1 className="text-3xl font-semibold">Create an account</h1>
      <p className="mt-1 text-sm text-ink-soft">Your account is created with Firebase Authentication and a verification email is sent. Name, phone and role are kept only in this browser's local data. Administrator accounts cannot be registered.</p>
      <form className="mt-6 space-y-4" noValidate onSubmit={submit}>
        <TextField label="Full name" autoComplete="name" required error={errors.name?.message} {...register('name')} />
        <TextField label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email')} />
        <TextField label="Phone" type="tel" autoComplete="tel" required hint="Example: +91 98000 12345 (use a sample number)" error={errors.phone?.message} {...register('phone')} />
        <SelectField label="I am registering as" required error={errors.role?.message} {...register('role')}>
          <option value="patient">Patient</option>
          <option value="driver">Ambulance driver</option>
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField label="Password" autoComplete="new-password" required hint="8+ characters, with a letter and a number. Sent to Firebase Authentication; this app never stores it." error={errors.password?.message} {...register('password')} />
          <PasswordField label="Confirm password" autoComplete="new-password" required error={errors.confirmPassword?.message} {...register('confirmPassword')} />
        </div>
        <div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" aria-invalid={!!errors.terms} {...register('terms')} />
            <span>I understand this is an prototype that uses illustrative data and does not contact emergency services.</span></label>
          {errors.terms && <p role="alert" className="mt-1 text-xs font-medium text-danger-700">{errors.terms.message}</p>}
        </div>
        {configError && <Alert tone="danger" title="Firebase is not configured">{configError}</Alert>}
        <Alert tone="info">New driver accounts start offline with no ambulance. An administrator can assign one under Admin → Drivers.</Alert>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!!configError}><UserPlus className="h-4 w-4" aria-hidden />Create account</Button>
      </form>
      <p className="mt-4 text-sm text-ink-soft">Already registered? <Link to="/login" className="font-medium text-brand-700 hover:underline">Log in</Link></p>
    </motion.div>
  );
}
