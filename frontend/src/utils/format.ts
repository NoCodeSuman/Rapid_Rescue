/** Single place for display formatting of dates, durations and distances. */
const dateTime = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateOnly = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatDate = (iso: string) => dateOnly.format(new Date(iso));
export const formatEta = (minutes: number | null | undefined) => (minutes == null ? 'Not available' : `${minutes} min`);
export const formatKm = (km: number | null | undefined) => (km == null ? 'Not available' : `${km.toFixed(1)} km`);
export const dayKey = (iso: string) => iso.slice(0, 10);
export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
