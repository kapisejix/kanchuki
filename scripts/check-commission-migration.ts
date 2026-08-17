// Read-only migration check for the admin commission tracker.
// Connects with the SAME DATABASE_URL the API uses (--env-file .env) and
// checks information_schema for the admin_commission_expenses table.
// Prints only PASS/FAIL + the DB hostname (no credentials) + row counts.
// Never writes anything.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Hostname only — never print credentials.
  const url = process.env.DATABASE_URL ?? '';
  const host = (url.match(/@([^:/]+)/)?.[1] ?? 'unknown').replace(/^[^@]*@/, '');

  const table = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'admin_commission_expenses'
    ) AS exists
  `;

  const exists = table[0]?.exists ?? false;

  if (!exists) {
    console.log(`[check-commission-migration] db=${host} admin_commission_expenses=MISSING`);
    console.log('[check-commission-migration] RESULT: migration 053_admin_commission NOT applied');
    return;
  }

  const count = await prisma.adminCommissionExpense.count().catch(() => -1);
  const paymentCount = await prisma.subscriptionPayment.count().catch(() => -1);
  console.log(`[check-commission-migration] db=${host} admin_commission_expenses=PRESENT`);
  console.log(
    `[check-commission-migration] expenses=${count} subscription_payments=${paymentCount}`,
  );
  console.log('[check-commission-migration] RESULT: migration applied, table usable');
}

main()
  .catch((err) => {
    console.error('[check-commission-migration] ERROR:', (err as Error).message);
    console.error('[check-commission-migration] RESULT: could not reach DB');
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));
