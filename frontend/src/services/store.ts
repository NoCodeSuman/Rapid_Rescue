/** In-memory/local cache for UI state. Shared authoritative records are persisted to Firestore and mirrored here. */
import { createEmptyState, createSeedState } from '../data/seed';
import { DEMO_MODE } from '../lib/demoMode';
import { isFirebaseConfigured } from '../lib/firebase';
import { readEnvelope, writeEnvelope, removeKey } from '../lib/storage';
import type { AppState, ApplicationSettings, Result } from '../types';

export const STATE_KEY = 'rr.state';
export const STATE_VERSION = 2; // v2: Firebase deployments no longer start from demo data; older caches are discarded

/** Connected to Firebase (and not the offline developer demo): start empty, never from fictional records. */
const LIVE = isFirebaseConfigured && !DEMO_MODE;
const initialState = (): AppState => (LIVE ? createEmptyState() : createSeedState());

function isValidState(d: unknown): d is AppState {
  if (!d || typeof d !== 'object') return false;
  const s = d as Partial<AppState>;
  return (
    Array.isArray(s.users) && Array.isArray(s.profiles) && Array.isArray(s.drivers) && Array.isArray(s.ambulances) &&
    Array.isArray(s.bookings) && Array.isArray(s.zones) && Array.isArray(s.notifications) && Array.isArray(s.activity) &&
    !!s.settings && typeof s.counters?.booking === 'number' &&
    s.users.every((u) => u && typeof u.id === 'string' && typeof u.email === 'string') &&
    s.bookings.every((b) => b && typeof b.id === 'string' && Array.isArray(b.history))
  );
}

function load(): AppState {
  const saved = readEnvelope<unknown>(STATE_KEY, STATE_VERSION);
  if (saved && isValidState(saved)) {
    // Preserve local records from older builds while filling fields introduced by later releases.
    const defaults = createSeedState().settings;
    const settings = saved.settings as Partial<ApplicationSettings>;
    return { ...saved, settings: {
      ...defaults, ...settings,
      upiQrCodeDataUrl: typeof settings.upiQrCodeDataUrl === 'string' ? settings.upiQrCodeDataUrl : null,
      upiPaymentAddress: typeof settings.upiPaymentAddress === 'string' ? settings.upiPaymentAddress : '',
      fareBaseInr: Number.isFinite(settings.fareBaseInr) ? settings.fareBaseInr! : defaults.fareBaseInr,
      farePerKmInr: Number.isFinite(settings.farePerKmInr) ? settings.farePerKmInr! : defaults.farePerKmInr,
    } };
  }
  if (saved) removeKey(STATE_KEY); // corrupted / incompatible shape: discard safely
  const fresh = initialState();
  writeEnvelope(STATE_KEY, STATE_VERSION, fresh);
  return fresh;
}

type Listener = () => void;

class Store {
  private state: AppState = load();
  private listeners = new Set<Listener>();

  getState = (): AppState => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(next: AppState) {
    this.state = next;
    writeEnvelope(STATE_KEY, STATE_VERSION, next);
    this.listeners.forEach((l) => l());
  }

  /** Runs a pure operation against the latest state and commits it only on success (atomic). */
  apply<T>(op: (s: AppState) => Result<T>): Result<T> {
    const r = op(this.state);
    if (r.ok) this.set(r.state);
    return r;
  }

  /** Replace the booking cache with records received from Firestore for the signed-in user's role. */
  replaceRemoteBookings(bookings: AppState['bookings']): void {
    this.set({ ...this.state, bookings: [...bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  }

  /** Apply only the Firestore-backed slices supplied by a live subscription. */
  replaceRemoteData(patch: Partial<AppState>): void {
    this.set({ ...this.state, ...patch });
  }

  /** Put back a snapshot taken before a failed remote write, so the screen never shows a change Firestore refused. */
  restore(snapshot: AppState): void {
    this.set(snapshot);
  }

  reset(): void {
    this.set(initialState());
  }
}

export const appStore = new Store();
export const IS_LIVE_DATA = LIVE;

// Cross-tab sync: another tab updated demo data.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STATE_KEY) return;
    const saved = readEnvelope<unknown>(STATE_KEY, STATE_VERSION);
    if (saved && isValidState(saved)) (appStore as unknown as { state: AppState; listeners: Set<Listener> }).state = saved;
    (appStore as unknown as { listeners: Set<Listener> }).listeners.forEach((l) => l());
  });
}
