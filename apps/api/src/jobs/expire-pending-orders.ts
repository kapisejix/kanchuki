import { prisma } from '@kanchuki/db';

const EXPIRY_MINUTES = 30;

/**
 * Expire unpaid PENDING_PAYMENT orders older than EXPIRY_MINUTES.
 *
 * Called frequently (every 5 min via BullMQ repeatable job). Releases products
 * back to AVAILABLE so they aren't stuck in RESERVED forever when a customer
 * abandons checkout after the Razorpay redirect.
 *
 * SECURITY §11.7: Uses a prisma.$transaction so the order cancellation + product
 * release are atomic — if the process crashes mid-way, no products leak.
 */
export async function handleExpirePendingOrders(): Promise<void> {
  const cutoff = new Date(Date.now() - EXPIRY_MINUTES * 60 * 1000);

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log(
    `[expire-pending-orders] Querying PENDING_PAYMENT orders created < ${cutoff.toISOString()}...`,
  );

  const BATCH_SIZE = 50;
  let totalExpired = 0;
  let cursor: string | undefined;

  while (true) {
    const expiredOrders = await prisma.order.findMany({
      where: {
        status: 'PENDING_PAYMENT',
        created_at: { lt: cutoff },
      },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: BATCH_SIZE,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        items: {
          select: { product_id: true },
        },
      },
    });

    if (expiredOrders.length === 0) break;

    for (const order of expiredOrders) {
      try {
        await prisma.$transaction(async (tx) => {
          // Update order status to CANCELLED
          await tx.order.update({
            where: { id: order.id },
            data: { status: 'CANCELLED', cancelled_at: new Date() },
          });

          // Release products back to AVAILABLE (only RESERVED ones — products
          // that somehow got SOLD via another path shouldn't be touched).
          if (order.items.length > 0) {
            await tx.product.updateMany({
              where: {
                id: { in: order.items.map((i) => i.product_id) },
                status: 'RESERVED',
              },
              data: { status: 'AVAILABLE' },
            });
          }
        });

        totalExpired++;
      } catch (err) {
        console.error(
          `[expire-pending-orders] Failed to expire order ${order.id}: ` +
            `${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const last = expiredOrders[expiredOrders.length - 1];
    cursor = last?.id;
  }

  // biome-ignore lint/suspicious/noConsoleLog: admin cron job logging
  console.log(
    `[expire-pending-orders] Complete: ${totalExpired} expired orders cancelled, products released`,
  );
}
