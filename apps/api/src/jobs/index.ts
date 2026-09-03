import { QUEUES } from '@kanchuki/shared';
import { Worker } from 'bullmq';
import { STUDIO_SHOOT_CONCURRENCY } from '../lib/studio-shoot.js';
import { handleBackfillMissingAiFields } from './backfill-missing-ai-fields.js';
import { handleBackupDatabase } from './backup-database.js';
import { handleCatalogSync, handleDailyCatalogSync } from './catalog-sync.js';
import type { CatalogSyncJobData } from './catalog-sync.js';
import { handleCompressR2Images } from './compress-r2-images.js';
import { handleEmbeddingBackfill } from './embedding-backfill.js';
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
import { handlePurgeSoftDeleted } from './purge-soft-deleted.js';
import {
  getCatalogSyncQueue,
  getEmbeddingQueue,
  getMaintenanceQueue,
  getRedis,
  getStudioShootQueue,
  getTaggingQueue,
} from './queue.js';
import { handleStudioShoot } from './studio-shoot.js';
import type { StudioShootJobData } from './studio-shoot.js';
import { handleTagProduct } from './tag-product.js';

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
        case 'purge-soft-deleted':
          return handlePurgeSoftDeleted();
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
        case 'generate-gst-invoice': {
          const data = job.data as GenerateGstInvoiceJobData;
          return handleGenerateGstInvoice(data);
        }
        case 'backfill-gst-invoices':
          return handleBackfillGstInvoices(addGenerateGstInvoiceJob);
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
      repeat: { pattern: '30 1 * * *', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // AI-fields backfill daily at 2:30 AM UTC
  await getMaintenanceQueue().add(
    'backfill-missing-ai-fields',
    {},
    {
      repeat: { pattern: '30 2 * * *', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Database backup daily at 3:00 AM UTC
  await getMaintenanceQueue().add(
    'backup-database',
    { type: 'daily' },
    {
      repeat: { pattern: '0 3 * * *', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // R2 image compression pass daily at 4:30 AM UTC
  await getMaintenanceQueue().add(
    'compress-r2-images',
    {},
    {
      repeat: { pattern: '30 4 * * *', limit: 1 },
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
      repeat: { pattern: catalogSyncCron, limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Weekly backup Sunday at 4:00 AM UTC
  await getMaintenanceQueue().add(
    'backup-database',
    { type: 'weekly' },
    {
      repeat: { pattern: '0 4 * * 0', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Embedding backfill — weekly Sunday at 7:00 AM UTC
  await getMaintenanceQueue().add(
    'embedding-backfill',
    {},
    {
      repeat: { pattern: '0 7 * * 0', limit: 1 },
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
      repeat: { pattern: '0 6 * * *', limit: 1 },
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

  catalogSyncWorker.on('failed', (job, err) => {
    console.error(`[jobs] catalog-sync failed ${job?.id}:`, err.message);
  });

  maintenanceWorker.on('failed', (job, err) => {
    console.error(`[jobs] maintenance (${job?.name}) failed ${job?.id}:`, err.message);
  });
}
