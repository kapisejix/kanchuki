import { type Prisma, prisma } from '@kanchuki/db';

// RC-099: max NEW reviews per account per rolling 24 h (product + store combined).
export const MAX_NEW_REVIEWS_PER_DAY = 20;

async function overDailyCap(db: Prisma.TransactionClient, accountId: string) {
  const where = {
    customer_account_id: accountId,
    created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  };
  const [p, s] = await Promise.all([
    db.productReview.count({ where }),
    db.storeReview.count({ where }),
  ]);
  return p + s >= MAX_NEW_REVIEWS_PER_DAY;
}

// RC-102: count and write under one per-account advisory lock, so two parallel first-time
// reviews cannot both read 19 and both insert. Returns null when over the cap; edits skip it.
export async function saveUnderDailyCap<T>(
  accountId: string,
  isEdit: (db: Prisma.TransactionClient) => Promise<boolean>,
  save: (db: Prisma.TransactionClient) => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`review-cap:${accountId}`}, 0))`;
    if (!(await isEdit(tx)) && (await overDailyCap(tx, accountId))) return null;
    return save(tx);
  });
}
