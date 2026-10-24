import { MailCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card, CardBody } from '../../components/ui/Card';
import { Alert, Spinner } from '../../components/ui/misc';
import { dashboardPath, useAuth } from '../../contexts/AuthContext';
import { useAction } from '../../hooks/useAction';
import { notify } from '../../hooks/useNotify';

const COOLDOWN_SECONDS = 30;

/** Verification-pending screen. Unverified users stay signed in here so they can resend, re-check, or log out. */
export default function VerifyEmail() {
  const { status, user, identity, resendVerification, recheckVerification, logout } = useAuth();
  const nav = useNavigate();
  const nav_state = (useLocation().state as { fresh?: boolean; emailSent?: boolean; emailError?: string; profileError?: string } | null) ?? null;
  const { run, pending, busy } = useAction();
  const [cooldown, setCooldown] = useState(nav_state?.fresh && nav_state.emailSent ? COOLDOWN_SECONDS : 0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  if (status === 'initializing') return <Spinner label="Checking your session" />;
  if (user) return <Navigate to={dashboardPath(user.role)} replace />;
  if (status !== 'unverified' || !identity) return <Navigate to="/login" replace />;

  const resend = async () => {
    const ok = await run('resend', async () => { await resendVerification(); return true; }, 'Verification email requested. Check your inbox and spam folder.');
    if (ok) setCooldown(COOLDOWN_SECONDS);
  };
  const recheck = async () => {
    const verified = await run('recheck', recheckVerification);
    if (verified === false) notify.info('Your email is not verified yet. Open the link in the email, then try again.');
    // When verified, the context resolves the app user and this page redirects to the dashboard.
  };
  const signOut = async () => { const ok = await run('logout', async () => { await logout(); return true; }); if (ok) nav('/login', { replace: true }); };

  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:px-6 lg:py-20">
      <Card><CardBody className="space-y-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700"><MailCheck className="h-6 w-6" aria-hidden /></span>
        <h1 className="text-2xl font-semibold">Verify your email</h1>
        {nav_state?.fresh && nav_state.emailSent && <Alert tone="success">Your account was created and a verification email was requested for <strong>{identity.email}</strong>.</Alert>}
        {nav_state?.fresh && nav_state.emailSent === false && <Alert tone="danger" title="Account created, but the verification email failed">{nav_state.emailError ?? 'Please try the resend button below.'}</Alert>}
        {nav_state?.fresh && nav_state.profileError && <Alert tone="warning" title="Your profile was not saved yet">{nav_state.profileError} We will retry automatically after you verify your email.</Alert>}
        <p className="text-sm text-ink-soft">You must verify <strong>{identity.email}</strong> before you can open your dashboard. Click the link in the Firebase email (check your spam folder too), then press <em>I've verified my email</em>.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={recheck} loading={pending === 'recheck'} disabled={busy}>I've verified my email</Button>
          <Button variant="outline" onClick={resend} loading={pending === 'resend'} disabled={busy || cooldown > 0}>{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend verification email'}</Button>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} loading={pending === 'logout'} disabled={busy}>Log out / use a different account</Button>
      </CardBody></Card>
    </div>
  );
}
