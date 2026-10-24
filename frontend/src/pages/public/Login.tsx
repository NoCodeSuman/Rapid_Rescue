import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, LogIn } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '../../components/ui/Button';
import { ProfileProblem } from '../../components/common/ProfileProblem';
import { PasswordField, TextField } from '../../components/ui/Field';
import { Alert } from '../../components/ui/misc';
import { Card, CardBody } from '../../components/ui/Card';
import { dashboardPath, useAuth } from '../../contexts/AuthContext';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../../data/seed';
import { useAction } from '../../hooks/useAction';
import { notify } from '../../hooks/useNotify';
import { loginSchema } from '../../lib/schemas';
import { cx } from '../../lib/cx';
import type { UserRole } from '../../types';

type Form = z.infer<typeof loginSchema>;

export default function Login() {
  const reduceMotion = useReducedMotion();
  const { user, status, login, loginDemo, demoMode, configError } = useAuth();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from;
  const { run, busy } = useAction();
  const { register, handleSubmit, setValue, formState: { errors } } = useForm<Form>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } });

  // Declarative redirects: verified users go to their dashboard (or the page they came from); unverified users to verification.
  if (user) return <Navigate to={from && from.startsWith(`/${user.role}`) ? from : dashboardPath(user.role)} replace />;
  if (status === 'unverified') return <Navigate to="/verify-email" replace />;
  if (status === 'profile_error') return <ProfileProblem />;

  const submit = handleSubmit(async (d) => {
    const r = await run('login', () => login(d.email, d.password));
    if (r?.verified && r.user) notify.success('Signed in.');
  });
  const go = async (email: string, password: string) => { await run('demo-login', () => loginDemo(email, password), 'Signed in using development credentials.'); };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); notify.success(`${what} copied.`); } catch { notify.error('Copy is not available in this browser.'); }
  };
  const roles: { role: UserRole; label: string }[] = [{ role: 'patient', label: 'Patient' }, { role: 'driver', label: 'Driver' }, { role: 'admin', label: 'Admin' }];

  return (
    <motion.div className={cx('mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:py-16', demoMode ? 'lg:grid-cols-2' : 'max-w-md')} initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.68, ease: [0.16, 1, 0.3, 1] }}>
      <section aria-labelledby="login-h">
        <h1 id="login-h" className="text-3xl font-semibold">Log in</h1>
        <p className="mt-1 text-sm text-ink-soft">Sign in with your RapidRescue account. Authentication is provided by Firebase; this site is a prototype using illustrative data.</p>
        {from && <Alert tone="info" className="mt-4">Please log in to continue to {from}.</Alert>}
        {configError && <Alert tone="danger" className="mt-4" title="Firebase is not configured">{configError}</Alert>}
        <form className="mt-6 space-y-4" noValidate onSubmit={submit}>
          <TextField label="Email" type="email" autoComplete="email" required error={errors.email?.message} {...register('email')} />
          <PasswordField label="Password" autoComplete="current-password" required error={errors.password?.message} {...register('password')} />
          <div className="flex justify-end text-sm"><Link to="/forgot-password" className="font-medium text-brand-700 hover:underline">Forgot password?</Link></div>
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!!configError}><LogIn className="h-4 w-4" aria-hidden />Log in</Button>
        </form>
        <p className="mt-4 text-sm text-ink-soft">New here? <Link to="/register" className="font-medium text-brand-700 hover:underline">Create an account</Link></p>
      </section>

      {demoMode && (
      <Card className="self-start" aria-labelledby="booking-h">
        <CardBody className="space-y-4">
          <div>
            <h2 id="booking-h" className="text-lg font-semibold">Development sign-in options</h2>
            <p className="text-sm text-ink-soft">Preconfigured accounts for <strong>development builds only</strong> (not Firebase, no email verification, ignored in production builds). Password for all three: <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-navy-800">{DEMO_PASSWORD}</code>
              <button type="button" onClick={() => copy(DEMO_PASSWORD, 'Password')} className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"><Copy className="h-3 w-3" aria-hidden />Copy</button></p>
          </div>
          <ul className="space-y-2">
            {roles.map(({ role, label }) => (
              <li key={role} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border p-3">
                <div><p className="text-sm font-medium">{label}</p><p className="font-mono text-xs text-ink-soft">{DEMO_ACCOUNTS[role]}</p></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setValue('email', DEMO_ACCOUNTS[role]); setValue('password', DEMO_PASSWORD); }}>Fill form</Button>
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => go(DEMO_ACCOUNTS[role], DEMO_PASSWORD)}>Log in as {label}</Button>
                </div>
              </li>
            ))}
          </ul>
          <Alert tone="warning">This panel only exists when VITE_ENABLE_DEMO_MODE=true in <code>vite dev</code>. Firebase sign-in always takes priority over a development session.</Alert>
        </CardBody>
      </Card>
      )}
    </motion.div>
  );
}