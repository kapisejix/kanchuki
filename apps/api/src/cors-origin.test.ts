import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// H8-3: the production CORS allow-list sends `credentials: true`, so the
// subdomain regex must only accept https origins. index.ts has top-level side
// effects (server boot), so read the regex literal out of the source.
function corsSubdomainRegex(): RegExp {
  const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  const marker = "process.env.WEB_URL ?? '', ";
  const start = src.indexOf(marker) + marker.length;
  const literal = src.slice(start, src.indexOf('\n', start)).trim().slice(0, -1);
  return new RegExp(literal.slice(1, literal.lastIndexOf('/')));
}

describe('production CORS origin regex (H8-3)', () => {
  const re = corsSubdomainRegex();

  it('accepts https kanchuki.app and subdomains at any depth', () => {
    for (const o of [
      'https://kanchuki.app',
      'https://www.kanchuki.app',
      'https://in.kanchuki.app',
      'https://a.b.kanchuki.app',
    ]) {
      expect(re.test(o), o).toBe(true);
    }
  });

  it('rejects plain http, including the apex', () => {
    for (const o of ['http://evil.kanchuki.app', 'http://kanchuki.app']) {
      expect(re.test(o), o).toBe(false);
    }
  });

  it('rejects lookalike hosts', () => {
    for (const o of [
      'https://evilkanchuki.app',
      'https://kanchuki.app.evil.com',
      'https://evil.com/.kanchuki.app',
      'xhttps://kanchuki.app',
      'https://kanchuki.app:8443@evil.com',
    ]) {
      expect(re.test(o), o).toBe(false);
    }
  });
});
