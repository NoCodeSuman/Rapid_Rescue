import { describe, expect, it, vi } from 'vitest';
import { createSeedState } from '../data/seed';
import { resolveLocalProfile } from '../domain/profileResolution';
import { readFirebaseConfig } from '../lib/firebaseConfig';
import { decideAccess } from '../routes/access';
import { AuthError, mapFirebaseError } from '../services/authErrors';

const goodEnv = { VITE_FIREBASE_API_KEY: 'k-123', VITE_FIREBASE_AUTH_DOMAIN: 'p.firebaseapp.com', VITE_FIREBASE_PROJECT_ID: 'p', VITE_FIREBASE_APP_ID: '1:2:web:3' };

describe('firebase config validation', () => {
  it('accepts a complete config and treats storage/messaging as optional', () => {
    const r = readFirebaseConfig(goodEnv);
    expect(r.error).toBeNull();
    expect(r.config?.projectId).toBe('p');
    expect(r.config?.storageBucket).toBeUndefined();
  });
  it('reports missing/placeholder variable NAMES only, never values', () => {
    const r = readFirebaseConfig({ ...goodEnv, VITE_FIREBASE_API_KEY: 'your_firebase_web_api_key', VITE_FIREBASE_APP_ID: '' });
    expect(r.config).toBeNull();
    expect(r.error).toContain('VITE_FIREBASE_API_KEY');
    expect(r.error).toContain('VITE_FIREBASE_APP_ID');
    expect(r.error).not.toContain('your_firebase_web_api_key');
    expect(r.error).not.toContain('k-123');
  });
  it('fails closed on an empty environment', () => expect(readFirebaseConfig({}).config).toBeNull());
});

describe('firebase error mapping', () => {
  const m = (code: string, kind: Parameters<typeof mapFirebaseError>[1]) => mapFirebaseError({ code, message: 'RAW SDK TEXT with secret' }, kind);
  it('maps login failures to one generic message (no account enumeration)', () => {
    for (const c of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']) expect(m(c, 'login').message).toBe('Incorrect email or password.');
  });
  it('maps the relevant codes', () => {
    expect(m('auth/email-already-in-use', 'register').code).toBe('email-in-use');
    expect(m('auth/weak-password', 'register').code).toBe('weak-password');
    expect(m('auth/invalid-email', 'login').code).toBe('invalid-email');
    expect(m('auth/too-many-requests', 'verify').code).toBe('too-many-requests');
    expect(m('auth/network-request-failed', 'login').code).toBe('network');
    expect(m('auth/user-disabled', 'login').code).toBe('user-disabled');
    expect(m('auth/operation-not-allowed', 'register').code).toBe('operation-not-allowed');
    expect(m('auth/invalid-api-key', 'login').code).toBe('config');
  });
  it('never leaks raw SDK text and handles unknown shapes', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const e of [{ code: 'auth/some-new-code', message: 'RAW SDK TEXT with secret' }, new Error('boom'), null, 'x', undefined]) {
      expect(mapFirebaseError(e, 'register').message).not.toMatch(/RAW|boom|secret/);
    }
    const pass = new AuthError('config', 'x');
    expect(mapFirebaseError(pass, 'login')).toBe(pass);
  });
});

describe('route guard decision', () => {
  it('covers the five auth states', () => {
    expect(decideAccess('initializing', null, 'patient')).toBe('wait');
    expect(decideAccess('signed_out', null, 'patient')).toBe('login');
    expect(decideAccess('unverified', null, 'patient')).toBe('verify');
    expect(decideAccess('profile_error', null, 'patient')).toBe('error');
    expect(decideAccess('verified', 'patient', 'patient')).toBe('allow');
    expect(decideAccess('verified', 'driver', 'patient')).toBe('unauthorized');
    expect(decideAccess('verified', null, 'patient')).toBe('login');
  });
  it('never allows or redirects away while initializing or unverified (no content flash)', () => {
    for (const r of ['patient', 'driver', 'admin'] as const) {
      expect(decideAccess('initializing', 'admin', r)).toBe('wait');
      expect(decideAccess('unverified', 'admin', r)).toBe('verify');
    }
  });
});

describe('local cache resolution (seeded demo accounts are never adoptable)', () => {
  const s = createSeedState();
  it('blocks every seeded demo account, including non-admin ones', () => {
    for (const e of ['Patient@RapidRescue.demo', 'driver@rapidrescue.demo', 'admin@rapidrescue.demo']) expect(resolveLocalProfile(s, e).kind).toBe('blocked');
  });
  it('asks to create a record for unknown emails', () => expect(resolveLocalProfile(s, 'new.person@example.com').kind).toBe('create'));
});
