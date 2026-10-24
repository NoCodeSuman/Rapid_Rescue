import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Brand } from '../components/layout/Brand';
import { LinkButton } from '../components/ui/Button';
import { useAuth, dashboardPath } from '../contexts/AuthContext';

const links = [
  { to: '/#how-it-works', label: 'How it works' },
  { to: '/#roles', label: 'Roles' },
  { to: '/#smart-dispatch', label: 'Smart dispatch' },
  { to: '/#safety', label: 'Safety notice' },
];

export function PublicLayout() {
  const { user, status } = useAuth();
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const firstLocationEffect = useRef(true);

  useEffect(() => {
    setOpen(false);

    // A browser can restore a previous scroll position (and preserve a #section URL)
    // on refresh. Always start the public landing page at the top on initial load.
    if (firstLocationEffect.current) {
      firstLocationEffect.current = false;
      if (loc.hash) navigate(`${loc.pathname}${loc.search}`, { replace: true });
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return;
    }

    if (loc.hash) {
      const el = document.getElementById(loc.hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [loc.pathname, loc.hash, loc.search, navigate]);

  const auth = user
    ? <LinkButton to={dashboardPath(user.role)} size="sm">Go to dashboard</LinkButton>
    : status === 'unverified' ? <LinkButton to="/verify-email" size="sm">Verify your email</LinkButton>
    : <><LinkButton to="/login" variant="outline" size="sm">Log in</LinkButton><LinkButton to="/register" size="sm">Register</LinkButton></>;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-toast focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to main content</a>
      <header className="sticky top-0 z-header border-b border-surface-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
            {links.map((l) => <Link key={l.to} to={l.to} className="text-sm font-medium text-ink-soft hover:text-navy-900">{l.label}</Link>)}
          </nav>
          <div className="hidden items-center gap-2 md:flex">{auth}</div>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-navy-50 md:hidden" aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
        {open && (
          <div id="mobile-nav" className="border-t border-surface-border px-4 pb-4 md:hidden">
            <nav aria-label="Mobile primary" className="flex flex-col py-2">
              {links.map((l) => <Link key={l.to} to={l.to} className="min-h-[44px] rounded-md px-2 py-3 text-sm font-medium text-ink-soft hover:bg-navy-50">{l.label}</Link>)}
            </nav>
            <div className="flex gap-2">{auth}</div>
          </div>
        )}
      </header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          id="main"
          key={loc.pathname}
          className="flex-1"
          initial={reduceMotion ? false : { opacity: 0, y: 7 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -3 }}
          transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <Outlet />
        </motion.main>
      </AnimatePresence>
      <footer className="bg-navy-950 text-navy-100">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr] md:gap-14">
          <div>
            <Brand light />
            <p className="mt-4 max-w-sm text-base font-semibold leading-relaxed text-white">Smarter dispatch. Clearer decisions. Better-coordinated journeys.</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-navy-200">A patient transport coordination platform designed to bring booking, driver workflows and dispatch planning together.</p>
          </div>
          <nav aria-label="Explore RapidRescue" className="flex flex-col items-start gap-3 text-sm">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-navy-300">Explore</h2>
            <Link to="/" className="transition-colors hover:text-white">Home</Link>
            {links.map((l) => <Link key={l.to} to={l.to} className="transition-colors hover:text-white">{l.label}</Link>)}
          </nav>
          <nav aria-label="Your account" className="flex flex-col items-start gap-3 text-sm">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-navy-300">Your account</h2>
            <Link to="/login" className="transition-colors hover:text-white">Log in</Link>
            <Link to="/register" className="transition-colors hover:text-white">Create an account</Link>
            <Link to="/forgot-password" className="transition-colors hover:text-white">Forgot password?</Link>
          </nav>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-navy-300 sm:px-6 md:flex-row md:items-center md:justify-between">
            <p>© {new Date().getFullYear()} RapidRescue. All rights reserved.</p>
            <p>Patient transport coordination · Dispatch planning</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
