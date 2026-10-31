/**
 * H4-7 / RC-154: the passport cookie is a bearer secret, so the DB must only ever hold its
 * SHA-256. A leaked `passport_sessions.id` (backup, log, DB read) must not be usable as a cookie.
 *
 * The fake DB is a Map keyed by id, like the real primary-key lookup: a row stored under the raw
 * cookie value is found only by a lookup that uses the raw value.
 */
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn(), del: vi.fn() }));

vi.mock('@kanchuki/db', () => ({
  prisma: { passportSession: { findUnique: m.findUnique, update: m.update, delete: m.del } },
  Prisma: {},
}));

import { getPassportSession } from '../passport/passport-helpers.js';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const rows = new Map<string, Record<string, unknown>>();

function row(id: string, expiresInMs = 60_000) {
  return {
    id,
    customer_account_id: 'acct_1',
    revoked_at: null,
    expires_at: new Date(Date.now() + expiresInMs),
    customer_account: { id: 'acct_1' },
  };
}

beforeEach(() => {
  rows.clear();
  m.findUnique.mockReset().mockImplementation(async ({ where }) => rows.get(where.id) ?? null);
  m.update.mockReset().mockResolvedValue({});
  m.del.mockReset().mockResolvedValue({});
});

describe('getPassportSession stores and looks up the hash only', () => {
  it('finds a session stored under sha256(cookie) and slides it by the hash', async () => {
    const cookie = randomBytes(32).toString('hex');
    rows.set(sha(cookie), row(sha(cookie)));

    const session = await getPassportSession(`kanchuki_passport=${cookie}`);

    expect(session?.customer_account_id).toBe('acct_1');
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: sha(cookie) } }));
  });

  it('does NOT accept a raw id read from the DB as a cookie', async () => {
    const leaked = randomBytes(32).toString('hex');
    rows.set(leaked, row(leaked));

    expect(await getPassportSession(`kanchuki_passport=${leaked}`)).toBeNull();
  });

  it('deletes an expired session by the hash', async () => {
    const cookie = randomBytes(32).toString('hex');
    rows.set(sha(cookie), row(sha(cookie), -1000));

    expect(await getPassportSession(`kanchuki_passport=${cookie}`)).toBeNull();
    expect(m.del).toHaveBeenCalledWith({ where: { id: sha(cookie) } });
  });
});

describe('one cookie -> session lookup', () => {
  // public-search and discover-stores each kept their own copy of the lookup (RC-084 shape), so a
  // fix to the helper missed them. Only the helper may read, slide or delete a session row; the
  // other two writers (mint, logout) must use hashSessionId.
  const routesDir = fileURLToPath(new URL('../../', import.meta.url));
  const files: string[] = [];
  (function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const p = `${dir}${name}`;
      if (statSync(p).isDirectory()) walk(`${p}/`);
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) files.push(p);
    }
  })(routesDir);

  it('only passport-helpers.ts calls passportSession.findUnique/update/delete', () => {
    const offenders = files.filter(
      (f) =>
        !f.endsWith('passport/passport-helpers.ts') &&
        /passportSession\.(findUnique|update|delete)\(/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('every passportSession.create/updateMany by id uses hashSessionId', () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, 'utf8');
      return (
        /passportSession\.(create|updateMany)\(/.test(src) &&
        /id: sessionId/.test(src) &&
        !src.includes('hashSessionId')
      );
    });
    expect(offenders).toEqual([]);
  });
});
