import { Bell } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { services } from '../../services';
import { useAppState } from '../../hooks/useAppState';
import { useAuth } from '../../contexts/AuthContext';
import { formatDateTime } from '../../utils/format';

export function NotificationBell() {
  const { user } = useAuth();
  const state = useAppState();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const mine = useMemo(() => state.notifications.filter((n) => n.userId === user?.id).slice(0, 8), [state.notifications, user?.id]);
  const unread = mine.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative flex h-10 w-10 items-center justify-center rounded-md text-navy-700 hover:bg-navy-50">
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-dropdown mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-surface-border bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-surface-border px-4 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            <button type="button" disabled={!unread} onClick={() => user && services.users.markNotificationsRead(user.id)} className="text-xs font-medium text-brand-700 hover:underline disabled:text-ink-faint disabled:no-underline">Mark all read</button>
          </div>
          {mine.length === 0 ? <p className="px-4 py-6 text-center text-sm text-ink-soft">No notifications yet.</p> : (
            <ul className="max-h-80 divide-y divide-surface-border overflow-y-auto">
              {mine.map((n) => (
                <li key={n.id} className="px-4 py-2.5 text-sm">
                  <p className={n.read ? 'text-ink-soft' : 'font-medium text-ink'}>{n.message}</p>
                  <p className="text-xs text-ink-faint">{formatDateTime(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
