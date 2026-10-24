import type { LucideIcon } from 'lucide-react';
import { Card } from '../ui/Card';
import { cx } from '../../lib/cx';

export function StatCard({ label, value, icon: Icon, tone = 'brand', hint }: { label: string; value: number | string; icon: LucideIcon; tone?: 'brand' | 'success' | 'warning' | 'danger' | 'navy'; hint?: string }) {
  const tones = { brand: 'bg-brand-50 text-brand-700', success: 'bg-success-100 text-success-700', warning: 'bg-warning-100 text-warning-700', danger: 'bg-danger-100 text-danger-700', navy: 'bg-navy-50 text-navy-700' };
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className={cx('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', tones[tone])}><Icon className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-ink-soft">{label}</p>
        <p className="text-2xl font-semibold text-navy-900">{value}</p>
        {hint && <p className="text-xs text-ink-faint">{hint}</p>}
      </div>
    </Card>
  );
}
