import { Check, X } from 'lucide-react';
import { STATUS_META, TIMELINE_STEPS } from '../../domain/status';
import type { Booking } from '../../types';
import { formatDateTime } from '../../utils/format';
import { cx } from '../../lib/cx';

/** Progress timeline driven by the booking's recorded status history. */
export function BookingTimeline({ booking }: { booking: Booking }) {
  const reached = new Map(booking.history.map((h) => [h.status, h]));
  const failed = booking.status === 'cancelled' || booking.status === 'rejected';
  // Keep the patient-facing progress sequence simple and predictable. Internal admin assignment is not a patient milestone.
  const steps = TIMELINE_STEPS;
  return (
    <ol aria-label="Booking progress" className="space-y-3">
      {steps.map((s) => {
        const ev = reached.get(s);
        const current = booking.status === s;
        return (
          <li key={s} className="flex items-start gap-3" aria-current={current ? 'step' : undefined}>
            <span className={cx('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs', ev ? 'border-success-600 bg-success-600 text-white' : 'border-navy-200 bg-white text-ink-faint')}>
              {ev ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
            </span>
            <div>
              <p className={cx('text-sm', ev ? 'font-medium text-ink' : 'text-ink-faint')}>{STATUS_META[s].label}{current && <span className="ml-2 text-xs text-brand-700">(current)</span>}</p>
              {ev && <p className="text-xs text-ink-faint">{formatDateTime(ev.at)}</p>}
            </div>
          </li>
        );
      })}
      {failed && (
        <li className="flex items-start gap-3" aria-current="step">
          <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-danger-600 text-white"><X className="h-3.5 w-3.5" aria-hidden /></span>
          <div>
            <p className="text-sm font-medium text-danger-700">{STATUS_META[booking.status].label}</p>
            <p className="text-xs text-ink-faint">{formatDateTime(booking.updatedAt)}{booking.reason ? ` — ${booking.reason}` : ''}</p>
          </div>
        </li>
      )}
    </ol>
  );
}
