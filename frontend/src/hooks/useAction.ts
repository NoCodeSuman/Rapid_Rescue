import { useCallback, useRef, useState } from 'react';
import { errMsg, notify } from './useNotify';

/** Wraps an async service call: blocks double-submission, tracks loading, reports failures honestly. */
export function useAction() {
  const [pending, setPending] = useState<string | null>(null);
  const lock = useRef(false);
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>, successMsg?: string): Promise<T | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setPending(key);
    try {
      const v = await fn();
      if (successMsg) notify.success(successMsg);
      return v;
    } catch (e) {
      notify.error(errMsg(e));
      return undefined;
    } finally {
      lock.current = false;
      setPending(null);
    }
  }, []);
  return { run, pending, busy: pending !== null };
}
