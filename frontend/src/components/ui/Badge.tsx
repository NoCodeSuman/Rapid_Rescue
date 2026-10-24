import { CheckCircle2, CircleDot, Clock3, MinusCircle, XCircle, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { STATUS_META, type Tone } from '../../domain/status';
import type { BookingStatus } from '../../types';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-navy-50 text-navy-700 ring-navy-200',
  info: 'bg-brand-50 text-brand-800 ring-brand-200',
  warning: 'bg-warning-100 text-warning-700 ring-warning-500/40',
  success: 'bg-success-100 text-success-700 ring-success-500/40',
  danger: 'bg-danger-100 text-danger-700 ring-danger-500/40',
};
const toneIcon: Record<Tone, LucideIcon> = { neutral: MinusCircle, info: CircleDot, warning: Clock3, success: CheckCircle2, danger: XCircle };

/** Badges always pair color with an icon and text so status is never color-only. */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  const Icon = toneIcon[tone];
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', toneClass[tone])}>
      <Icon className="h-3 w-3" aria-hidden />{children}
    </span>
  );
}
export const StatusBadge = ({ status }: { status: BookingStatus }) => <Badge tone={STATUS_META[status].tone}>{STATUS_META[status].label}</Badge>;
