import { QUEUES } from '@kanchuki/shared';
import { Worker } from 'bullmq';
import { STUDIO_SHOOT_CONCURRENCY } from '../lib/studio-shoot.js';
import { handleBackfillMissingAiFields } from './backfill-missing-ai-fields.js';
import { handleBackupDatabase } from './backup-database.js';
import { handleCatalogSync, handleDailyCatalogSync } from './catalog-sync.js';
import type { CatalogSyncJobData } from './catalog-sync.js';
import { handleColorFamilyBackfill } from './color-family-backfill.js';
import { handleCompressR2Images } from './compress-r2-images.js';
import { handleEmbeddingBackfill } from './embedding-backfill.js';
import { handleEngagementAggregate } from './engagement-aggregate.js';
import {
  type EnquiryPushJobData,
  type EnquiryPushReceiptsJobData,
  handleEnquiryPush,
  handleEnquiryPushReceipts,
} from './enquiry-push.js';
import { handleGenerateEmbedding } from './generate-embedding.js';
import {
  type GenerateGstInvoiceJobData,
  addGenerateGstInvoiceJob,
  handleBackfillGstInvoices,
  handleGenerateGstInvoice,
} from './generate-gst-invoice.js';
import { handleGenerateKenBurnsVideo } from './generate-ken-burns-video.js';
import type { KenBurnsVideoJobData } from './generate-ken-burns-video.js';
import { handleMeasureR2Storage } from './measure-r2-storage.js';
import { type MyStyleAnalyzeJobData, handleMyStyleAnalyze } from './my-style-analyze.js';
import { handleAiSpendAlert } from './ai-spend-alert.js';
import { handlePlanLapse } from './plan-lapse.js';
import { handlePurgeSoftDeleted, pruneCustomerInteractions } from './purge-soft-deleted.js';
import {
  getCatalogSyncQueue,
  getEmbeddingQueue,
  getMaintenanceQueue,
  getMyStyleAnalyzeQueue,
  getRedis,
  getStudioShootQueue,
  getTaggingQueue,
  getTryOnQueue,
} from './queue.js';
import { handleReferralAccrue } from './referral-accrue.js';
import { handleReferralPayout } from './referral-payout.js';
import { handleReferralQualify } from './referral-qualify.js';
import {
  type RewatermarkShowcaseDesignsJobData,
  addRewatermarkShowcaseDesignsJob,
  handleRewatermarkShowcaseDesigns,
} from './rewatermark-showcase-designs.js';
import { handleSchedulePublishTick, handleScheduleTokenHealth } from './scheduled-post-publish.js';
import { handleStudioShoot } from './studio-shoot.js';
import type { StudioShootJobData } from './studio-shoot.js';
import { handleTagProduct } from './tag-product.js';
import { handleTryOnDeletionSweep } from './tryon-deletion-sweep.js';
import { handleTryOn } from './tryon.js';
import type { TryOnJobData } from './tryon.js';

// Redis + queue accessors live in ./queue.js (shared with every producer).
export { getRedis };

// ─── Job Producers ────────────────────────────────────────────────

export interface TaggingJobData {
  product_id: string;
  retailer_id: string;
  photo_url: string;
  r2_key: string;
  auto_cleanup?: boolean;
}

export interface EmbeddingJobData {
  product_id: string;
  retailer_id: string;
}

export async function addTaggingJob(data: TaggingJobData): Promise<void> {
  await getTaggingQueue().add('tag-product', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });
}

export async function addEmbeddingJob(data: EmbeddingJobData): Promise<void> {
  await getEmbeddingQueue().add('generate-embedding', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 50 },
  });
}

export interface CompressR2ImagesJobData {
  triggered_by?: 'schedule' | 'admin';
}

export async function addCompressR2ImagesJob(data?: CompressR2ImagesJobData): Promise<void> {
  await getMaintenanceQueue().add('compress-r2-images', data ?? {}, {
    removeOnComplete: { count: 10 },
    removeOnFail: { count: 10 },
  });
}

export async function addMeasureR2StorageJob(): Promise<void> {
  await getMaintenanceQueue().add(
    'measure-r2-storage',
    {},
    {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );
}

export async function addKenBurnsVideoJob(data: KenBurnsVideoJobData): Promise<void> {
  await getMaintenanceQueue().add('generate-ken-burns-video', data, {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 20 },
  });
}

export async function addStudioShootJob(data: StudioShootJobData): Promise<void> {
  await getStudioShootQueue().add('studio-shoot', data, {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });
}

/** F-040: enqueue one try-on. The payload carries NO image bytes — the wearer's
 *  photo is handed over in-process via lib/tryon-photo-store.ts, so it never
 *  reaches Redis (T6). */
export async function addTryOnJob(data: TryOnJobData): Promise<void> {
  await getTryOnQueue().add('try-on', data, {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });
}

/** F-045: enqueue one My Style selfie read. No image bytes in the payload — the photo is
 *  handed over in-process (lib/tryon-photo-store.ts), never through Redis. attempts: 1
 *  because a retry would find no photo and each attempt is a paid Vision call. */
export async function addMyStyleAnalyzeJob(data: MyStyleAnalyzeJobData): Promise<void> {
  await getMyStyleAnalyzeQueue().add('my-style-analyze', data, {
    attempts: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });
}

export async function addCatalogSyncJob(data: CatalogSyncJobData): Promise<string> {
  const job = await getCatalogSyncQueue().add('catalog-sync', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 100 },
  });
  return job.id ?? '';
}

export { addGenerateGstInvoiceJob };

// ─── Workers ─────────────────────────────────────────────────────

export async function startWorkers(): Promise<void> {
  const redis = getRedis();

  const taggingWorker = new Worker(
    QUEUES.AI_TAGGING,
    async (job) => {
      const data = job.data as TaggingJobData;
      await handleTagProduct(data);
    },
    { connection: redis, concurrency: 3 },
  );

  const embeddingWorker = new Worker(
    QUEUES.EMBEDDINGS,
    async (job) => {
      const data = job.data as EmbeddingJobData;
      await handleGenerateEmbedding(data);
    },
    { connection: redis, concurrency: 5 },
  );

  const studioShootWorker = new Worker(
    QUEUES.STUDIO_SHOOT,
    async (job) => {
      const data = job.data as StudioShootJobData;
      await handleStudioShoot(data);
    },
    { connection: redis, concurrency: STUDIO_SHOOT_CONCURRENCY },
  );

  const tryOnWorker = new Worker(
    QUEUES.TRY_ON,
    async (job) => {
      const data = job.data as TryOnJobData;
      await handleTryOn(data);
    },
    // Bounded: every job is one RunPod GPU inference, and the endpoint scales
    // per concurrent request — a burst here is a real bill, not just latency.
    { connection: redis, concurrency: 2 },
  );

  const myStyleAnalyzeWorker = new Worker(
    QUEUES.MY_STYLE_ANALYZE,
    async (job) => {
      await handleMyStyleAnalyze(job.data as MyStyleAnalyzeJobData);
    },
    // Bounded: each job is a metered Vision call.
    { connection: redis, concurrency: 3 },
  );

  const pushWorker = new Worker(
    QUEUES.PUSH,
    async (job) => {
      if (job.name === 'enquiry-push-receipts') {
        return handleEnquiryPushReceipts(job.data as EnquiryPushReceiptsJobData);
      }
      return handleEnquiryPush(job.data as EnquiryPushJobData);
    },
    { connection: redis, concurrency: 5 },
  );

  const catalogSyncWorker = new Worker(
    QUEUES.CATALOG_SYNC,
    async (job) => {
      const data = job.data as CatalogSyncJobData;
      await handleCatalogSync(data);
    },
    { connection: redis, concurrency: 2 },
  );

  const maintenanceWorker = new Worker(
    QUEUES.MAINTENANCE,
    async (job) => {
      switch (job.name) {
        case 'backfill-missing-ai-fields':
          return handleBackfillMissingAiFields();
        case 'purge-soft-deleted': {
          const result = await handlePurgeSoftDeleted();
          await pruneCustomerInteractions();
          return result;
        }
        case 'referral-qualify':
          return handleReferralQualify();
        case 'referral-accrue':
          return handleReferralAccrue();
        case 'referral-payout':
          return handleReferralPayout('cron');
        case 'engagement-aggregate':
          return handleEngagementAggregate();
        case 'backup-database': {
          const data = (job.data ?? {}) as { type?: 'daily' | 'weekly' | 'manual' };
          return handleBackupDatabase(data.type ?? 'daily');
        }
        case 'compress-r2-images': {
          const data = (job.data ?? {}) as CompressR2ImagesJobData;
          return handleCompressR2Images(data);
        }
        case 'measure-r2-storage':
          return handleMeasureR2Storage();
        case 'catalog-daily-full-sync':
          return handleDailyCatalogSync();
        case 'generate-ken-burns-video': {
          const data = job.data as KenBurnsVideoJobData;
          return handleGenerateKenBurnsVideo(data);
        }
        case 'embedding-backfill':
          return handleEmbeddingBackfill();
        case 'color-family-backfill':
          return handleColorFamilyBackfill();
        case 'generate-gst-invoice': {
          const data = job.data as GenerateGstInvoiceJobData;
          return handleGenerateGstInvoice(data);
        }
        case 'backfill-gst-invoices':
          return handleBackfillGstInvoices(addGenerateGstInvoiceJob);
        case 'rewatermark-showcase-designs': {
          const data = (job.data ?? {}) as RewatermarkShowcaseDesignsJobData;
          return handleRewatermarkShowcaseDesigns(data);
        }
        case 'tryon-deletion-sweep':
          return handleTryOnDeletionSweep();
        case 'schedule-publish-tick':
          return handleSchedulePublishTick();
        case 'schedule-token-health':
          return handleScheduleTokenHealth();
        case 'plan-lapse':
          return handlePlanLapse();
        case 'ai-spend-alert':
          return handleAiSpendAlert();
        default:
          throw new Error(`[jobs] unknown maintenance job: ${job.name}`);
      }
    },
    { connection: redis, concurrency: 1 },
  );

  // Purge soft-deleted records daily at 1:30 AM UTC
  await getMaintenanceQueue().add(
    'purge-soft-deleted',
    {},
    {
      repeat: { pattern: '30 1 * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Referral qualification — daily at 2:00 AM UTC (T5). Moves due PENDING
  // affiliate conversions to QUALIFIED or CLAWED_BACK. Runs before the 02:30
  // backfill and well before the 06:00 GST reconciliation, and after the 01:30
  // purge so a soft-deleted store's conversion is already gone or clawed back
  // rather than qualifying in the same hour it is being swept.
  await getMaintenanceQueue().add(
    'referral-qualify',
    {},
    {
      repeat: { pattern: '0 2 * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Referral commission accrual — daily at 2:15 AM UTC (T6). Runs AFTER the
  // 02:00 qualification so a row T5 qualifies tonight is already visible to
  // T6's scan (though it cannot earn tonight — a month only earns once it has
  // fully ENDED), and before the 02:30 backfill.
  await getMaintenanceQueue().add(
    'referral-accrue',
    {},
    {
      repeat: { pattern: '15 2 * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Referral commission payout — monthly on the 30th at 02:30 UTC (T7, owner
  // decision 2026-09-23). Deliberately NOT '30 2 * * *' (daily) — the cadence
  // is monthly; settings.payout_cadence MANUAL makes the cron skip anyway.
  // February has no 30th, so February's batch pays on March 30 (the unsettled
  // balance carries — nothing lost, nothing doubled).
  // `limit: 1` KEPT on purpose (RC-062): it caps this job to one run per API
  // boot. Every other cron had it removed because it silently stopped them;
  // payout moves real money, so a true monthly repeat is an owner decision.
  await getMaintenanceQueue().add(
    'referral-payout',
    {},
    {
      repeat: { pattern: '30 2 30 * *', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Engagement aggregation (F-037 Phase 2) — daily at 1:00 AM UTC, before the
  // 01:30 purge sweep, so a retailer purged tonight still has last night's
  // rollup rather than a half-processed one. Summarizes the UTC day that just
  // ended; fully recomputes on every run, so a manual re-trigger is safe.
  await getMaintenanceQueue().add(
    'engagement-aggregate',
    {},
    {
      repeat: { pattern: '0 1 * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // AI-fields backfill daily at 2:30 AM UTC
  await getMaintenanceQueue().add(
    'backfill-missing-ai-fields',
    {},
    {
      repeat: { pattern: '30 2 * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Database backup daily at 3:00 AM UTC
  await getMaintenanceQueue().add(
    'backup-database',
    { type: 'daily' },
    {
      repeat: { pattern: '0 3 * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // R2 image compression pass daily at 4:30 AM UTC
  await getMaintenanceQueue().add(
    'compress-r2-images',
    {},
    {
      repeat: { pattern: '30 4 * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // WhatsApp catalog full-sync daily
  const catalogSyncCron = process.env.CATALOG_SYNC_CRON ?? '0 5 * * *';
  await getMaintenanceQueue().add(
    'catalog-daily-full-sync',
    {},
    {
      repeat: { pattern: catalogSyncCron },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Weekly backup Sunday at 4:00 AM UTC
  await getMaintenanceQueue().add(
    'backup-database',
    { type: 'weekly' },
    {
      repeat: { pattern: '0 4 * * 0' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Embedding backfill — weekly Sunday at 7:00 AM UTC
  await getMaintenanceQueue().add(
    'embedding-backfill',
    {},
    {
      repeat: { pattern: '0 7 * * 0' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // F-045 colour-family backfill — weekly Sunday at 7:30 AM UTC. Catches products
  // created by import / manual add (no tagger run) and any tag-time lookup miss.
  // No `limit` (RC-062: it is the TOTAL repeat count). Idempotent; fills NULL rows only.
  await getMaintenanceQueue().add(
    'color-family-backfill',
    {},
    {
      repeat: { pattern: '30 7 * * 0' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // GST invoice reconciliation — daily at 6:00 AM UTC. Re-enqueues any
  // successful payment still missing its PDF (charged before the platform
  // GST profile was set, or retries exhausted).
  await getMaintenanceQueue().add(
    'backfill-gst-invoices',
    {},
    {
      repeat: { pattern: '0 6 * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Try-on deletion sweep — hourly at :15. The withdrawal deletes inline, so
  // this is only the retry for a delete that failed while the person's
  // withdrawal was being recorded, plus the result a generation wrote after its
  // consent was withdrawn. Hourly because each pass is a bounded query over a
  // small table, and an unmet deletion promise is worth retrying sooner than
  // daily.
  await getMaintenanceQueue().add(
    'tryon-deletion-sweep',
    {},
    {
      repeat: { pattern: '15 * * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // F-043 scheduler publish tick — every 5 min. No `limit` (that caps total
  // repeats): this one must keep firing. Rows are claimed by CAS, so an
  // overlapping or duplicate tick cannot double-post.
  await getMaintenanceQueue().add(
    'schedule-publish-tick',
    {},
    {
      repeat: { pattern: '*/5 * * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // RC-078 plan lapse — hourly at :00. Expired trials and lapsed subscriptions
  // drop to STARTER. No `limit` (RC-062); idempotent, re-checks in the write.
  await getMaintenanceQueue().add(
    'plan-lapse',
    {},
    {
      repeat: { pattern: '0 * * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // AI spend alert — hourly at :30. Sentry warning when 24 h credits pass the
  // ₹15,000/day-equivalent threshold. No `limit` (RC-062); alert only.
  await getMaintenanceQueue().add(
    'ai-spend-alert',
    {},
    {
      repeat: { pattern: '30 * * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // F-043 token health — daily 01:45 UTC: pauses plans whose Meta connection died.
  await getMaintenanceQueue().add(
    'schedule-token-health',
    {},
    {
      repeat: { pattern: '45 1 * * *' },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  taggingWorker.on('failed', (job, err) => {
    console.error(`[jobs] tag-product failed ${job?.id}:`, err.message);
  });

  embeddingWorker.on('failed', (job, err) => {
    console.error(`[jobs] generate-embedding failed ${job?.id}:`, err.message);
  });

  studioShootWorker.on('failed', (job, err) => {
    console.error(`[jobs] studio-shoot failed ${job?.id}:`, err.message);
  });

  tryOnWorker.on('failed', (job, err) => {
    console.error(`[jobs] try-on failed ${job?.id}:`, err.message);
  });

  myStyleAnalyzeWorker.on('failed', (job, err) => {
    console.error(`[jobs] my-style-analyze failed ${job?.id}:`, err.message);
  });

  pushWorker.on('failed', (job, err) => {
    console.error(`[jobs] push (${job?.name}) failed ${job?.id}:`, err.message);
  });

  catalogSyncWorker.on('failed', (job, err) => {
    console.error(`[jobs] catalog-sync failed ${job?.id}:`, err.message);
  });

  maintenanceWorker.on('failed', (job, err) => {
    console.error(`[jobs] maintenance (${job?.name}) failed ${job?.id}:`, err.message);
  });
}
