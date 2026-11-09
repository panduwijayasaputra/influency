// @vitest-environment node
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { config, proxy } from './proxy';

const run = (path: string, cookie?: string) =>
  proxy(
    new NextRequest(`http://localhost:3000${path}`, cookie ? { headers: { cookie } } : undefined),
  );
const location = (path: string, cookie?: string) => run(path, cookie).headers.get('location');

describe('proxy', () => {
  it('sends a guest to login, returning to the page with its query', () => {
    const res = run('/discover?tab=x');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'http://localhost:3000/login?returnTo=%2Fdiscover%3Ftab%3Dx',
    );
  });

  it('sends a guest on Home to plain /login (/ is the default return target)', () => {
    expect(location('/')).toBe('http://localhost:3000/login');
  });

  it.each(['/ana', '/ana/posts/p1', '/login?returnTo=/me'])('lets a guest open %s', (path) => {
    const res = run(path);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('lets a visitor with a session cookie through', () => {
    expect(location('/wallet', 'influency_session=t')).toBeNull();
  });

  it('runs on pages only, not the API, Next internals or files', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ['/', '/me', '/ana/posts/1']) expect(path).toMatch(matcher);
    for (const path of ['/api/v1/auth/me', '/_next/static/x.js', '/favicon.ico'])
      expect(path).not.toMatch(matcher);
  });
});
