// Read-only structure check for admin_commission_expenses (columns + indexes).
// Run from apps/api: npx tsx --env-file .env ../../scripts/check-commission-structure.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const cols = await prisma.$queryRaw<
    Array<{ column_name: string; data_type: string; is_nullable: string }>
  >`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name='admin_commission_expenses'
    ORDER BY ordinal_position
  `;
  const idx = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname='public' AND tablename='admin_commission_expenses'
  `;
  console.log('COLUMNS:', JSON.stringify(cols));
  console.log('INDEXES:', JSON.stringify(idx.map((i) => i.indexname)));
}

main()
  .catch((err) => {
    console.error('ERROR:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));
