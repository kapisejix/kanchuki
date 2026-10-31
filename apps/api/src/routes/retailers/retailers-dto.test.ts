// H2-5 / RC-143 — toRetailerDto strips every secret column, and the strip list cannot drift from
// the schema: the Retailer model in schema.prisma is read here, so a new token or KYC column that
// is not added to RETAILER_SECRET_FIELDS fails this file instead of shipping on /retailers/me.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RETAILER_SECRET_FIELDS, toRetailerDto } from './retailers-dto.js';

const schema = readFileSync(
  new URL('../../../../../packages/db/prisma/schema.prisma', import.meta.url),
  'utf8',
);
const model = /\nmodel Retailer \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';
const columns = [...model.matchAll(/^[ \t]+([a-z][a-z0-9_]*)[ \t]+\S/gm)].map(
  (m) => m[1] as string,
);

// Secret-looking by name but not secret: the public logo/banner object keys.
const NOT_SECRET = new Set(['logo_r2_key', 'banner_r2_key']);
const looksSecret = (c: string) =>
  /token|secret|password|ciphertext/.test(c) ||
  /_r2_key$/.test(c) ||
  /^kyc_.*_url$/.test(c) ||
  c === 'auth_user_id';

describe('toRetailerDto', () => {
  it('removes every secret field and keeps the rest', () => {
    const row = {
      id: 'r1',
      shop_name: 'Meera Sarees',
      trial_ends_at: null,
      ...Object.fromEntries(RETAILER_SECRET_FIELDS.map((f) => [f, `secret-${f}`])),
    };
    expect(toRetailerDto(row)).toEqual({
      id: 'r1',
      shop_name: 'Meera Sarees',
      trial_ends_at: null,
    });
  });
  it('does not mutate the row it is given', () => {
    const row = { id: 'r1', fb_ads_access_token: 'x' };
    toRetailerDto(row);
    expect(row).toEqual({ id: 'r1', fb_ads_access_token: 'x' });
  });
});

describe('RETAILER_SECRET_FIELDS vs schema.prisma', () => {
  it('found the Retailer model (the guard below is not vacuous)', () => {
    expect(columns.length).toBeGreaterThan(20);
    expect(columns).toContain('shop_name');
  });
  it('Retailer has no gmb_ columns (legacy GMB integration removed in RC-101)', () => {
    expect(columns.filter((c) => c.startsWith('gmb_'))).toEqual([]);
  });
  it('every listed field is a real Retailer column', () => {
    for (const f of RETAILER_SECRET_FIELDS) expect(columns, f).toContain(f);
  });
  it('every secret-looking Retailer column is listed (or knowingly not secret)', () => {
    const missing = columns.filter(
      (c) =>
        looksSecret(c) &&
        !NOT_SECRET.has(c) &&
        !(RETAILER_SECRET_FIELDS as readonly string[]).includes(c),
    );
    expect(missing).toEqual([]);
  });
});
