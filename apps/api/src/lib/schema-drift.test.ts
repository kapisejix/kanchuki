import { Prisma as RealPrisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();
const captureMessage = vi.fn();
vi.mock('@kanchuki/db', () => ({
  prisma: { $queryRaw: (...a: unknown[]) => queryRaw(...a) },
  Prisma: {
    dmmf: {
      datamodel: {
        models: [
          {
            name: 'Retailer',
            dbName: 'retailers',
            fields: [
              { name: 'id', kind: 'scalar' },
              { name: 'setup_dismissed', kind: 'scalar' },
              { name: 'plan', kind: 'enum' },
              { name: 'products', kind: 'object' }, // relation: no column
            ],
          },
          { name: 'Plain', dbName: null, fields: [{ name: 'id', kind: 'scalar' }] },
        ],
      },
    },
  },
}));
vi.mock('@sentry/node', () => ({ captureMessage: (...a: unknown[]) => captureMessage(...a) }));

import {
  checkSchemaDrift,
  expectedColumns,
  getSchemaDrift,
  missingColumns,
  schemaHealth,
} from './schema-drift.js';

const rows = (t: string, cols: string[]) => cols.map((c) => ({ table_name: t, column_name: c }));

describe('expectedColumns / missingColumns', () => {
  it('maps @@map / @map names and skips relation fields', () => {
    const exp = expectedColumns([
      {
        name: 'Retailer',
        dbName: 'retailers',
        fields: [
          { name: 'shopName', dbName: 'shop_name', kind: 'scalar' },
          { name: 'products', kind: 'object' },
        ],
      },
    ]);
    expect(exp.get('retailers')).toEqual(['shop_name']);
  });

  it('names the missing column and the missing table', () => {
    const exp = new Map([
      ['retailers', ['id', 'setup_dismissed']],
      ['gbp_links', ['id']],
    ]);
    const act = new Map([['retailers', new Set(['id'])]]);
    expect(missingColumns(exp, act)).toEqual([
      'gbp_links (missing table)',
      'retailers.setup_dismissed',
    ]);
  });

  it('is empty when the DB has everything (extra DB columns are fine)', () => {
    const exp = new Map([['retailers', ['id']]]);
    const act = new Map([['retailers', new Set(['id', 'legacy_col'])]]);
    expect(missingColumns(exp, act)).toEqual([]);
  });
});

describe('checkSchemaDrift', () => {
  beforeEach(() => {
    queryRaw.mockReset();
    captureMessage.mockReset();
  });

  it('RC-160: reports the exact column and alerts Sentry', async () => {
    queryRaw.mockResolvedValue([...rows('retailers', ['id', 'plan']), ...rows('Plain', ['id'])]);
    const res = await checkSchemaDrift();
    expect(res?.ok).toBe(false);
    expect(res?.missing).toEqual(['retailers.setup_dismissed']);
    expect(getSchemaDrift()?.missing).toEqual(['retailers.setup_dismissed']);
    expect(captureMessage).toHaveBeenCalledOnce();
  });

  it('is ok and silent when nothing is missing', async () => {
    queryRaw.mockResolvedValue([
      ...rows('retailers', ['id', 'setup_dismissed', 'plan']),
      ...rows('Plain', ['id']),
    ]);
    const res = await checkSchemaDrift();
    expect(res).toMatchObject({ ok: true, missing: [] });
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('a DB that cannot be asked is "unknown", not drift, and never throws', async () => {
    queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(checkSchemaDrift()).resolves.toBeNull();
    expect(captureMessage).not.toHaveBeenCalled();
  });
});

describe('schemaHealth', () => {
  const drift = { ok: false, missing: ['retailers.setup_dismissed'], checkedAt: 1 };
  it('drift fails the probe only when the owner opted in', () => {
    expect(schemaHealth(drift, true)).toEqual({ status: 'drift', failsHealth: true });
    expect(schemaHealth(drift, false)).toEqual({ status: 'drift', failsHealth: false });
  });
  it('ok and unknown never fail the probe, even when opted in', () => {
    expect(schemaHealth({ ok: true, missing: [], checkedAt: 1 }, true).failsHealth).toBe(false);
    expect(schemaHealth(null, true)).toEqual({ status: 'unknown', failsHealth: false });
  });
});

describe('against the real Prisma model', () => {
  it('knows retailers.setup_dismissed (the RC-160 column) and a mapped table', () => {
    const exp = expectedColumns(RealPrisma.dmmf.datamodel.models);
    expect(exp.get('retailers')).toContain('setup_dismissed');
    expect(exp.get('gbp_links')).toContain('retailer_id');
  });
});
