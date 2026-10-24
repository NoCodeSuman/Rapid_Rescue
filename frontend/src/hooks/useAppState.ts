import { useSyncExternalStore } from 'react';
import { appStore } from '../services';
import type { AppState } from '../types';

/** Subscribes a component to the shared demo store. Derive data with useMemo from the returned state. */
export function useAppState(): AppState {
  return useSyncExternalStore(appStore.subscribe, appStore.getState, appStore.getState);
}
