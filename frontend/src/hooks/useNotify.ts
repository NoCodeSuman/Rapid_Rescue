import { toast } from 'sonner';
import { appStore } from '../services';

/** Toast helpers. Errors always show; success/info respect the local "toasts enabled" display setting. */
export const notify = {
  success: (m: string) => { if (appStore.getState().settings.toastsEnabled) toast.success(m); },
  info: (m: string) => { if (appStore.getState().settings.toastsEnabled) toast(m); },
  error: (m: string) => { toast.error(m); },
};
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
