import { describe, expect, it } from 'vitest';
import { config, middleware } from '../middleware';

// Next compiles matcher entries with path-to-regexp; mirror that as plain regexes.
const hits = (p: string) => config.matcher.some((m) => new RegExp(`^${m}$`).test(p));

describe('scanner-probe middleware', () => {
  it('returns 404', () => expect(middleware().status).toBe(404));
  it.each(['/.git/config', '/.env', '/c/install.php', '/wp-login.php', '/x/y/dump.sql'])(
    'matches %s',
    (p) => expect(hits(p)).toBe(true),
  );
  it.each(['/', '/stores', '/some-shop/diwali', '/.well-known/assetlinks.json', '/manifest.json'])(
    'passes %s',
    (p) => expect(hits(p)).toBe(false),
  );
});
