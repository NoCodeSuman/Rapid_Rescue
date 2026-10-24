/**
 * Developer-only demo mode (offline seeded accounts, NOT Firebase, bypasses email verification).
 * Only effective in `vite dev` (import.meta.env.DEV) AND with VITE_ENABLE_DEMO_MODE=true; production builds ignore it.
 */
export const DEMO_MODE: boolean = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_MODE === 'true';
