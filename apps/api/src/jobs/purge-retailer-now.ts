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
  const [photos, spinFrames, variants, tryOnJobs, categoryCovers, measurementPhotos, retailer] =
    await Promise.all([
      db.$queryRawUnsafe<{ r2_key: string | null }[]>(
        'SELECT r2_key FROM product_photos WHERE product_id IN (SELECT id FROM products WHERE retailer_id = $1)',
        retailerId,
      ),
      db.$queryRawUnsafe<{ r2_key: string | null }[]>(
        'SELECT r2_key FROM product_spin_frames WHERE product_id IN (SELECT id FROM products WHERE retailer_id = $1)',
        retailerId,
      ),
      db.$queryRawUnsafe<{ r2_key: string | null }[]>(
        'SELECT r2_key FROM product_variants WHERE retailer_id = $1',
        retailerId,
      ),
      db.$queryRawUnsafe<{ customer_photo_r2_key: string | null; result_r2_key: string | null }[]>(
        'SELECT customer_photo_r2_key, result_r2_key FROM try_on_jobs WHERE retailer_id = $1',
        retailerId,
      ),
      // Category cover images (product_categories.image_r2_key).
      db.$queryRawUnsafe<{ r2_key: string | null }[]>(
        'SELECT image_r2_key AS r2_key FROM product_categories WHERE retailer_id = $1',
        retailerId,
      ),
      // Customer measurement photos (front/back capture).
      db.$queryRawUnsafe<{ r2_key: string | null }[]>(
        'SELECT front_photo_r2_key AS r2_key FROM customer_measurements WHERE retailer_id = $1 AND front_photo_r2_key IS NOT NULL UNION ALL SELECT back_photo_r2_key AS r2_key FROM customer_measurements WHERE retailer_id = $1 AND back_photo_r2_key IS NOT NULL',
        retailerId,
        retailerId,
      ),
      db.retailer.findUnique({
        where: { id: retailerId },
        select: {
          logo_r2_key: true,
          banner_r2_key: true,
          kyc_gst_r2_key: true,
          kyc_aadhar_front_r2_key: true,
          kyc_aadhar_back_r2_key: true,
        },
      }),
    ]);
  // Consent-gated training copies (customer photo / garment photo / result) —
  // stored under training_photo_consents keyed to the retailer's try_on_jobs.
  const trainingPhotos = await db.$queryRawUnsafe<{ r2_key: string | null }[]>(
    'SELECT customer_photo_r2_key AS r2_key FROM training_photo_consents WHERE try_on_job_id IN (SELECT id FROM try_on_jobs WHERE retailer_id = $1) UNION ALL SELECT garment_photo_r2_key AS r2_key FROM training_photo_consents WHERE try_on_job_id IN (SELECT id FROM try_on_jobs WHERE retailer_id = $1) UNION ALL SELECT result_r2_key AS r2_key FROM training_photo_consents WHERE try_on_job_id IN (SELECT id FROM try_on_jobs WHERE retailer_id = $1) AND result_r2_key IS NOT NULL',
    retailerId,
    retailerId,
    retailerId,
  );
  // Marketing & growth-engine R2 assets (festival backgrounds, lookbooks,
  // social templates, bug report screenshots, product videos).
  const [festivalR2, lookbookR2, socialTemplateR2, bugReportR2, productVideoR2] =
    await Promise.all([
      db.$queryRawUnsafe<{ r2_key: string | null }[]>(
        'SELECT image_r2_key AS r2_key FROM festival_backgrounds WHERE retailer_id = $1 AND image_r2_key IS NOT NULL',
        retailerId,
      ),
      db.$queryRawUnsafe<{ r2_key: string | null }[]>(
        'SELECT output_r2_key AS r2_key FROM lookbooks WHERE retailer_id = $1 AND output_r2_key IS NOT NULL',
        retailerId,
      ),
      db.$queryRawUnsafe<{ r2_key: string | null }[]>(
        'SELECT image_r2_key AS r2_key FROM social_templates WHERE retailer_id = $1 AND image_r2_key IS NOT NULL',
        retailerId,
      ),
      db.$queryRawUnsafe<{ r2_key: string | null }[]>(
        'SELECT screenshot_r2_key AS r2_key FROM bug_reports WHERE retailer_id = $1 AND screenshot_r2_key IS NOT NULL',
        retailerId,
      ),
      db.$queryRawUnsafe<{ r2_key: string | null }[]>(
        'SELECT r2_key FROM product_videos WHERE retailer_id = $1',
        retailerId,
      ),
    ]);
  const r2Keys = [
    ...photos.map((r) => r.r2_key),
    ...spinFrames.map((r) => r.r2_key),
    ...variants.map((r) => r.r2_key),
    ...tryOnJobs.flatMap((j) => [j.customer_photo_r2_key, j.result_r2_key]),
    ...categoryCovers.map((r) => r.r2_key),
    ...measurementPhotos.map((r) => r.r2_key),
    ...trainingPhotos.map((r) => r.r2_key),
    ...festivalR2.map((r) => r.r2_key),
    ...lookbookR2.map((r) => r.r2_key),
    ...socialTemplateR2.map((r) => r.r2_key),
    ...bugReportR2.map((r) => r.r2_key),
    ...productVideoR2.map((r) => r.r2_key),
    retailer?.logo_r2_key,
    retailer?.banner_r2_key,
    retailer?.kyc_gst_r2_key,
    retailer?.kyc_aadhar_front_r2_key,
    retailer?.kyc_aadhar_back_r2_key,
  ].filter((k): k is string => !!k);

  // Children-before-parents. See schema.prisma for the retailer_id FK graph.
  const tables = [
    'DELETE FROM product_variants WHERE retailer_id = $1;',
    'DELETE FROM product_photos WHERE product_id IN (SELECT id FROM products WHERE retailer_id = $1);',
    'DELETE FROM product_spin_frames WHERE product_id IN (SELECT id FROM products WHERE retailer_id = $1);',
    'DELETE FROM product_embeddings WHERE retailer_id = $1;',
    'DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE retailer_id = $1);',
    'DELETE FROM partner_referrals WHERE partner_id IN (SELECT id FROM partners WHERE retailer_id = $1);',
    'DELETE FROM collection_products WHERE collection_id IN (SELECT id FROM collections WHERE retailer_id = $1);',
    'DELETE FROM collection_views WHERE collection_id IN (SELECT id FROM collections WHERE retailer_id = $1);',
    'DELETE FROM collection_enquiries WHERE collection_id IN (SELECT id FROM collections WHERE retailer_id = $1);',
    'DELETE FROM campaign_sends WHERE retailer_id = $1;',
    'DELETE FROM try_on_usage_logs WHERE retailer_id = $1;',
    // Consent-gated training copies are keyed to the retailer's try_on_jobs
    // (no FK — delete explicitly BEFORE the jobs they reference, or the
    // subquery below finds nothing and they'd be orphaned).
    'DELETE FROM training_photo_consents WHERE try_on_job_id IN (SELECT id FROM try_on_jobs WHERE retailer_id = $1);',
    'DELETE FROM try_on_jobs WHERE retailer_id = $1;',
    'DELETE FROM customer_interactions WHERE retailer_id = $1;',
    'DELETE FROM customer_measurements WHERE retailer_id = $1;',
    'DELETE FROM customer_fashion_dna WHERE retailer_id = $1;',
    'DELETE FROM customer_visits WHERE retailer_id = $1;',
    'DELETE FROM subscription_payments WHERE retailer_id = $1;',
    'DELETE FROM size_chart_rows WHERE size_chart_id IN (SELECT id FROM size_charts WHERE retailer_id = $1);',
    'DELETE FROM referral_credits WHERE retailer_id = $1;',
    'DELETE FROM referrals WHERE retailer_id = $1;',
    'DELETE FROM orders WHERE retailer_id = $1;',
    'DELETE FROM collections WHERE retailer_id = $1;',
    'DELETE FROM customers WHERE retailer_id = $1;',
    'DELETE FROM products WHERE retailer_id = $1;',
    'DELETE FROM subscriptions WHERE retailer_id = $1;',
    'DELETE FROM size_charts WHERE retailer_id = $1;',
    'DELETE FROM campaigns WHERE retailer_id = $1;',
    'DELETE FROM promotions WHERE retailer_id = $1;',
    'DELETE FROM suppliers WHERE retailer_id = $1;',
    'DELETE FROM supplier_transactions WHERE retailer_id = $1;',
    'DELETE FROM bookings WHERE retailer_id = $1;',
    'DELETE FROM partners WHERE retailer_id = $1;',
    'DELETE FROM partner_events WHERE retailer_id = $1;',
    'DELETE FROM incentive_rules WHERE retailer_id = $1;',
    'DELETE FROM festival_backgrounds WHERE retailer_id = $1;',
    'DELETE FROM lookbooks WHERE retailer_id = $1;',
    'DELETE FROM social_templates WHERE retailer_id = $1;',
    'DELETE FROM channel_syncs WHERE retailer_id = $1;',
    'DELETE FROM product_reviews WHERE retailer_id = $1;',
    'DELETE FROM store_reviews WHERE retailer_id = $1;',
    'DELETE FROM bug_reports WHERE retailer_id = $1;',
    'DELETE FROM support_tickets WHERE retailer_id = $1;',
    'DELETE FROM ai_usage_logs WHERE retailer_id = $1;',
    'DELETE FROM quota_addon_purchases WHERE retailer_id = $1;',
    'DELETE FROM staff WHERE retailer_id = $1;',
    'DELETE FROM store_sections WHERE retailer_id = $1;',
    'DELETE FROM product_categories WHERE retailer_id = $1;',
    'DELETE FROM usage_counters WHERE retailer_id = $1;',
    // F-027 product_attributes + F-031 social accounts/posts have
    // retailer_id FKs WITHOUT onDelete: Cascade (migrations 046/052) — they
    // were missing from this list, so `DELETE FROM retailers` threw an FK
    // violation and the whole transaction rolled back (the admin delete
    // silently did nothing). Delete them before the retailer row.
    'DELETE FROM social_posts WHERE retailer_id = $1;',
    'DELETE FROM social_accounts WHERE retailer_id = $1;',
    'DELETE FROM product_attributes WHERE retailer_id = $1;',
    // retailer_limit_overrides / retailer_payment_account / catalog_items /
    // catalog_sync_logs / customer_store_visits / store_affinities have
    // onDelete: Cascade in the schema — Postgres removes them automatically
    // with the row below.
    'DELETE FROM retailers WHERE id = $1;',
  ];

  await db.$transaction([
    db.$executeRawUnsafe(SET_BYPASS),
    ...tables.map((sql) => db.$executeRawUnsafe(sql, retailerId)),
  ]);

  const results = await Promise.allSettled(r2Keys.map((key) => deleteObject(key)));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    console.error(
      `[purge-retailer-now] ${failed}/${r2Keys.length} R2 deletes failed for retailer ${retailerId}`,
    );
  }
}
