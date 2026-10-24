/** Single place that turns Firebase Auth errors into safe, user-friendly messages. Never exposes raw SDK text. */
export type AuthErrorCode =
  | 'invalid-email' | 'invalid-credentials' | 'email-in-use' | 'weak-password' | 'too-many-requests' | 'network'
  | 'user-disabled' | 'config' | 'operation-not-allowed' | 'no-user' | 'unknown';

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message: string) { super(message); this.name = 'AuthError'; this.code = code; }
}

export type AuthContextKind = 'login' | 'register' | 'reset' | 'verify';

const FALLBACK: Record<AuthContextKind, string> = {
  login: 'Could not sign you in. Please try again.',
  register: 'Could not create your account. Please try again.',
  reset: 'Could not send the password-reset email. Please try again.',
  verify: 'The verification email could not be sent. Please try again.',
};

export function mapFirebaseError(e: unknown, kind: AuthContextKind): AuthError {
  if (e instanceof AuthError) return e;
  const raw = (e as { code?: unknown } | null)?.code;
  const code = typeof raw === 'string' ? raw.replace(/^auth\//, '') : '';
  switch (code) {
    case 'invalid-email': return new AuthError('invalid-email', 'Enter a valid email address.');
    case 'invalid-credential': case 'wrong-password': case 'user-not-found': case 'invalid-login-credentials':
      return kind === 'login' ? new AuthError('invalid-credentials', 'Incorrect email or password.') : new AuthError('unknown', FALLBACK[kind]);
    case 'email-already-in-use': return new AuthError('email-in-use', 'An account with this email may already exist. Try logging in or resetting your password.');
    case 'weak-password': return new AuthError('weak-password', 'That password is too weak. Use at least 8 characters with letters and numbers.');
    case 'too-many-requests': return new AuthError('too-many-requests', 'Too many attempts. Please wait a few minutes and try again.');
    case 'network-request-failed': return new AuthError('network', 'Network problem. Check your connection and try again.');
    case 'user-disabled': return new AuthError('user-disabled', 'This account has been disabled. Contact an administrator.');
    case 'operation-not-allowed': return new AuthError('operation-not-allowed', 'Email/password sign-in is not enabled for this Firebase project. See FIREBASE_AUTH_SETUP.md.');
    case 'invalid-api-key': case 'api-key-not-valid.-please-pass-a-valid-api-key.': case 'configuration-not-found': case 'unauthorized-domain': case 'app-not-authorized': case 'unauthorized-continue-uri': case 'invalid-app-credential':
      return new AuthError('config', 'Firebase is not configured correctly (API key, authorized domains or provider settings). See FIREBASE_AUTH_SETUP.md.');
    case 'requires-recent-login': case 'user-token-expired': case 'invalid-user-token':
      return new AuthError('no-user', 'Your session expired. Please log in again.');
    default:
      if (code) console.warn('[auth] unmapped error code:', code); // code only; never message, tokens or credentials
      return new AuthError('unknown', FALLBACK[kind]);
  }
}
