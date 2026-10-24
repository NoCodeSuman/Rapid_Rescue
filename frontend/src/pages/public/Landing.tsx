import { ArrowRight, Bell, CheckCircle2, ClipboardList, Gauge, LifeBuoy, MapPinned, Radar, ShieldCheck, Truck, Users } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LinkButton } from '../../components/ui/Button';
import { Alert } from '../../components/ui/misc';
import { createSeedState } from '../../data/seed';
import { recommendDispatch } from '../../domain/dispatch';
import { useAuth } from '../../contexts/AuthContext';

const steps = [
  { icon: ClipboardList, title: '1. Patient books', short: 'Request received', text: 'A patient submits a request with pickup, destination and ambulance type.', detail: 'The request is checked and added to the booking queue.' },
  { icon: Radar, title: '2. Dispatch compares', short: 'Best match found', text: 'Dispatch checks eligible ambulances and compares estimated arrival times.', detail: 'Busy, offline or unsuitable vehicles are excluded.' },
  { icon: Bell, title: '3. Driver responds', short: 'Driver accepts', text: 'An available driver reviews the request and accepts or declines it.', detail: 'Accepting assigns the ambulance and updates the booking status.' },
  { icon: MapPinned, title: '4. Trip progresses', short: 'Journey updated', text: 'The trip status advances as the driver reaches each journey milestone.', detail: 'Patient and admin views show the latest recorded trip status.' },
];

const roles = [
  { icon: Users, title: 'Patient', items: ['Book and cancel bookings', 'Review history with search and filters', 'Follow a simulated tracking view'] },
  { icon: Truck, title: 'Driver', items: ['Go online or offline', 'Accept or decline requests', 'Progress an active trip step by step'] },
  { icon: Gauge, title: 'Administrator', items: ['Manage users, drivers and ambulances', 'Monitor dispatch recommendations', 'Reports with working CSV export'] },
];

const revealVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={revealVariants}
      initial={reduceMotion ? false : 'hidden'}
      whileInView={reduceMotion ? undefined : 'visible'}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.58, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => setActiveStep((current) => (current + 1) % steps.length), 4200);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);
  const bookTo = user?.role === 'patient' ? '/patient/book-ambulance' : '/login';
  const booking = useMemo(() => {
    const s = createSeedState();
    // Keep this example resilient to wording changes in seeded notes. The previous
    // lookup used the wrong capitalization/text and then force-unwrapped undefined.
    const b = s.bookings.find((x) => x.notes.toLowerCase().includes('nearest-vs-fastest'))
      ?? s.bookings.find((x) => x.status === 'requested')
      ?? s.bookings[0];

    if (!b) {
      return { rows: [], rec: null as ReturnType<typeof recommendDispatch> | null };
    }

    const rec = recommendDispatch(s, b);
    const rows = rec.candidates
      .filter((c) => c.eligible)
      .sort((a, c) => a.distanceKm - c.distanceKm)
      .flatMap((candidate) => {
        const ambulance = s.ambulances.find((a) => a.id === candidate.ambulanceId);
        // Ignore stale candidate references rather than crashing the whole landing page.
        return ambulance ? [{ ...candidate, reg: ambulance.registration, profile: ambulance.routeProfile }] : [];
      });
    return { rows, rec };
  }, []);

  return (
    <>
      <section className="relative isolate overflow-hidden bg-navy-900 text-white">
        <img
          src="/ambulance-line-art.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 -right-24 z-0 w-[78%] max-w-[1100px] opacity-[0.20] sm:-right-16 lg:-bottom-16 lg:right-[-5%] lg:w-[68%]"
        />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
          <Reveal className="self-center">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-navy-100"><ShieldCheck className="h-3.5 w-3.5" aria-hidden />Patient transport coordination</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-white sm:text-5xl">Ambulance booking with <span className="text-danger-500">ETA-based</span> dispatch</h1>
            <p className="mt-4 max-w-xl text-lg text-navy-100">RapidRescue brings together patient booking, driver trip workflows, an administrator console, and dispatch recommendations based on estimated arrival times.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to={bookTo} state={user ? undefined : { from: '/patient/book-ambulance' }} variant="secondary" size="lg" className="bg-danger-600 hover:bg-danger-700">Book an Ambulance<ArrowRight className="h-4 w-4" aria-hidden /></LinkButton>
              <LinkButton to="/#smart-dispatch" variant="primary" size="lg" className="border border-white/40 bg-navy-800 text-white hover:bg-navy-700">Explore Smart Dispatch</LinkButton>
            </div>
            <p className="mt-4 max-w-xl text-sm text-navy-200">Booking requests require confirmation from an authorized ambulance provider. Estimated arrival times are not guaranteed.</p>
          </div>
          </Reveal>
          <Reveal className="self-center" delay={0.12}>
          <div className="rounded-xl bg-white/5 p-6 ring-1 ring-white/10">
            <h2 className="text-lg font-semibold text-white">What you can try</h2>
            <ul className="mt-4 space-y-3 text-sm text-navy-100">
              {['Log in with one click as patient, driver or admin', 'Create a booking and watch it appear for the admin', 'Accept it as a driver and move the trip through each step', 'Open dispatch monitoring to see why the nearest unit may not win'].map((t) => (
                <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" aria-hidden />{t}</li>
              ))}
            </ul>
            <LinkButton to="/login" variant="outline" className="mt-6">Open sign-in</LinkButton>
          </div>
          </Reveal>
        </div>
      </section>

      <section id="how-it-works" aria-labelledby="how-h" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <Reveal>
          <h2 id="how-h" className="text-3xl font-semibold">How it works</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">One shared local data store connects every screen, so an action in one role is immediately visible in the others.</p>
        </Reveal>
        <div className="mt-8 mb-5" aria-label="Booking process progress">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-ink-soft sm:text-sm">
            <span className="font-semibold text-brand-700">LIVE PROCESS WALKTHROUGH</span>
            <span>Step {activeStep + 1} of {steps.length}: {steps[activeStep].short}</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2" aria-hidden="true">
            {steps.map((step, index) => (
              <div key={step.title} className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <motion.div className="h-full rounded-full bg-brand-500" initial={{ width: '0%' }} animate={{ width: index <= activeStep ? '100%' : '0%' }} transition={{ duration: reduceMotion ? 0 : (index === activeStep ? 4.1 : 0.9), ease: [0.22, 1, 0.36, 1] }} />
              </div>
            ))}
          </div>
        </div>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title, text, detail }, index) => {
            const isActive = activeStep === index;
            return (
              <motion.li key={title}
                className={`rr-step-card relative overflow-hidden rounded-lg border bg-white p-5 shadow-card transition-all duration-700 ease-out ${isActive ? 'border-brand-300 shadow-[0_8px_26px_rgba(15,90,150,0.10)]' : 'border-surface-border'}`}
                variants={revealVariants} initial={reduceMotion ? false : 'hidden'} whileInView={reduceMotion ? undefined : 'visible'} viewport={{ once: true, amount: 0.18 }}
                transition={{ duration: 0.62, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }} whileHover={reduceMotion ? undefined : { y: -4 }}
                aria-current={isActive ? 'step' : undefined}>
                <div className="flex items-start justify-between gap-3">
                  <motion.span className={`relative flex h-12 w-12 items-center justify-center rounded-xl border ${isActive ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-slate-100 bg-slate-50 text-brand-700'}`}
                    animate={reduceMotion ? undefined : { y: isActive ? [0, -1.5, 0] : 0, scale: isActive ? [1, 1.025, 1] : 1 }}
                    transition={reduceMotion ? undefined : { duration: 2.2, repeat: isActive ? Infinity : 0, ease: 'easeInOut' }}>
                    <Icon className="h-6 w-6" strokeWidth={1.7} aria-hidden />
                    {isActive && !reduceMotion && <motion.span className="absolute inset-0 rounded-xl border border-brand-400" initial={{ opacity: 0.3, scale: 1 }} animate={{ opacity: [0.3, 0], scale: [1, 1.16] }} transition={{ duration: 2.1, repeat: Infinity, ease: 'easeOut' }} aria-hidden="true" />}
                  </motion.span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${isActive ? 'bg-brand-50 text-brand-700' : 'bg-slate-50 text-slate-500'}`}>{isActive ? 'In focus' : `Step ${index + 1}`}</span>
                </div>
                <h3 className="mt-3 text-base font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{text}</p>
                <motion.p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500" animate={{ opacity: isActive ? 1 : 0.76 }} transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}>{detail}</motion.p>
              </motion.li>
            );
          })}
        </ol>
      </section>

      <section id="roles" aria-labelledby="roles-h" className="bg-surface-muted py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <Reveal><h2 id="roles-h" className="text-3xl font-semibold">Three roles, one product</h2></Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {roles.map(({ icon: Icon, title, items }, index) => (
              <motion.article key={title} className="rounded-lg border border-surface-border bg-white p-6 shadow-card transition-shadow hover:shadow-lg"
                variants={revealVariants} initial={reduceMotion ? false : 'hidden'} whileInView={reduceMotion ? undefined : 'visible'} viewport={{ once: true, amount: 0.18 }}
                transition={{ duration: 0.62, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }} whileHover={reduceMotion ? undefined : { y: -5 }}>
                <motion.span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-800 text-white" whileHover={{ scale: 1.08, rotate: -4 }} transition={{ type: 'spring', stiffness: 340, damping: 16 }}><Icon className="h-5 w-5" aria-hidden /></motion.span>
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <ul className="mt-3 space-y-2 text-sm text-ink-soft">{items.map((i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden />{i}</li>)}</ul>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="smart-dispatch" aria-labelledby="sd-h" className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <Reveal>
        <h2 id="sd-h" className="text-3xl font-semibold">Smart dispatch: ETA over distance</h2>
        <p className="mt-2 max-w-3xl text-ink-soft">The nearest ambulance is not always the fastest to arrive. This example uses route profiles (typical speed and detour), excludes units that are busy, offline or the wrong type, then compares estimated arrival times. The calculation is illustrative and does not use live routing or traffic data.</p>
        </Reveal>
        <Reveal delay={0.08}>
        <div className="relative mt-6 overflow-x-auto rounded-lg border border-surface-border bg-white shadow-card">
          <table className="min-w-full text-sm">
            <caption className="border-b border-surface-border px-4 py-3 text-left font-medium">Example from the seeded example scenario (simulated)</caption>
            <thead className="bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-soft"><tr><th className="px-4 py-2">Ambulance</th><th className="px-4 py-2">Distance</th><th className="px-4 py-2">Route profile</th><th className="px-4 py-2">Simulated ETA</th><th className="px-4 py-2">Result</th></tr></thead>
            <tbody className="divide-y divide-surface-border">
              {booking.rows.length ? booking.rows.map((r) => (
                <tr key={r.ambulanceId}>
                  <td className="px-4 py-3 font-medium">{r.reg}</td><td className="px-4 py-3">{r.distanceKm.toFixed(1)} km</td>
                  <td className="px-4 py-3">{r.profile.label} (~{r.profile.avgSpeedKmh} km/h)</td><td className="px-4 py-3">{r.etaMinutes} min</td>
                  <td className="px-4 py-3">{r.ambulanceId === booking.rec?.recommended?.ambulanceId ? <span className="font-semibold text-success-700">Recommended (lowest ETA)</span> : r.ambulanceId === booking.rec?.nearestEligible?.ambulanceId ? 'Nearest, but slower' : 'Eligible'}</td>
                </tr>
              )) : (
                <tr><td className="px-4 py-3 text-ink-soft" colSpan={5}>Dispatch example is currently unavailable.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {booking.rec && <p className="mt-3 text-sm text-ink-soft">{booking.rec.explanation}</p>}
        <div className="mt-4"><Link to="/login" className="text-sm font-medium text-brand-700 hover:underline">Log in as admin to explore Dispatch Monitoring →</Link></div>
        </Reveal>
      </section>

      <section aria-labelledby="ben-h" className="bg-navy-50 py-14">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <h2 id="ben-h" className="sr-only">Capabilities</h2>
          {[['Consistent state', 'One data store keeps patient, driver and admin views in sync.'], ['Guarded workflows', 'Status transitions and assignments are validated centrally.'], ['Transparent logic', 'Dispatch and demand rules are deterministic and explained.'], ['Accessible & responsive', 'Keyboard-friendly, labelled controls on phone, tablet and desktop.']].map(([t, d], index) => (
            <motion.div key={t} className="rounded-lg bg-white p-5 shadow-card transition-shadow hover:shadow-lg" variants={revealVariants} initial={reduceMotion ? false : 'hidden'} whileInView={reduceMotion ? undefined : 'visible'} viewport={{ once: true, amount: 0.18 }} transition={{ duration: 0.62, delay: index * 0.09, ease: [0.22, 1, 0.36, 1] }} whileHover={reduceMotion ? undefined : { y: -4 }}><motion.span className="inline-flex" whileHover={{ rotate: 8, scale: 1.1 }}><LifeBuoy className="h-5 w-5 text-brand-600" aria-hidden /></motion.span><h3 className="mt-2 font-semibold">{t}</h3><p className="mt-1 text-sm text-ink-soft">{d}</p></motion.div>
          ))}
        </div>
      </section>

      <section id="safety" aria-labelledby="safe-h" className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <h2 id="safe-h" className="sr-only">Safety and limitations</h2>
        <Reveal>
        <Alert tone="warning" title="Patient safety and service notice">
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>An ambulance request is not confirmed until an authorized ambulance provider or dispatcher has acknowledged it.</li>
            <li>Vehicle availability and estimated arrival times can change with traffic, weather, road conditions, service demand and clinical priority. An ETA is an estimate, not a guarantee.</li>
            <li>For an immediate or life-threatening emergency, contact your local emergency number directly. Do not rely on an unconfirmed online request as proof that help is on the way.</li>
          </ul>
        </Alert>
        </Reveal>
      </section>
    </>
  );
}
