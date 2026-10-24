import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-lg border border-surface-border bg-white shadow-card', className)} {...rest} />;
}
export function CardHeader({ title, action, description }: { title: string; action?: ReactNode; description?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-surface-border px-4 py-3 sm:px-5">
      <div><h2 className="text-base font-semibold text-navy-900">{title}</h2>{description && <p className="text-xs text-ink-faint">{description}</p>}</div>
      {action}
    </div>
  );
}
export const CardBody = ({ className, ...rest }: HTMLAttributes<HTMLDivElement>) => <div className={cx('p-4 sm:p-5', className)} {...rest} />;
