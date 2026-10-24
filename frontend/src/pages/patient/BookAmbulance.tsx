import { zodResolver } from '@hookform/resolvers/zod';
import { Crosshair, Truck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { PageHeading } from '../../components/common/PageHeading';
import { MapView, type MapMarker } from '../../components/maps/MapView';
import { PaymentSuccessDialog } from '../../components/common/PaymentSuccessDialog';
import { DynamicPaymentQr } from '../../components/common/DynamicPaymentQr';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { Alert, DemoNotice } from '../../components/ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { DEMO_HOSPITALS, DEMO_PICKUPS } from '../../data/places';
import { activePatientBooking } from '../../domain/selectors';
import { AMBULANCE_TYPE_LABELS, EMERGENCY_LABELS } from '../../domain/status';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { bookingSchema } from '../../lib/schemas';
import { services } from '../../services';
import { estimateFareInr, isValidUtr, splitFare } from '../../domain/payment';
import { newId } from '../../lib/ids';
import type { LocationPoint } from '../../types';

type FormIn = z.input<typeof bookingSchema>;
type FormOut = z.output<typeof bookingSchema>;

export default function BookAmbulance() {
  const { user } = useAuth();
  const state = useAppState();
  const nav = useNavigate();
  const { run, busy } = useAction();
  const [pickup, setPickup] = useState<LocationPoint | null>(null);
  const [pickupError, setPickupError] = useState<string>();
  const [locating, setLocating] = useState(false);
  const [pending, setPending] = useState<FormOut | null>(null);
  const [upiReference, setUpiReference] = useState('');
  const [upfrontUtr, setUpfrontUtr] = useState('');
  const [utrAvailable, setUtrAvailable] = useState<boolean | null>(null);
  const [utrChecking, setUtrChecking] = useState(false);
  const [utrCheckError, setUtrCheckError] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<{ bookingId: string; ref: string; amountInr: number } | null>(null);
  const open = user ? activePatientBooking(state, user.id) : undefined;

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(bookingSchema),
    defaultValues: { contactName: user?.name ?? '', contactPhone: user?.phone ?? '', pickupLabel: '', hospitalIndex: 0, emergencyType: 'cardiac', condition: '', ambulanceType: 'basic', additionalNotes: '' },
  });
  const w = watch();
  const hospital = DEMO_HOSPITALS[Number(w.hospitalIndex)] ?? DEMO_HOSPITALS[0];

  useEffect(() => {
    if (!pending || !isValidUtr(upfrontUtr)) { setUtrAvailable(null); setUtrChecking(false); setUtrCheckError(false); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setUtrChecking(true);
      setUtrAvailable(null);
      setUtrCheckError(false);
      void services.bookings.isUtrAvailable(upfrontUtr).then((available) => {
        if (active) setUtrAvailable(available);
      }).catch(() => {
        if (active) setUtrCheckError(true);
      }).finally(() => { if (active) setUtrChecking(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [pending, upfrontUtr]);

  const markers = useMemo<MapMarker[]>(() => {
    const m: MapMarker[] = [{ id: 'd', kind: 'destination', lat: hospital.lat, lng: hospital.lng, label: hospital.label }];
    if (pickup) m.unshift({ id: 'p', kind: 'pickup', lat: pickup.lat, lng: pickup.lng, label: pickup.label });
    return m;
  }, [pickup, hospital]);

  const choose = (p: LocationPoint, setLabel: boolean) => { setPickup(p); setPickupError(undefined); if (setLabel) setValue('pickupLabel', p.label, { shouldValidate: true }); };

  const useDeviceLocation = () => {
    if (!navigator.geolocation) { setPickupError('This device or browser does not provide GPS location. Choose the pickup on the map instead.'); return; }
    setLocating(true);
    setPickupError(undefined);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const accuracy = Math.max(1, Math.round(coords.accuracy));
      choose({ lat: coords.latitude, lng: coords.longitude, label: `Current device location (±${accuracy} m)` }, true);
      setLocating(false);
    }, (error) => {
      setLocating(false);
      setPickupError(error.code === 1
        ? 'Location permission was denied. Allow location access in your browser or choose the pickup on the map.'
        : 'Could not get your location. Check that device location is enabled, then try again or choose the pickup on the map.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  };

  const onValid = (d: FormOut) => {
    if (!pickup) { setPickupError('Choose a pickup point: pick a sample location or click the map.'); return; }
    setUpfrontUtr('');
    setUtrAvailable(null);
    setUtrCheckError(false);
    setUpiReference(`RR${Date.now().toString(36).toUpperCase()}${newId('pay').replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase()}`);
    setPending(d);
  };

  const pendingPickup = pending && pickup ? { ...pickup, label: pending.pickupLabel } : null;
  const totalFare = pendingPickup && pending ? estimateFareInr(pendingPickup, DEMO_HOSPITALS[pending.hospitalIndex], state.settings) : 0;
  const fareSplit = splitFare(totalFare);
  const canConfirm = isValidUtr(upfrontUtr) && utrAvailable === true;

  const confirm = async () => {
    if (!pending || !pickup || !user || !canConfirm) return;
    const d = pending;
    const dest = DEMO_HOSPITALS[d.hospitalIndex];
    const b = await run('create', () => services.bookings.create(user.id, {
      contactName: d.contactName, contactPhone: d.contactPhone, pickup: { ...pickup, label: d.pickupLabel }, destination: dest,
      emergencyType: d.emergencyType, ambulanceType: d.ambulanceType, notes: d.additionalNotes ? `${d.condition}\nAdditional: ${d.additionalNotes}` : d.condition,
      payment: { ...fareSplit, upfrontUtr, upfrontSubmittedAt: new Date().toISOString() },
    }), undefined);
    if (b) {
      setPending(null);
      setPaymentSuccess({ bookingId: b.id, ref: b.ref, amountInr: fareSplit.upfrontInr });
    }
  };

  return (
    <>
      <PageHeading title="Book an ambulance" description="Submit a booking request. It will appear in My Bookings and in the administrator console." crumbs={[{ label: 'Patient', to: '/patient/dashboard' }, { label: 'Book ambulance' }]} />
      <DemoNotice className="mb-5" />
      {open && <Alert tone="info" className="mb-5" title={`You already have an open booking (${open.ref})`}>Complete or cancel it before creating another. <Link className="font-medium underline" to="/patient/track-ambulance">Track it</Link> or <Link className="font-medium underline" to="/patient/bookings">view bookings</Link>.</Alert>}
      <form noValidate onSubmit={handleSubmit(onValid)} className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Patient & contact" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <TextField label="Patient name" required autoComplete="name" error={errors.contactName?.message} {...register('contactName')} />
              <TextField label="Contact number" type="tel" required autoComplete="tel" error={errors.contactPhone?.message} {...register('contactPhone')} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Pickup & destination" />
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="quick" className="mb-1 block text-sm font-medium">Quick-pick sample location</label>
                  <select id="quick" className="block min-h-[40px] w-full rounded-md border border-surface-border bg-white px-3 py-2 text-sm" defaultValue="" onChange={(e) => { const p = DEMO_PICKUPS[Number(e.target.value)]; if (p) choose(p, true); }}>
                    <option value="" disabled>Select a sample pickup…</option>
                    {DEMO_PICKUPS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                  </select>
                </div>
                <SelectField label="Destination hospital" required error={errors.hospitalIndex?.message} {...register('hospitalIndex')}>
                  {DEMO_HOSPITALS.map((h, i) => <option key={h.label} value={i}>{h.label}</option>)}
                </SelectField>
              </div>
              <TextField label="Pickup address / landmark" required hint="Editable. Choosing a point on the map keeps your text." error={errors.pickupLabel?.message} {...register('pickupLabel')} />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" loading={locating} onClick={useDeviceLocation}><Crosshair className="h-4 w-4" aria-hidden />Use my device location</Button>
                <p className="text-xs text-ink-soft">Your browser will ask for location permission. GPS is used only for this pickup.</p>
              </div>
              {pickupError && <p role="alert" className="text-sm font-medium text-danger-700">{pickupError}</p>}
              <MapView title="Pickup selection" markers={markers} height="h-64" onPick={(p) => choose({ ...p, label: 'Custom map point' }, !w.pickupLabel)} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Emergency details" />
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Emergency type" required error={errors.emergencyType?.message} {...register('emergencyType')}>
                {Object.entries(EMERGENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </SelectField>
              <SelectField label="Required ambulance type" required hint="A higher-capability unit can serve a lower request." error={errors.ambulanceType?.message} {...register('ambulanceType')}>
                {Object.entries(AMBULANCE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </SelectField>
              <div className="sm:col-span-2"><TextAreaField label="Patient condition / notes" required hint="Use fictional information only." error={errors.condition?.message} {...register('condition')} /></div>
              <div className="sm:col-span-2"><TextAreaField label="Additional notes (optional)" error={errors.additionalNotes?.message} {...register('additionalNotes')} /></div>
            </CardBody>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader title="Booking summary" description="Updates as you type" />
            <CardBody>
              <dl className="space-y-2 text-sm">
                {[['Patient', w.contactName || '—'], ['Contact', w.contactPhone || '—'], ['Pickup', w.pickupLabel || '—'], ['Destination', hospital.label], ['Emergency', EMERGENCY_LABELS[w.emergencyType]], ['Ambulance', AMBULANCE_TYPE_LABELS[w.ambulanceType]]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-ink-soft">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
                ))}
              </dl>
              <Button type="submit" size="lg" className="mt-5 w-full" disabled={!!open}><Truck className="h-4 w-4" aria-hidden />Review & submit booking</Button>
              {open && <p className="mt-2 text-xs text-ink-faint">Disabled: you already have an open booking.</p>}
            </CardBody>
          </Card>
        </aside>
      </form>

      <ConfirmDialog open={!!pending} onClose={() => setPending(null)} onConfirm={confirm} loading={busy} title="Confirm ride & payment" confirmLabel="Confirm 30% payment & book ambulance" confirmDisabled={!canConfirm}
        message={<><p>This saves a booking request to the app. It does <strong>not</strong> contact an actual ambulance service or emergency dispatcher.</p>
          {pending && <p className="rounded-md bg-surface-muted p-3 text-ink"><strong>{pending.pickupLabel}</strong> → <strong>{DEMO_HOSPITALS[pending.hospitalIndex].label}</strong><br />{EMERGENCY_LABELS[pending.emergencyType]} · {AMBULANCE_TYPE_LABELS[pending.ambulanceType]}</p>}
          {pending && <section className="space-y-3 rounded-lg border border-surface-border bg-white p-4" aria-label="Booking payment">
            <div><h3 className="font-semibold text-navy-900">Pay 30% to confirm this ride</h3><p className="text-xs text-ink-soft">Scan the admin UPI QR, then enter the 16-digit UTR from your payment receipt.</p></div>
            <DynamicPaymentQr upiAddress={state.settings.upiPaymentAddress} payeeName={state.settings.organisationName} amountInr={fareSplit.upfrontInr} reference={upiReference} paymentLabel="30% booking payment" fallbackQr={state.settings.upiQrCodeDataUrl} />
            <dl className="grid grid-cols-2 gap-y-1 rounded bg-surface-muted p-3 text-sm text-ink"><dt>Total estimated fare</dt><dd className="text-right font-semibold">₹{fareSplit.totalInr}</dd><dt>Pay now (30%)</dt><dd className="text-right font-semibold">₹{fareSplit.upfrontInr}</dd><dt>After trip (70%)</dt><dd className="text-right font-semibold">₹{fareSplit.balanceInr}</dd></dl>
            <label htmlFor="booking-utr" className="block text-sm font-medium text-ink">16-digit UTR number</label>
            <input id="booking-utr" inputMode="numeric" autoComplete="off" maxLength={16} value={upfrontUtr} onChange={(e) => setUpfrontUtr(e.target.value.replace(/\D/g, '').slice(0, 16))} className="block min-h-[42px] w-full rounded-md border border-surface-border px-3 py-2 text-sm" placeholder="Enter UTR from receipt" />
            <p role={utrAvailable === false ? 'alert' : 'status'} className={utrAvailable === false ? 'text-xs font-medium text-danger-700' : canConfirm ? 'text-xs font-medium text-success-700' : 'text-xs text-ink-soft'}>
              {!isValidUtr(upfrontUtr) ? `${upfrontUtr.length}/16 digits` : utrChecking ? 'Checking UTR against the payment database…' : utrCheckError ? 'Could not check this UTR. Change it or try again.' : utrAvailable === false ? 'Invalid UTR Number. This UTR is already recorded; enter a different UTR.' : canConfirm ? 'UTR is available. You can confirm the booking.' : 'Checking UTR…'}
            </p>
            <p className="text-xs text-ink-faint">UTR is recorded for verification. This app does not verify the bank payment automatically.</p>
          </section>}</>} />
      <PaymentSuccessDialog open={!!paymentSuccess} amountInr={paymentSuccess?.amountInr ?? 0} bookingRef={paymentSuccess?.ref} paymentStage="upfront" onClose={() => {
        const id = paymentSuccess?.bookingId;
        setPaymentSuccess(null);
        if (id) nav(`/patient/bookings?view=${id}`);
      }} />
    </>
  );
}
