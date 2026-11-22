// OPT-IN proof on real Postgres: runs migration 169 and the archive SQL in a scratch
// schema. Skipped unless GST_ARCHIVE_TEST_DATABASE_URL is set. THROWAWAY database only:
//
//   GST_ARCHIVE_TEST_DATABASE_URL=<throwaway-local-postgres-url> \
//     npx vitest run src/lib/gst-invoice-archive-live.test.ts
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { archiveInvoicesSql } from './gst-invoice-archive.js';

const TEST_URL = process.env.GST_ARCHIVE_TEST_DATABASE_URL;
const SCHEMA = 'gst_archive_test';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

interface Tx {
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
}
let db!: Tx & {
  $transaction: <T>(fn: (tx: Tx) => Promise<T>, o?: { timeout: number }) => Promise<T>;
  $disconnect: () => Promise<void>;
};

const inSchema = <T>(fn: (tx: Tx) => Promise<T>) =>
  db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path = ${SCHEMA}, public`);
      return fn(tx);
    },
    { timeout: 20_000 },
  );

const INVOICE_COLUMNS = `id TEXT PRIMARY KEY, retailer_id TEXT NOT NULL, status TEXT NOT NULL,
  amount_inr INT NOT NULL, amount_excluding_gst INT, gst_amount INT, gst_rate DECIMAL(4,4),
  cgst_amount INT, sgst_amount INT, igst_amount INT, place_of_supply TEXT, sac_code TEXT,
  gst_invoice_number TEXT, invoice_r2_key TEXT, razorpay_payment_id TEXT, razorpay_order_id TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT now()`;

async function seedInvoice(id: string, number: string, key: string | null) {
  await inSchema((tx) =>
    tx.$executeRawUnsafe(
      `INSERT INTO subscription_payments
       (id, retailer_id, status, amount_inr, gst_invoice_number, invoice_r2_key, paid_at)
       VALUES ($1, 'r_1', 'success', 118000, $2, $3, now())`,
      id,
      number,
      key,
    ),
  );
}

async function archiveAndDelete(tx: Tx) {
  await tx.$executeRawUnsafe(archiveInvoicesSql('subscription_payments', '= $1'), 'r_1');
  await tx.$executeRawUnsafe('DELETE FROM subscription_payments WHERE retailer_id = $1', 'r_1');
}

describe.skipIf(!TEST_URL)('gst_invoice_archive on real Postgres', () => {
  beforeAll(async () => {
    const { PrismaClient } = await import('@kanchuki/db');
    db = new PrismaClient({ datasources: { db: { url: TEST_URL } } }) as unknown as typeof db;
    await db.$executeRawUnsafe(`CREATE SCHEMA ${SCHEMA}`);
    const migration = readFileSync(
      join(ROOT, 'packages/db/prisma/migrations/169_gst_invoice_archive/migration.sql'),
      'utf8',
    ).replace(/--.*$/gm, '');
    const statements = migration.match(/(?:\$\$[\s\S]*?\$\$|[^;])+;/g) ?? [];
    await inSchema(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE TABLE retailers (id TEXT PRIMARY KEY, shop_name TEXT NOT NULL,
        phone TEXT, auth_user_id TEXT, kyc_gst_r2_key TEXT, gstin TEXT, address_line1 TEXT,
        address_line2 TEXT, city TEXT, state TEXT, pincode TEXT)`);
      await tx.$executeRawUnsafe(
        `CREATE TABLE subscription_payments (${INVOICE_COLUMNS}, paid_at TIMESTAMP(3))`,
      );
      await tx.$executeRawUnsafe(`INSERT INTO retailers VALUES ('r_1', 'Closed Shop', '9000000000',
        'auth-1', 'kyc/secret.pdf', '27ABCDE1234F1Z5', '1 MG Road', NULL, 'Pune', 'Maharashtra', '411001')`);
      for (const s of statements) await tx.$executeRawUnsafe(s);
    });
  });

  afterAll(async () => {
    await db?.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await db?.$disconnect();
  });

  it('a numbered invoice with no PDF aborts the delete and the source row stays', async () => {
    await seedInvoice('p_nopdf', 'KAN/26-27/000001', null);
    await expect(inSchema(archiveAndDelete)).rejects.toThrow();
    const left = await inSchema((tx) =>
      tx.$queryRawUnsafe<{ c: number }[]>('SELECT count(*)::int c FROM subscription_payments'),
    );
    expect(left[0]?.c).toBe(1);
    await inSchema((tx) =>
      tx.$executeRawUnsafe(`UPDATE subscription_payments SET invoice_r2_key = 'k/a.pdf'`),
    );
  });

  it('the invoice survives with buyer details and no personal data', async () => {
    await inSchema(archiveAndDelete);
    const rows = await inSchema((tx) =>
      tx.$queryRawUnsafe<Record<string, unknown>[]>('SELECT * FROM gst_invoice_archive'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      invoice_number: 'KAN/26-27/000001',
      buyer_name: 'Closed Shop',
      buyer_gstin: '27ABCDE1234F1Z5',
      buyer_address: '1 MG Road, Pune, Maharashtra, 411001',
      invoice_r2_key: 'k/a.pdf',
    });
    const text = JSON.stringify(rows[0]);
    expect(text).not.toContain('9000000000');
    expect(text).not.toContain('auth-1');
    expect(text).not.toContain('kyc/secret');
  });

  it('the archive rejects UPDATE and DELETE even for the owner', async () => {
    await expect(
      inSchema((tx) => tx.$executeRawUnsafe(`UPDATE gst_invoice_archive SET buyer_name = 'x'`)),
    ).rejects.toThrow(/append-only/);
    await expect(
      inSchema((tx) => tx.$executeRawUnsafe('DELETE FROM gst_invoice_archive')),
    ).rejects.toThrow(/append-only/);
  });
});
