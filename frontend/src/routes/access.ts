import type { UserRole } from '../types';

export type AuthStatus = 'initializing' | 'signed_out' | 'unverified' | 'profile_error' | 'verified';
export type GuardDecision = 'wait' | 'login' | 'verify' | 'error' | 'unauthorized' | 'allow';

/** Route-guard decision as a pure function. Five auth states, no redirect loops (wait/error render in place, never redirect). */
export function decideAccess(status: AuthStatus, role: UserRole | null, required: UserRole): GuardDecision {
  if (status === 'initializing') return 'wait';
  if (status === 'signed_out') return 'login';
  if (status === 'unverified') return 'verify';
  if (status === 'profile_error') return 'error';
  if (!role) return 'login';
  return role === required ? 'allow' : 'unauthorized';
}
