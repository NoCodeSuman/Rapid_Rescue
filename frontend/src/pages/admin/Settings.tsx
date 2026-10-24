import { zodResolver } from '@hookform/resolvers/zod';
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { PageHeading } from '../../components/common/PageHeading';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { SelectField, TextField, Toggle } from '../../components/ui/Field';
import { Alert } from '../../components/ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { notify } from '../../hooks/useNotify';
import { settingsSchema } from '../../lib/schemas';
import { isValidUpiAddress } from '../../domain/payment';
import { services } from '../../services';
import { IS_LIVE_DATA, STATE_VERSION } from '../../services/store';

type FormIn = z.input<typeof settingsSchema>; type FormOut = z.output<typeof settingsSchema>;

export default function Settings() {
  const state = useAppState();
  const { logout } = useAuth();
  const nav = useNavigate();
  const { run, busy } = useAction();
  const s = state.settings;
  const [confirm, setConfirm] = useState(false);
  const [fareBaseInr, setFareBaseInr] = useState(String(s.fareBaseInr));
  const [farePerKmInr, setFarePerKmInr] = useState(String(s.farePerKmInr));
  const [upiAddress, setUpiAddress] = useState(s.upiPaymentAddress);
  useEffect(() => { setFareBaseInr(String(s.fareBaseInr)); setFarePerKmInr(String(s.farePerKmInr)); setUpiAddress(s.upiPaymentAddress); }, [s.fareBaseInr, s.farePerKmInr, s.upiPaymentAddress]);
  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(settingsSchema), defaultValues: { organisationName: s.organisationName, defaultPageSize: s.defaultPageSize, compactTables: s.compactTables } });

  const save = handleSubmit((d) => run('save', () => services.settings.update({ organisationName: d.organisationName, defaultPageSize: d.defaultPageSize as 5 | 10 | 20, compactTables: d.compactTables }), 'Display settings saved locally.'));
  const reset = async () => {
    const done = await run('reset', async () => { await services.settings.resetDemoData(); if (!IS_LIVE_DATA) await logout(); return true; });
    setConfirm(false);
    if (done && IS_LIVE_DATA) { notify.info('Display settings restored to defaults.'); return; }
    if (done) { notify.info('local data reset. Please log in again.'); nav('/login', { replace: true }); }
  };
  const saveQr = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { notify.error('Choose an image file for the payment QR.'); return; }
    if (file.size > 400 * 1024) { notify.error('QR image must be 400 KB or smaller.'); return; }
    const reader = new FileReader();
    reader.onerror = () => notify.error('Could not read the QR image.');
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      await run('saveQr', () => services.settings.update({ upiQrCodeDataUrl: reader.result as string }), 'Payment QR saved for patients.');
    };
    reader.readAsDataURL(file);
  };
  const saveFare = () => {
    const base = Number(fareBaseInr); const rate = Number(farePerKmInr);
    if (!Number.isFinite(base) || !Number.isFinite(rate) || base < 0 || rate < 0 || base > 100000 || rate > 100000) { notify.error('Enter fare amounts between ₹0 and ₹100,000.'); return; }
    void run('saveFare', () => services.settings.update({ fareBaseInr: base, farePerKmInr: rate }), 'Fare estimate settings saved.');
  };
  const saveUpiAddress = () => {
    const address = upiAddress.trim();
    if (!isValidUpiAddress(address)) { notify.error('Enter a valid UPI ID, such as clinic@bank.'); return; }
    void run('saveUpiAddress', () => services.settings.update({ upiPaymentAddress: address }), 'UPI ID saved. Patient QR codes will include the exact payment amount.');
  };

  return (
    <>
      <PageHeading title="Settings" description="Local booking preferences. These are stored in this browser only and do not configure any server." crumbs={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Settings' }]} />
      {IS_LIVE_DATA
        ? <Alert tone="info" className="mb-5">Connected to Firebase: users, drivers, ambulances and bookings shown in this console are the real records stored in Cloud Firestore. These settings are saved to Firestore for all administrators.</Alert>
        : <Alert tone="info" className="mb-5">Everything here is a local display or booking setting. There is no backend, so nothing is secured, synchronised or configured server-side.</Alert>}
      <div className="grid gap-5 lg:grid-cols-2">
        <form noValidate onSubmit={save}>
          <Card>
            <CardHeader title="Display preferences" />
            <CardBody className="space-y-4">
              <TextField label="Organisation display name" required error={errors.organisationName?.message} {...register('organisationName')} />
              <SelectField label="Rows per table page" error={errors.defaultPageSize?.message} {...register('defaultPageSize')}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></SelectField>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" {...register('compactTables')} />Compact table rows</label>
            </CardBody>
            <div className="flex justify-end border-t border-surface-border px-5 py-3"><Button type="submit" disabled={!isDirty} loading={busy}>Save display settings</Button></div>
          </Card>
        </form>
        <Card>
          <CardHeader title="Notification preferences" description="Applies immediately" />
          <CardBody className="space-y-4">
            <Toggle label="Show pop-up toasts" description="Error messages always show." checked={s.toastsEnabled} onChange={(v) => services.settings.update({ toastsEnabled: v })} />
            <Toggle label="In-app booking update notifications" description="Sent to patients when status changes." checked={s.notifyBookingUpdates} onChange={(v) => services.settings.update({ notifyBookingUpdates: v })} />
            <Toggle label="In-app assignment notifications" description="Sent to drivers on assignments and cancellations." checked={s.notifyAssignments} onChange={(v) => services.settings.update({ notifyAssignments: v })} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Patient payment setup" description="Dynamic QR codes prefill each payment amount" />
          <CardBody className="space-y-4">
            <div className="space-y-2">
              <TextField label="UPI ID / payment address" autoComplete="off" value={upiAddress} onChange={(e) => setUpiAddress(e.target.value)} placeholder="clinic@bank" hint="Required to generate a QR with the exact 30% or 70% amount." />
              <div className="flex justify-end"><Button type="button" loading={busy} onClick={saveUpiAddress}>Save UPI ID</Button></div>
              {s.upiPaymentAddress && <p className="text-xs text-success-700">Saved payment address: {s.upiPaymentAddress}</p>}
            </div>
            <div className="space-y-2">
              <label htmlFor="payment-qr" className="block text-sm font-medium text-ink">Optional static QR fallback</label>
              <input id="payment-qr" type="file" accept="image/*" onChange={(e) => { void saveQr(e.target.files?.[0]); e.currentTarget.value = ''; }} className="block w-full text-sm" />
              <p className="text-xs text-ink-soft">A static image is used only when no valid UPI ID is saved; it cannot prefill the fare amount.</p>
              {s.upiQrCodeDataUrl && <div className="flex items-center gap-3 rounded-md bg-surface-muted p-3"><img src={s.upiQrCodeDataUrl} alt="Configured UPI QR code preview" className="h-24 w-24 rounded border border-surface-border bg-white object-contain" /><Button type="button" variant="outline" loading={busy} onClick={() => void run('removeQr', () => services.settings.update({ upiQrCodeDataUrl: null }), 'Payment QR removed.')}>Remove QR</Button></div>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Base fare (₹)" type="number" min="0" value={fareBaseInr} onChange={(e) => setFareBaseInr(e.target.value)} />
              <TextField label="Per kilometre (₹)" type="number" min="0" value={farePerKmInr} onChange={(e) => setFarePerKmInr(e.target.value)} />
            </div>
            <p className="text-xs text-ink-soft">The booking estimate uses straight-line distance with a road-distance factor. The patient pays 30% when confirming and the remaining 70% after the driver completes the trip.</p>
            <div className="flex justify-end"><Button type="button" loading={busy} onClick={saveFare}>Save fare estimate</Button></div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="booking configuration" />
          <CardBody className="space-y-1 text-sm">
            <p><span className="text-ink-soft">Storage:</span> {IS_LIVE_DATA ? 'Firebase Cloud Firestore (live)' : `browser localStorage (schema v${STATE_VERSION})`}</p>
            <p><span className="text-ink-soft">Records:</span> {state.users.length} users, {state.drivers.length} drivers, {state.ambulances.length} ambulances, {state.bookings.length} bookings</p>
            <p><span className="text-ink-soft">Backend:</span> {IS_LIVE_DATA ? 'Firebase (Authentication + Firestore)' : 'none (frontend booking)'}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={IS_LIVE_DATA ? 'Reset display settings' : 'Reset local data'} />
          <CardBody className="space-y-3 text-sm"><p className="text-ink-soft">{IS_LIVE_DATA ? 'Restores the default organisation name, table and notification settings. No users, drivers, ambulances or bookings are changed or deleted.' : 'Restores the original seeded illustrative records, removes registered booking accounts and signs you out.'}</p>
            <Button variant="danger" onClick={() => setConfirm(true)}><RotateCcw className="h-4 w-4" aria-hidden />{IS_LIVE_DATA ? 'Reset display settings' : 'Reset local data'}</Button></CardBody>
        </Card>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={reset} loading={busy} danger title={IS_LIVE_DATA ? 'Reset display settings?' : 'Reset all local data?'} confirmLabel={IS_LIVE_DATA ? 'Reset settings' : 'Reset local data'} message={IS_LIVE_DATA ? <p>Only display and notification settings are restored. Real records are not affected.</p> : <p>All bookings, edits and registered accounts in this browser will be replaced with the original seed data. This cannot be undone.</p>} />
    </>
  );
}
