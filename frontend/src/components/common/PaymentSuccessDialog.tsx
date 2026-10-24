import { useEffect } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

type PaymentStage = 'upfront' | 'balance';

export function PaymentSuccessDialog({ open, amountInr, bookingRef, paymentStage = 'upfront', onClose }: {
  open: boolean;
  amountInr: number;
  bookingRef?: string;
  paymentStage?: PaymentStage;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(timer);
  }, [open, onClose]);

  return (
    <Dialog open={open} onClose={onClose} title={paymentStage === 'upfront' ? 'Booking payment submitted' : 'Trip balance submitted'} description="Your payment reference has been recorded." size="sm"
      footer={<Button onClick={onClose}>Continue</Button>}>
      <div className="flex flex-col items-center gap-3 py-3 text-center">
        <svg className="payment-sketch h-36 w-40" viewBox="0 0 160 144" role="img" aria-label={`Sketch receipt with ${paymentStage === 'upfront' ? 'booking payment' : 'balance payment'} UTR recorded badge`}>
          <path className="payment-sketch__paper" d="M39 14h47l19 19v82H39z" />
          <path className="payment-sketch__fold" d="M86 14v20h19" />
          <path className="payment-sketch__line" d="M51 48h41M51 58h29" />
          <circle className="payment-sketch__coin" cx="66" cy="88" r="17" />
          <path className="payment-sketch__currency" d="M71 80c-3-3-11-2-11 2 0 6 13 3 13 9s-9 7-14 2m7-18v27" />
          <circle className="payment-sketch__badge" cx="111" cy="94" r="23" />
          <path className="payment-sketch__check" d="m101 94 7 7 14-16" />
        </svg>
        <div className="flex flex-col items-center gap-2">
          <span className="payment-verification-badge"><span className="payment-verification-badge__dot" aria-hidden="true">✓</span> UTR RECORDED</span>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">{paymentStage === 'upfront' ? '30% booking payment' : '70% trip balance'}</span>
        </div>
        <p className="text-2xl font-semibold text-navy-900">₹{amountInr.toLocaleString('en-IN')}</p>
        {bookingRef && <p className="text-xs font-medium text-ink-soft">Booking {bookingRef}</p>}
        <p className="max-w-sm text-sm text-ink-soft">Your UTR is saved. The payment provider still needs to verify the transfer.</p>
        <div className="payment-dismiss-track" aria-label="This confirmation closes automatically in a few seconds"><span /></div>
      </div>
    </Dialog>
  );
}
