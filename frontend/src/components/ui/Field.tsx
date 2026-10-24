import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';

const control = 'block w-full rounded-md border bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint min-h-[40px] disabled:bg-surface-muted disabled:text-ink-faint';
const ctl = (error?: string) => cx(control, error ? 'border-danger-500' : 'border-surface-border');

interface Common { label: string; error?: string; hint?: string; required?: boolean }

function Wrap({ id, label, error, hint, required, children }: Common & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
        {label}{required && <span className="text-danger-600" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-ink-faint">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-1 text-xs font-medium text-danger-700">{error}</p>}
    </div>
  );
}
const describedBy = (id: string, error?: string, hint?: string) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export const TextField = forwardRef<HTMLInputElement, Common & InputHTMLAttributes<HTMLInputElement>>(({ label, error, hint, required, className, ...rest }, ref) => {
  const id = useId();
  return (
    <Wrap id={id} label={label} error={error} hint={hint} required={required}>
      <input ref={ref} id={id} aria-invalid={!!error} aria-required={required} aria-describedby={describedBy(id, error, hint)} className={cx(ctl(error), className)} {...rest} />
    </Wrap>
  );
});
TextField.displayName = 'TextField';

export const PasswordField = forwardRef<HTMLInputElement, Common & InputHTMLAttributes<HTMLInputElement>>(({ label, error, hint, required, ...rest }, ref) => {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <Wrap id={id} label={label} error={error} hint={hint} required={required}>
      <div className="relative">
        <input ref={ref} id={id} type={show ? 'text' : 'password'} aria-invalid={!!error} aria-required={required} aria-describedby={describedBy(id, error, hint)} className={cx(ctl(error), 'pr-11')} {...rest} />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-soft hover:text-ink">
          {show ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </Wrap>
  );
});
PasswordField.displayName = 'PasswordField';

export const SelectField = forwardRef<HTMLSelectElement, Common & SelectHTMLAttributes<HTMLSelectElement>>(({ label, error, hint, required, className, children, ...rest }, ref) => {
  const id = useId();
  return (
    <Wrap id={id} label={label} error={error} hint={hint} required={required}>
      <select ref={ref} id={id} aria-invalid={!!error} aria-describedby={describedBy(id, error, hint)} className={cx(ctl(error), className)} {...rest}>{children}</select>
    </Wrap>
  );
});
SelectField.displayName = 'SelectField';

export const TextAreaField = forwardRef<HTMLTextAreaElement, Common & TextareaHTMLAttributes<HTMLTextAreaElement>>(({ label, error, hint, required, className, ...rest }, ref) => {
  const id = useId();
  return (
    <Wrap id={id} label={label} error={error} hint={hint} required={required}>
      <textarea ref={ref} id={id} rows={3} aria-invalid={!!error} aria-required={required} aria-describedby={describedBy(id, error, hint)} className={cx(ctl(error), className)} {...rest} />
    </Wrap>
  );
});
TextAreaField.displayName = 'TextAreaField';

export function Toggle({ checked, onChange, label, disabled, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
        {description && <p className="text-xs text-ink-faint">{description}</p>}
      </div>
      <button id={id} role="switch" type="button" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50', checked ? 'bg-success-600' : 'bg-navy-200')}>
        <span className={cx('inline-block h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}
