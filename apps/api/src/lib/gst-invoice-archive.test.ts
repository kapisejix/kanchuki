// An issued GST invoice must survive every delete path, and personal data must not.
// Mocked DB: proves statement order, transaction membership and the columns copied.
// The real Postgres proof is gst-invoice-archive-live.test.ts (opt-in).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  retailerFindUnique: vi.fn(),
  retailerFindMany: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock('@kanchuki/ai', () => ({ deleteObject: vi.fn() }));
vi.mock('@kanchuki/db', () => ({
  prisma: { __sentinel: 'primary' },
  getPurgePrisma: () => ({
    $executeRawUnsafe: (sql: string, ...args: unknown[]) => ({ sql, args }),
    $queryRawUnsafe: m.query,
    $transaction: m.transaction,
    retailer: { findUnique: m.retailerFindUnique, findMany: m.retailerFindMany },
    auditLog: { create: vi.fn() },
  }),
}));
vi.mock('./retailer-delete-prep.js', () => ({ prepareRetailerDeletion: m.prepare }));

import { hardDeleteRetailer } from '../jobs/purge-retailer-now.js';
import { handlePurgeSoftDeleted } from '../jobs/purge-soft-deleted.js';
import { archiveInvoicesSql } from './gst-invoice-archive.js';

type Op = { sql: string; args: unknown[] };
const SOURCES = ['subscription_payments', 'quota_addon_purchases'] as const;

let transactions: Op[][];

beforeEach(() => {
  transactions = [];
  m.query.mockReset().mockResolvedValue([]);
  m.retailerFindUnique.mockReset().mockResolvedValue({});
  m.retailerFindMany.mockReset().mockResolvedValue([{ id: 'r_1' }]);
  m.prepare.mockReset().mockResolvedValue(undefined);
  m.transaction.mockReset().mockImplementation(async (ops: Op[]) => {
    transactions.push(ops);
    return ops.map(() => 1);
  });
});

function expectArchivedBeforeDelete(source: (typeof SOURCES)[number]) {
  const isDelete = (o: Op) => new RegExp(`^DELETE FROM "?${source}"?`).test(o.sql);
  const ops = transactions.find((tx) => tx.some(isDelete));
  expect(ops, `${source} delete transaction`).toBeDefined();
  const archive = (ops as Op[]).findIndex(
    (o) =>
      o.sql.startsWith('INSERT INTO gst_invoice_archive') && o.sql.includes(`FROM ${source} s`),
  );
  expect(archive, `${source} archived in the same transaction`).toBeGreaterThanOrEqual(0);
  expect(archive).toBeLessThan((ops as Op[]).findIndex(isDelete));
}

describe('every delete path archives invoices in the delete transaction', () => {
  it.each(SOURCES)('hardDeleteRetailer (self + admin delete): %s', async (source) => {
    await hardDeleteRetailer('r_1');
    expectArchivedBeforeDelete(source);
  });

  it.each(SOURCES)('purge-soft-deleted cron: %s', async (source) => {
    await handlePurgeSoftDeleted();
    expectArchivedBeforeDelete(source);
    expect(m.prepare).toHaveBeenCalledWith('r_1');
  });

  it('a failed archive rejects the delete', async () => {
    m.transaction.mockRejectedValueOnce(new Error('archive insert failed'));
    await expect(hardDeleteRetailer('r_1')).rejects.toThrow('archive insert failed');
  });

  it('the cron deletes no invoice row when preparation failed', async () => {
    m.prepare.mockRejectedValueOnce(new Error('cancel failed'));
    await expect(handlePurgeSoftDeleted()).rejects.toThrow('cancel failed');
    expect(transactions.flat().some((o) => o.sql.includes('subscription_payments'))).toBe(false);
  });
});

describe('the archive copies no personal data', () => {
  it.each(SOURCES)('%s: no phone, auth id or KYC column', (source) => {
    const sql = archiveInvoicesSql(source, '= $1');
    expect(sql).not.toMatch(/phone|auth_user|kyc|aadhar|owner_name|email/i);
    expect(sql).toMatch(/r\.shop_name, r\.gstin/);
    expect(sql).not.toMatch(/ON CONFLICT/i);
  });
});
