import { describe, it, expect } from 'vitest';
import { decideAuthRouting } from '@/lib/auth-routing';

const base = {
  search: '',
  redirectParam: null as string | null,
};

describe('decideAuthRouting — signed-in user visiting /login', () => {
  it('redirects to / by default', () => {
    const d = decideAuthRouting({
      ...base,
      pathname: '/login',
      hasSession: true,
    });
    expect(d).toEqual({ kind: 'redirect', pathname: '/', search: '' });
  });

  it('honours a safe ?redirect= target', () => {
    const d = decideAuthRouting({
      ...base,
      pathname: '/login',
      hasSession: true,
      redirectParam: '/projects',
    });
    expect(d).toEqual({
      kind: 'redirect',
      pathname: '/projects',
      search: '',
    });
  });

  it('ignores protocol-relative redirect targets (open-redirect guard)', () => {
    const d = decideAuthRouting({
      ...base,
      pathname: '/login',
      hasSession: true,
      redirectParam: '//evil.example.com/steal',
    });
    expect(d).toEqual({ kind: 'redirect', pathname: '/', search: '' });
  });

  it('ignores absolute-url redirect targets', () => {
    const d = decideAuthRouting({
      ...base,
      pathname: '/login',
      hasSession: true,
      redirectParam: 'https://evil.example.com',
    });
    expect(d).toEqual({ kind: 'redirect', pathname: '/', search: '' });
  });
});

describe('decideAuthRouting — unauthenticated access', () => {
  it('lets /login render when no session is present', () => {
    const d = decideAuthRouting({
      ...base,
      pathname: '/login',
      hasSession: false,
    });
    expect(d).toEqual({ kind: 'next' });
  });

  it('returns 401 JSON for API routes', () => {
    const d = decideAuthRouting({
      ...base,
      pathname: '/api/projects',
      hasSession: false,
    });
    expect(d).toEqual({ kind: 'unauthenticated-json' });
  });

  it('redirects pages to /login with a return URL', () => {
    const d = decideAuthRouting({
      ...base,
      pathname: '/projects/abc',
      search: '?tab=items',
      hasSession: false,
    });
    expect(d).toEqual({
      kind: 'redirect',
      pathname: '/login',
      search: `?redirect=${encodeURIComponent('/projects/abc?tab=items')}`,
    });
  });

  it('passes through Next internals and favicon regardless of auth', () => {
    expect(
      decideAuthRouting({
        ...base,
        pathname: '/_next/static/x.js',
        hasSession: false,
      }),
    ).toEqual({ kind: 'next' });
    expect(
      decideAuthRouting({
        ...base,
        pathname: '/favicon.ico',
        hasSession: false,
      }),
    ).toEqual({ kind: 'next' });
  });

  it('passes through public auth endpoints', () => {
    for (const p of [
      '/auth/handoff',
      '/forgot-password',
      '/api/auth/login',
      '/api/auth/logout',
      '/api/auth/me',
      '/api/auth/forgot-password',
    ]) {
      expect(
        decideAuthRouting({ ...base, pathname: p, hasSession: false }),
      ).toEqual({ kind: 'next' });
    }
  });
});

describe('decideAuthRouting — authenticated access', () => {
  it('lets any non-/login page through when signed in', () => {
    expect(
      decideAuthRouting({ ...base, pathname: '/projects', hasSession: true }),
    ).toEqual({ kind: 'next' });
    expect(
      decideAuthRouting({ ...base, pathname: '/orders/xyz', hasSession: true }),
    ).toEqual({ kind: 'next' });
  });
});
