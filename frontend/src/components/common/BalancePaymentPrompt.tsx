import { useEffect, useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { PaymentSuccessDialog } from './PaymentSuccessDialog';
import { DynamicPaymentQr } from './DynamicPaymentQr';
import { useAuth } from '../../contexts/AuthContext';
import { isValidUtr, isValidUpiAddress } from '../../domain/payment';
import { useAction } from '../../hooks/useAction';
import { useAppState } from '../../hooks/useAppState';
import { services } from '../../services';

/** In-layout reminder for the unpaid 70% balance; no separate route/page is created. */
export function BalancePaymentPrompt() {
  const { user } = useAuth();
  const state = useAppState();
  const { run, busy } = useAction();
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [utr, setUtr] = useState('');
  const [utrAvailable, setUtrAvailable] = useState<boolean | null>(null);
  const [utrChecking, setUtrChecking] = useState(false);
  const [utrCheckError, setUtrCheckError] = useState(false);
  const [successAmount, setSuccessAmount] = useState<number | null>(null);
  const booking = useMemo(() => user
    ? state.bookings.find((b) => b.patientId === user.id && b.status === 'completed' && b.payment && !b.payment.balanceUtr)
    : undefined, [state.bookings, user]);
  const open = Boolean(booking && booking.id !== dismissedId);
  const duplicateUtr = Boolean(booking?.payment?.upfrontUtr && utr === booking.payment.upfrontUtr);
  const validUtr = isValidUtr(utr) && !duplicateUtr && utrAvailable === true;
  const hasPaymentQr = isValidUpiAddress(state.settings.upiPaymentAddress) || Boolean(state.settings.upiQrCodeDataUrl);

  useEffect(() => {
    if (!open || !isValidUtr(utr) || duplicateUtr) { setUtrAvailable(null); setUtrChecking(false); setUtrCheckError(false); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setUtrAvailable(null);
      setUtrChecking(true);
      setUtrCheckError(false);
      void services.bookings.isUtrAvailable(utr).then((available) => {
        if (active) setUtrAvailable(available);
      }).catch(() => {
        if (active) setUtrCheckError(true);
      }).finally(() => { if (active) setUtrChecking(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, utr, duplicateUtr]);

  const dismiss = () => { if (booking) setDismissedId(booking.id); setUtr(''); };
  const submit = async () => {
    if (!booking || !user || !validUtr || !hasPaymentQr) return;
    const saved = await run('submitBalance', () => services.bookings.submitBalancePayment(user.id, booking.id, utr));
    if (saved) { setDismissedId(booking.id); setSuccessAmount(booking.payment?.balanceInr ?? 0); setUtr(''); }
  };

  return (
    <>
    <Dialog open={open} onClose={dismiss} title="Trip completed — balance payment" description="Submit the remaining 70% of your estimated fare." size="sm"
      footer={<><Button variant="outline" onClick={dismiss} disabled={busy}>Pay later</Button><Button onClick={submit} loading={busy} disabled={!booking || !hasPaymentQr || !validUtr}>Submit balance UTR</Button></>}>
      {booking?.payment && <div className="space-y-4 text-sm">
        <div className="rounded-md bg-surface-muted p-3"><p>Total estimated fare: <strong>₹{booking.payment.totalInr}</strong></p><p>Paid at booking (30%): <strong>₹{booking.payment.upfrontInr}</strong></p><p>Remaining balance (70%): <strong className="text-navy-900">₹{booking.payment.balanceInr}</strong></p></div>
        <DynamicPaymentQr upiAddress={state.settings.upiPaymentAddress} payeeName={state.settings.organisationName} amountInr={booking.payment.balanceInr} reference={`RR${booking.ref.replace(/[^a-z0-9]/gi, '').toUpperCase()}BAL`} paymentLabel="70% trip balance" fallbackQr={state.settings.upiQrCodeDataUrl} />
        <label htmlFor="balance-utr" className="block font-medium text-ink">16-digit UTR number</label>
        <input id="balance-utr" inputMode="numeric" autoComplete="off" maxLength={16} value={utr} onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').slice(0, 16))} className="block min-h-[42px] w-full rounded-md border border-surface-border px-3 py-2" placeholder="Enter UTR from payment receipt" />
        <p role={duplicateUtr || utrAvailable === false ? 'alert' : 'status'} className={duplicateUtr || utrAvailable === false ? 'text-xs font-medium text-danger-700' : validUtr ? 'text-xs font-medium text-success-700' : 'text-xs text-ink-soft'}>
          {duplicateUtr ? 'Invalid UTR Number. Use a different UTR from the 30% booking payment.' : !isValidUtr(utr) ? `${utr.length}/16 digits` : utrChecking ? 'Checking UTR against the payment database…' : utrCheckError ? 'Could not check this UTR. Change it or try again.' : utrAvailable === false ? 'Invalid UTR Number. This UTR is already recorded; enter a different UTR.' : validUtr ? 'UTR is available. Submit it to record the balance payment.' : 'Checking UTR…'}
        </p>
        <p className="text-xs text-ink-faint">UTR submissions are pending verification. The app does not verify bank payments automatically.</p>
      </div>}
    </Dialog>
    <PaymentSuccessDialog open={successAmount !== null} amountInr={successAmount ?? 0} paymentStage="balance" onClose={() => setSuccessAmount(null)} />
    </>
  );
}
