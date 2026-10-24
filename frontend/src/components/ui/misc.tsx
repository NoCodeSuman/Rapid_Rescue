import { AlertTriangle, CheckCircle2, Info, Inbox, Loader2, OctagonAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

export const Spinner = ({ label = 'Loading' }: { label?: string }) => (
  <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-ink-soft"><Loader2 className="h-5 w-5 animate-spin" aria-hidden />{label}…</div>
);

export const Skeleton = ({ className }: { className?: string }) => <div className={cx('animate-pulse rounded bg-navy-100', className)} aria-hidden />;

export function EmptyState({ title, hint, action, icon: Icon = Inbox }: { title: string; hint?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-500"><Icon className="h-6 w-6" aria-hidden /></span>
      <p className="font-medium text-navy-900">{title}</p>
      {hint && <p className="max-w-md text-sm text-ink-soft">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, action }: { title?: string; message: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger-100 text-danger-600"><OctagonAlert className="h-6 w-6" aria-hidden /></span>
      <p className="font-medium text-navy-900">{title}</p>
      <p className="max-w-md text-sm text-ink-soft">{message}</p>
      {action}
    </div>
  );
}

const alertStyles = {
  info: ['bg-brand-50 border-brand-200 text-brand-900', Info],
  warning: ['bg-warning-50 border-warning-500/50 text-warning-700', AlertTriangle],
  danger: ['bg-danger-50 border-danger-500/40 text-danger-700', OctagonAlert],
  success: ['bg-success-50 border-success-500/40 text-success-700', CheckCircle2],
} as const;

export function Alert({ tone = 'info', title, children, className }: { tone?: keyof typeof alertStyles; title?: string; children: ReactNode; className?: string }) {
  const [cls, Icon] = alertStyles[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'note'} className={cx('flex gap-3 rounded-lg border px-4 py-3 text-sm', cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{title && <p className="font-semibold">{title}</p>}<div>{children}</div></div>
    </div>
  );
}

/** Required on booking and tracking flows. */
export const DemoNotice = ({ className }: { className?: string }) => (
  <Alert tone="warning" title="Important: this website does not contact emergency services." className={className}>
    Booking and arrival estimates are illustrative. If you grant location permission, pickup and driver GPS can be shown on the map, but this app does not dispatch a real ambulance. If you need emergency help, call your local emergency number.
  </Alert>
);
