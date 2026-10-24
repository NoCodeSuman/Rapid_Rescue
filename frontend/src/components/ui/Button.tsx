import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cx } from '../../lib/cx';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
type Size = 'sm' | 'md' | 'lg';

const base = 'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors select-none disabled:cursor-not-allowed disabled:opacity-55 min-h-[40px]';
const variants: Record<Variant, string> = {
  primary: 'bg-navy-800 text-white hover:bg-navy-700 active:bg-navy-900',
  secondary: 'bg-brand-500 text-white hover:bg-brand-600',
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
  outline: 'border border-surface-border bg-white text-navy-800 hover:bg-surface-muted',
  ghost: 'text-navy-700 hover:bg-navy-50',
};
const sizes: Record<Size, string> = { sm: 'px-3 py-1.5 text-sm min-h-[36px]', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base min-h-[48px]' };
export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', extra?: string) => cx(base, variants[variant], sizes[size], extra);

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; size?: Size; loading?: boolean }

export const Button = forwardRef<HTMLButtonElement, Props>(({ variant = 'primary', size = 'md', loading, disabled, className, children, type = 'button', ...rest }, ref) => (
  <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, className)} {...rest}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
    {children}
  </button>
));
Button.displayName = 'Button';

export function LinkButton({ variant = 'primary', size = 'md', className, ...rest }: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />;
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(({ label, className, children, type = 'button', ...rest }, ref) => (
  <button ref={ref} type={type} aria-label={label} title={label} className={cx('inline-flex h-10 w-10 items-center justify-center rounded-md text-navy-700 hover:bg-navy-50 disabled:opacity-50', className)} {...rest}>{children}</button>
));
IconButton.displayName = 'IconButton';
