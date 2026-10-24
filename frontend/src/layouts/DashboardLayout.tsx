import { Home, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../components/layout/Brand';
import { BalancePaymentPrompt } from '../components/common/BalancePaymentPrompt';
import { NotificationBell } from '../components/layout/NotificationBell';
import { useAuth } from '../contexts/AuthContext';
import { NAV, ROLE_LABEL } from '../routes/nav';
import { initials } from '../utils/format';
import { cx } from '../lib/cx';
import { errMsg, notify } from '../hooks/useNotify';
import type { UserRole } from '../types';

export function DashboardLayout({ role }: { role: UserRole }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const main = useRef<HTMLElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);

  // Move focus to the page content after navigation and close the mobile drawer.
  useEffect(() => { setOpen(false); main.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); menuBtn.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const signOut = async () => {
    try { await logout(); notify.info('Signed out.'); nav('/login', { replace: true }); }
    catch (e) { notify.error(errMsg(e)); }
  };

  const links = (
    <nav aria-label={`${ROLE_LABEL[role]} navigation`} className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
      {NAV[role].map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => cx('flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium', isActive ? 'bg-white/15 text-white' : 'text-navy-100 hover:bg-white/10 hover:text-white')}>
          <Icon className="h-4 w-4 shrink-0" aria-hidden />{label}
        </NavLink>
      ))}
    </nav>
  );
  const homeLink = (
    <div className="px-3 pb-2">
      <NavLink to="/" end onClick={() => setOpen(false)} className={({ isActive }) => cx('flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium', isActive ? 'bg-white/15 text-white' : 'text-navy-100 hover:bg-white/10 hover:text-white')}>
        <Home className="h-4 w-4 shrink-0" aria-hidden />Home
      </NavLink>
    </div>
  );
  const logoutBtn = (
    <div className="border-t border-white/10 p-3">
      <button type="button" onClick={signOut} className="flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-navy-100 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" aria-hidden />Logout</button>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-toast focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to main content</a>
      <aside className="fixed inset-y-0 left-0 z-sidebar hidden w-64 flex-col bg-navy-900 lg:flex">
        <div className="flex h-16 items-center px-4"><Brand to="/" light /></div>
        {links}{homeLink}{logoutBtn}
      </aside>

      {open && <div className="fixed inset-0 z-modal lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
        <button type="button" aria-label="Close menu" className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
        <div className="relative flex h-full w-72 max-w-[85%] flex-col bg-navy-900">
          <div className="flex h-16 items-center justify-between px-4"><Brand to="/" light />
            <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex h-10 w-10 items-center justify-center rounded-md text-white hover:bg-white/10"><X className="h-5 w-5" aria-hidden /></button></div>
          {links}{homeLink}{logoutBtn}
        </div>
      </div>}

      <header className="sticky top-0 z-header flex h-16 items-center justify-between border-b border-surface-border bg-white px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button ref={menuBtn} type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="flex h-10 w-10 items-center justify-center rounded-md text-navy-800 hover:bg-navy-50 lg:hidden"><Menu className="h-5 w-5" aria-hidden /></button>
          <span className="hidden rounded-full bg-warning-100 px-3 py-1 text-xs font-medium text-warning-700 sm:inline">Not an emergency service</span>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <div className="flex items-center gap-2 pl-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white" aria-hidden>{initials(user?.name ?? '')}</span>
            <div className="hidden text-left leading-tight sm:block"><p className="text-sm font-medium text-ink">{user?.name}</p><p className="text-xs text-ink-faint">{ROLE_LABEL[role]}</p></div>
          </div>
        </div>
      </header>

      <main id="main" ref={main} tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 focus:outline-none sm:px-6">
        <Outlet />
      </main>
      {role === 'patient' && <BalancePaymentPrompt />}
    </div>
  );
}
