import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button, IconButton } from './Button';
import { cx } from '../../lib/cx';

interface DialogProps { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }

/** Uses the native <dialog> element: focus trap, Esc to close, and focus restoration come from the browser. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  const width = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : 'max-w-xl';
  return (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }} className={cx('m-auto w-[calc(100%-1.5rem)] rounded-xl bg-transparent backdrop:bg-navy-950/55', width)}>
      {open && (
        <div className="flex max-h-[90vh] flex-col rounded-xl bg-white shadow-pop">
          <div className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
            <div><h2 id={titleId} className="text-lg font-semibold text-navy-900">{title}</h2>{description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}</div>
            <IconButton label="Close dialog" onClick={onClose}><X className="h-5 w-5" aria-hidden /></IconButton>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, loading, confirmDisabled, children }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; confirmDisabled?: boolean; children?: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={loading ? () => undefined : onClose} title={title} size="sm"
      footer={<><Button variant="outline" onClick={onClose} disabled={loading}>Go back</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>{confirmLabel}</Button></>}>
      <div className="space-y-3 text-sm text-ink-soft">{message}{children}</div>
    </Dialog>
  );
}
