#!/usr/bin/env tsx
/**
 * Backfill: Customer → CustomerAccount (Task 6).
 *
 * For each distinct Customer.phone_hash, creates a CustomerAccount and links
 * all matching Customer rows via customer_account_id. Seeds one
 * CustomerStoreVisit per (account, retailer) with contact_shared=true and
 * whatsapp_consent from the existing consent_given.
 *
 * Idempotent: re-running creates no duplicate rows.
 *
 * Usage:
 *   npx tsx scripts/backfill-customer-accounts.ts          # dry-run (default)
 *   npx tsx scripts/backfill-customer-accounts.ts --apply   # write to DB
 *   npx tsx scripts/backfill-customer-accounts.ts --batch-size=100
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

const DRY_RUN = !process.argv.includes('--apply');
const BATCH_SIZE = parseInt(
  process.argv.find((a) => a.startsWith('--batch-size='))?.split('=')[1] || '50',
  10,
);

interface BackfillResult {
  accountsCreated: number;
  accountsSkipped: number;
  customersLinked: number;
  visitsCreated: number;
  visitsSkipped: number;
}

async function backfill(): Promise<BackfillResult> {
  const result: BackfillResult = {
    accountsCreated: 0,
    accountsSkipped: 0,
    customersLinked: 0,
    visitsCreated: 0,
    visitsSkipped: 0,
  };

  // Get all distinct phone_hash values from customers that don't have a customer_account_id yet
  const unlinkedCustomers = await prisma.customer.findMany({
    where: { customer_account_id: null, deleted_at: null },
    select: {
      id: true,
      retailer_id: true,
      phone: true,
      phone_hash: true,
      name: true,
      gender: true,
      consent_given: true,
      consent_at: true,
    },
    orderBy: { created_at: 'asc' },
  });

  // Group by phone_hash
  const byHash = new Map<string, typeof unlinkedCustomers>();
  for (const c of unlinkedCustomers) {
    const hash = c.phone_hash || createHash('sha256').update(c.phone).digest('hex');
    const group = byHash.get(hash) || [];
    group.push(c);
    byHash.set(hash, group);
  }

  console.log(`Found ${unlinkedCustomers.length} unlinked customers across ${byHash.size} unique phone hashes.`);

  let batchCount = 0;

  for (const [phoneHash, customers] of byHash) {
    // Check if CustomerAccount already exists for this phone_hash
    const existing = await prisma.customerAccount.findUnique({
      where: { phone_hash: phoneHash },
      select: { id: true },
    });

    let accountId: string;

    if (existing) {
      accountId = existing.id;
      result.accountsSkipped++;
    } else {
      if (DRY_RUN) {
        console.log(`[dry-run] Would create CustomerAccount for phone_hash=${phoneHash.slice(0, 8)}...`);
        accountId = `dry-run-${phoneHash.slice(0, 8)}`;
      } else {
        const first = customers[0]!;
        const account = await prisma.customerAccount.create({
          data: {
            phone: first.phone,
            phone_hash: phoneHash,
            name: first.name,
            gender: first.gender,
            is_verified: true, // Existing customers were captured via form — treat as verified
          },
        });
        accountId = account.id;
        result.accountsCreated++;
      }
    }

    // Link all Customer rows to this account
    for (const c of customers) {
      if (DRY_RUN) {
        console.log(`[dry-run] Would link Customer ${c.id} → account ${accountId}`);
        result.customersLinked++;
      } else {
        await prisma.customer.update({
          where: { id: c.id },
          data: { customer_account_id: accountId },
        });
        result.customersLinked++;
      }

      // Seed CustomerStoreVisit if not exists
      const existingVisit = await prisma.customerStoreVisit.findUnique({
        where: {
          customer_account_id_retailer_id: {
            customer_account_id: accountId,
            retailer_id: c.retailer_id,
          },
        },
      });

      if (existingVisit) {
        result.visitsSkipped++;
      } else if (DRY_RUN) {
        console.log(`[dry-run] Would create CustomerStoreVisit(account=${accountId}, retailer=${c.retailer_id})`);
        result.visitsCreated++;
      } else {
        await prisma.customerStoreVisit.create({
          data: {
            customer_account_id: accountId,
            retailer_id: c.retailer_id,
            source: 'QR_SCAN',
            contact_shared: true, // Existing customers had their contact shared
            whatsapp_consent: c.consent_given,
            whatsapp_consent_at: c.consent_at,
          },
        });
        result.visitsCreated++;
      }
    }

    batchCount++;
    if (batchCount % BATCH_SIZE === 0) {
      console.log(`  Processed ${batchCount}/${byHash.size} phone hashes...`);
    }
  }

  return result;
}

async function main() {
  console.log(`\n${DRY_RUN ? '🔍 DRY RUN' : '🚀 APPLY MODE'} — Backfill Customer → CustomerAccount\n`);

  try {
    const result = await backfill();

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Results:`);
    console.log(`  Accounts created:   ${result.accountsCreated}`);
    console.log(`  Accounts skipped:   ${result.accountsSkipped} (already existed)`);
    console.log(`  Customers linked:   ${result.customersLinked}`);
    console.log(`  Visits created:     ${result.visitsCreated}`);
    console.log(`  Visits skipped:     ${result.visitsSkipped} (already existed)`);
    console.log(`${'='.repeat(50)}`);

    if (DRY_RUN) {
      console.log('\n⚠️  This was a dry run. Use --apply to write changes.\n');
    } else {
      console.log('\n✅ Backfill complete.\n');
    }
  } catch (err) {
    console.error('❌ Backfill failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
