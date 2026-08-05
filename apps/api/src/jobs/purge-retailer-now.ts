import { deleteObject } from '@kanchuki/ai';
import { getPurgePrisma } from '@kanchuki/db';

/**
 * Immediate, targeted hard-delete of one retailer and every row that FKs to
 * it (or transitively to its products/customers/collections/orders) —
 * distinct from handlePurgeSoftDeleted() in purge-soft-deleted.ts, which
 * sweeps ALL retailers' soft-deleted rows older than 15 days. This is used
 * by the admin "delete retailer" action, where the whole point is not to
 * wait: the row (and its phone number / auth_user_id) must be gone now so
 * the retailer can sign up again immediately.
 *
 * Same scoped kanchuki_purge role (SECURITY §19) and the same
 * SET app.allow_hard_delete = 'true' guardrail-bypass pattern as the cron.
 * Deletes everything in ONE transaction: if any table is missing a grant or
 * the schema gains a new FK this doesn't know about, Postgres throws and the
 * whole thing rolls back — nothing partially deleted. F-016 vault snapshot
 * happens in the caller (admin-retailers route), before this runs.
 */
const db = getPurgePrisma();

const SET_BYPASS = `SET app.allow_hard_delete = 'true';`;

export async function hardDeleteRetailer(retailerId: string): Promise<void> {
  // R2 objects aren't touched by SQL DELETE — collect keys before the rows
  // that reference them disappear. Best-effort, fired after the transaction
  // commits (a failed R2 delete shouldn't roll back the DB delete).
  const [photos, spinFrames, variants, tryOnJobs, retailer] = await Promise.all([
    db.$queryRawUnsafe<{ r2_key: string | null }[]>(
      `SELECT r2_key FROM product_photos WHERE product_id IN (SELECT id FROM products WHERE retailer_id = $1)`,
      retailerId,
    ),
    db.$queryRawUnsafe<{ r2_key: string | null }[]>(
      `SELECT r2_key FROM product_spin_frames WHERE product_id IN (SELECT id FROM products WHERE retailer_id = $1)`,
      retailerId,
    ),
    db.$queryRawUnsafe<{ r2_key: string | null }[]>(
      `SELECT r2_key FROM product_variants WHERE retailer_id = $1`,
      retailerId,
    ),
    db.$queryRawUnsafe<{ customer_photo_r2_key: string | null; result_r2_key: string | null }[]>(
      `SELECT customer_photo_r2_key, result_r2_key FROM try_on_jobs WHERE retailer_id = $1`,
      retailerId,
    ),
    db.retailer.findUnique({
      where: { id: retailerId },
      select: { logo_r2_key: true, banner_r2_key: true, kyc_gst_r2_key: true, kyc_aadhar_front_r2_key: true, kyc_aadhar_back_r2_key: true },
    }),
  ]);
  const r2Keys = [
    ...photos.map((r) => r.r2_key),
    ...spinFrames.map((r) => r.r2_key),
    ...variants.map((r) => r.r2_key),
    ...tryOnJobs.flatMap((j) => [j.customer_photo_r2_key, j.result_r2_key]),
    retailer?.logo_r2_key,
    retailer?.banner_r2_key,
    retailer?.kyc_gst_r2_key,
    retailer?.kyc_aadhar_front_r2_key,
    retailer?.kyc_aadhar_back_r2_key,
  ].filter((k): k is string => !!k);

  // Children-before-parents. See schema.prisma for the retailer_id FK graph —
  // ponytail: category/measurement cover-image r2_keys aren't cleaned up here
  // (small, rare assets) — add if that ever shows up as orphaned R2 cost.
  const tables = [
    `DELETE FROM product_variants WHERE retailer_id = $1;`,
    `DELETE FROM product_photos WHERE product_id IN (SELECT id FROM products WHERE retailer_id = $1);`,
    `DELETE FROM product_spin_frames WHERE product_id IN (SELECT id FROM products WHERE retailer_id = $1);`,
    `DELETE FROM product_embeddings WHERE retailer_id = $1;`,
    `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE retailer_id = $1);`,
    `DELETE FROM collection_products WHERE collection_id IN (SELECT id FROM collections WHERE retailer_id = $1);`,
    `DELETE FROM collection_views WHERE collection_id IN (SELECT id FROM collections WHERE retailer_id = $1);`,
    `DELETE FROM collection_enquiries WHERE collection_id IN (SELECT id FROM collections WHERE retailer_id = $1);`,
    `DELETE FROM try_on_usage_logs WHERE retailer_id = $1;`,
    `DELETE FROM try_on_jobs WHERE retailer_id = $1;`,
    `DELETE FROM customer_interactions WHERE retailer_id = $1;`,
    `DELETE FROM customer_measurements WHERE retailer_id = $1;`,
    `DELETE FROM customer_fashion_dna WHERE retailer_id = $1;`,
    `DELETE FROM subscription_payments WHERE retailer_id = $1;`,
    `DELETE FROM size_chart_rows WHERE size_chart_id IN (SELECT id FROM size_charts WHERE retailer_id = $1);`,
    `DELETE FROM orders WHERE retailer_id = $1;`,
    `DELETE FROM collections WHERE retailer_id = $1;`,
    `DELETE FROM customers WHERE retailer_id = $1;`,
    `DELETE FROM products WHERE retailer_id = $1;`,
    `DELETE FROM subscriptions WHERE retailer_id = $1;`,
    `DELETE FROM size_charts WHERE retailer_id = $1;`,
    `DELETE FROM support_tickets WHERE retailer_id = $1;`,
    `DELETE FROM ai_usage_logs WHERE retailer_id = $1;`,
    `DELETE FROM quota_addon_purchases WHERE retailer_id = $1;`,
    `DELETE FROM staff WHERE retailer_id = $1;`,
    `DELETE FROM store_sections WHERE retailer_id = $1;`,
    `DELETE FROM product_categories WHERE retailer_id = $1;`,
    `DELETE FROM usage_counters WHERE retailer_id = $1;`,
    // retailer_limit_overrides / retailer_payment_account have onDelete: Cascade
    // in the schema — Postgres removes them automatically with the row below.
    `DELETE FROM retailers WHERE id = $1;`,
  ];

  await db.$transaction([
    db.$executeRawUnsafe(SET_BYPASS),
    ...tables.map((sql) => db.$executeRawUnsafe(sql, retailerId)),
  ]);

  const results = await Promise.allSettled(r2Keys.map((key) => deleteObject(key)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.error(`[purge-retailer-now] ${failed}/${r2Keys.length} R2 deletes failed for retailer ${retailerId}`);
  }
}
