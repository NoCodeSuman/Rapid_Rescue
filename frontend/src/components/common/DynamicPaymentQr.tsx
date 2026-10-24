import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { buildUpiPaymentUri, isValidUpiAddress } from '../../domain/payment';
import { Alert } from '../ui/misc';

interface Props {
  upiAddress: string;
  payeeName: string;
  amountInr: number;
  reference: string;
  paymentLabel: string;
  fallbackQr?: string | null;
}

/** Renders a local UPI payment QR with the exact amount encoded into its payment URI. */
export function DynamicPaymentQr({ upiAddress, payeeName, amountInr, reference, paymentLabel, fallbackQr }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const configured = isValidUpiAddress(upiAddress);

  useEffect(() => {
    let active = true;
    setQrDataUrl(null);
    setError(false);
    if (!configured) return () => { active = false; };
    let uri: string;
    try {
      uri = buildUpiPaymentUri({ upiAddress, payeeName, amountInr, reference, note: `RapidRescue ${paymentLabel}` });
    } catch {
      setError(true);
      return () => { active = false; };
    }
    void QRCode.toDataURL(uri, {
      errorCorrectionLevel: 'M', margin: 2, width: 256,
      color: { dark: '#102544', light: '#ffffff' },
    }).then((image) => { if (active) setQrDataUrl(image); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [configured, upiAddress, payeeName, amountInr, reference, paymentLabel]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-md bg-white p-3 text-center">
      {configured && qrDataUrl
        ? <img src={qrDataUrl} alt={`UPI QR for ₹${amountInr} ${paymentLabel}`} className="h-52 w-52 rounded border border-surface-border object-contain" />
        : fallbackQr
          ? <img src={fallbackQr} alt="Static UPI payment QR code" className="h-52 w-52 rounded border border-surface-border object-contain" />
          : <Alert tone="warning">Add a valid UPI ID in Admin Settings to generate this payment QR.</Alert>}
      {configured && !qrDataUrl && !error && <p className="text-sm text-ink-soft">Preparing amount-specific UPI QR…</p>}
      {error && <p role="alert" className="text-sm text-danger-700">Could not generate this QR. Check the UPI ID and try again.</p>}
      {configured
        ? <><p className="text-sm font-semibold text-navy-900">Scan to pay ₹{amountInr.toLocaleString('en-IN')}</p><p className="text-xs text-ink-soft">{upiAddress} · {paymentLabel}</p></>
        : fallbackQr && <p className="max-w-xs text-xs text-warning-800">This uploaded QR does not prefill the fare. Configure a UPI ID to create a QR with the exact amount.</p>}
    </div>
  );
}
