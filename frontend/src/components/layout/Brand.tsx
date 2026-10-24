import { Link } from 'react-router-dom';
import { cx } from '../../lib/cx';

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx('h-8 w-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0f2344" /><path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="#e5383b" />
    </svg>
  );
}
export function Brand({ to = '/', light }: { to?: string; light?: boolean }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-md" aria-label="RapidRescue home">
      <BrandMark />
      <span className={cx('text-lg font-bold tracking-tight', light ? 'text-white' : 'text-navy-900')}>Rapid<span className="text-danger-500">Rescue</span></span>
    </Link>
  );
}
