// Read-only check that F-038 referral migrations 109–115 are live.
// Same pattern as check-commission-migration.ts: DATABASE_URL via --env-file,
// prints only the DB hostname + PASS/FAIL per check. Never writes.
//
//   cd packages/db && npx tsx --env-file ../../.env ../../scripts/check-referral-migrations.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Row = Record<string, unknown>;
const q = (sql: TemplateStringsArray, ...v: unknown[]) => prisma.$queryRaw<Row[]>(sql, ...v);

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  console.log(`[check-referral] db=${url.match(/@([^:/]+)/)?.[1] ?? 'unknown'}`);

  const checks: Array<[string, boolean, string]> = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push([name, ok, detail]);

  const tables = await q`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
      AND table_name IN ('referral_settings','referral_codes','referral_conversions',
                         'referral_payouts','referral_payout_accounts')`;
  add('109/113 tables', tables.length === 5, `${tables.length}/5`);

  const settings = await q`SELECT COUNT(*)::int AS n FROM referral_settings WHERE id = 'singleton'`;
  add('109 settings singleton', settings[0]?.n === 1, `rows=${settings[0]?.n}`);

  // has_table_privilege, not information_schema: the latter hides grants the
  // connecting role is not party to.
  const promoGrant = await q`
    SELECT has_table_privilege('kanchuki_purge', 'public.promotions', 'DELETE') AS ok`;
  add('110 promotions purge grant', promoGrant[0]?.ok === true, `ok=${promoGrant[0]?.ok}`);

  const policies = await q`
    SELECT COUNT(*)::int AS n FROM pg_policies
    WHERE 'kanchuki_purge' = ANY(roles) OR 'kanchuki_app' = ANY(roles)`;
  add('111 backend-role RLS policies', Number(policies[0]?.n) > 0, `policies=${policies[0]?.n}`);

  const accrual = await q`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'referral_conversions'
      AND column_name IN ('commission_monthly_paise','accrued_months','accrued_through_period')`;
  add('112 accrual columns', accrual.length === 3, `${accrual.length}/3`);

  const tax = await q`
    SELECT column_name FROM information_schema.columns
    WHERE (table_name = 'referral_settings'
           AND column_name IN ('tds_enabled','tds_pct','gst_applicable','gst_pct'))
       OR (table_name = 'referral_payouts' AND column_name = 'tds_paise')`;
  add('114 tax columns', tax.length === 5, `${tax.length}/5`);

  const acctType = await q`
    SELECT udt_name FROM information_schema.columns
    WHERE table_name = 'referral_payout_accounts' AND column_name = 'account_type'`;
  add(
    '115 account_type is enum',
    acctType[0]?.udt_name === 'referral_payout_account_type',
    `udt=${acctType[0]?.udt_name}`,
  );

  const labels = await q`
    SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'referral_payout_account_type' ORDER BY e.enumsortorder`;
  const labelList = labels.map((l) => l.enumlabel).join(',');
  add('115 enum labels', labelList === 'BANK_ACCOUNT,VPA', labelList || 'none');

  const rawCols = await q`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'referral_payout_accounts' AND column_name IN ('bank_details','vpa_address')`;
  add('115 raw detail columns dropped', rawCols.length === 0, `remaining=${rawCols.length}`);

  // Prisma round-trip on every referral model: fails if schema.prisma and the
  // DB disagree on a selected column or type.
  await Promise.all([
    prisma.referralSettings.findUnique({ where: { id: 'singleton' } }),
    prisma.referralCode.findFirst(),
    prisma.referralConversion.findFirst(),
    prisma.referralPayout.findFirst(),
    prisma.referralPayoutAccount.findFirst(),
  ]).then(
    () => add('Prisma read of all 5 models', true, 'ok'),
    (e: unknown) => add('Prisma read of all 5 models', false, String(e).slice(0, 200)),
  );

  for (const [name, ok, detail] of checks) {
    console.log(`[check-referral] ${ok ? 'PASS' : 'FAIL'} ${name} (${detail})`);
  }
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(`[check-referral] RESULT: ${failed === 0 ? 'ALL PASS' : `${failed} FAILED`}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error('[check-referral] error:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
