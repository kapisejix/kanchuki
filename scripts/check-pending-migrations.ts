// Read-only check: are migrations 063, 104–115 applied in the DB behind DATABASE_URL?
// Same shape as check-commission-migration.ts — SELECTs only, prints DB hostname
// (never credentials) and one APPLIED/MISSING line per migration. Never writes.
//
// Run from apps/api (so @prisma/client resolves):
//   cd apps/api && npx tsx --env-file .env ../../scripts/check-pending-migrations.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const one = async (sql: string): Promise<boolean> => {
  const rows = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(sql);
  return rows[0]?.ok === true;
};
const col = (table: string, column: string) =>
  `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='${table}' AND column_name='${column}') AS ok`;
const anyCol = (column: string) =>
  `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND column_name='${column}') AS ok`;
const tbl = (table: string) =>
  `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}') AS ok`;

const CHECKS: Array<[string, string]> = [
  ['063_retailer_preferred_locale', col('retailers', 'preferred_locale')],
  // 104 reverts MODEL rows off imagen_3; 105/106 rename/drop retired engine strings.
  [
    '104_model_engine_revert_kontext',
    `SELECT NOT EXISTS (SELECT 1 FROM studio_styles WHERE tab='MODEL' AND engine='imagen_3') AS ok`,
  ],
  [
    '105_studio_styles_engine_rename',
    `SELECT NOT EXISTS (SELECT 1 FROM studio_styles WHERE engine IN ('imagen_3','imagen_3_fast')) AS ok`,
  ],
  [
    '106_drop_text_to_image_engines',
    `SELECT NOT EXISTS (SELECT 1 FROM studio_styles WHERE engine IN ('flux_pro','flux_schnell')) AS ok`,
  ],
  ['108_customer_nominee', anyCol('nominee_name')],
  ['109_referral_program', tbl('referral_conversions')],
  [
    '110_promotions_purge_grant',
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='kanchuki_purge') AND has_table_privilege('kanchuki_purge','public.promotions','DELETE') AS ok`,
  ],
  [
    '111_backend_role_rls_policies',
    `SELECT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='backend_roles_full_access') AS ok`,
  ],
  ['112_referral_accrual_columns', col('referral_conversions', 'accrued_months')],
  ['113_referral_payout_accounts', tbl('referral_payout_accounts')],
  ['114_referral_tax_columns', anyCol('tds_enabled')],
  [
    '115_referral_payout_account_fix',
    `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname='referral_payout_account_type') AS ok`,
  ],
];

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  console.log(`[check-pending-migrations] db=${url.match(/@([^:/]+)/)?.[1] ?? 'unknown'}`);

  for (const [name, sql] of CHECKS) {
    const res = await one(sql).catch((e: Error) => `ERROR ${e.message.split('\n')[0]}`);
    const tag = res === true ? 'APPLIED' : res === false ? 'MISSING' : res;
    console.log(`  ${tag.padEnd(8)} ${name}`);
  }

  // Supabase SQL Editor applies leave no runner row — show what _prisma_migrations knows.
  const recorded = await prisma
    .$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT migration_name FROM _prisma_migrations WHERE migration_name ~ '^(063|10[4-9]|11[0-5])_' ORDER BY 1`,
    )
    .catch(() => []);
  console.log(
    `[check-pending-migrations] _prisma_migrations rows: ${recorded.map((r) => r.migration_name.slice(0, 3)).join(', ') || 'none'}`,
  );
}

main()
  .catch((err) => {
    console.error('[check-pending-migrations] ERROR:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));
