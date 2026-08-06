import { QUEUES } from '@kanchuki/shared';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { handleBackupDatabase } from './backup-database.js';
import { handleBackfillMissingAiFields } from './backfill-missing-ai-fields.js';
import { handleCompressR2Images } from './compress-r2-images.js';
import { handleCleanupTrainingData } from './cleanup-training-data.js';
import { handleExpirePendingOrders } from './expire-pending-orders.js';
import { handleExtractMeasurement } from './extract-measurement.js';
import type { MeasurementJobData } from './extract-measurement.js';
import { handleExtractSpinFrames } from './extract-spin-frames.js';
import type { SpinFrameJobData } from './extract-spin-frames.js';
import { handleGenerateEmbedding } from './generate-embedding.js';
// handleGhostMannequin, handleProcessTryOn, handleUpdateFashionDNA: paused, see startWorkers() below.
// Re-enable: uncomment these 3 imports + the matching Worker block.
// import { handleGhostMannequin } from './ghost-mannequin.js';
import type { GhostMannequinJobData } from './ghost-mannequin.js';
// import { handleProcessTryOn } from './process-tryon.js';
import type { TryOnJobData } from './process-tryon.js';
import { handlePurgeSoftDeleted } from './purge-soft-deleted.js';
import { handleTagProduct } from './tag-product.js';
// import { handleUpdateFashionDNA } from './update-fashion-dna.js';
import type { FashionDNAJobData } from './update-fashion-dna.js';

// ─── Redis Connection ──────────────────────────────────────────────

let connection: Redis | null = null;

export function getRedis(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // required by BullMQ
    });
    // Eviction policy (noeviction) is set on the Redis provider directly —
    // managed plans reject CONFIG SET from the client.
  }
  return connection;
}

// ─── Queues ───────────────────────────────────────────────────────

let taggingQueue: Queue | null = null;
let embeddingQueue: Queue | null = null;
let measurementQueue: Queue | null = null;
let tryOnQueue: Queue | null = null;
let fashionDNAQueue: Queue | null = null;
let spinFrameQueue: Queue | null = null;
let ghostMannequinQueue: Queue | null = null;
let maintenanceQueue: Queue | null = null;

function getTaggingQueue(): Queue {
  taggingQueue ??= new Queue(QUEUES.AI_TAGGING, { connection: getRedis() });
  return taggingQueue;
}

function getEmbeddingQueue(): Queue {
  embeddingQueue ??= new Queue(QUEUES.EMBEDDINGS, { connection: getRedis() });
  return embeddingQueue;
}

function getMeasurementQueue(): Queue {
  measurementQueue ??= new Queue(QUEUES.MEASUREMENT_EXTRACTION, { connection: getRedis() });
  return measurementQueue;
}

function getTryOnQueue(): Queue {
  tryOnQueue ??= new Queue(QUEUES.TRY_ON, { connection: getRedis() });
  return tryOnQueue;
}

function getFashionDNAQueue(): Queue {
  fashionDNAQueue ??= new Queue(QUEUES.FASHION_DNA, { connection: getRedis() });
  return fashionDNAQueue;
}

function getSpinFrameQueue(): Queue {
  spinFrameQueue ??= new Queue(QUEUES.SPIN_FRAME_EXTRACTION, { connection: getRedis() });
  return spinFrameQueue;
}

function getGhostMannequinQueue(): Queue {
  ghostMannequinQueue ??= new Queue(QUEUES.GHOST_MANNEQUIN, { connection: getRedis() });
  return ghostMannequinQueue;
}

// Shared by cleanup / order-expiry / purge / backup — all cron-only, low-volume.
// One queue + one Worker dispatching on job.name beats 4 Workers each holding
// their own duplicated Redis connection.
function getMaintenanceQueue(): Queue {
  maintenanceQueue ??= new Queue(QUEUES.MAINTENANCE, { connection: getRedis() });
  return maintenanceQueue;
}

// ─── Job Producers ────────────────────────────────────────────────

export async function addFashionDNAJob(data: FashionDNAJobData): Promise<void> {
  await getFashionDNAQueue().add('update-fashion-dna', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 100 },
  });
}

export interface TaggingJobData {
  product_id: string;
  retailer_id: string;
  photo_url: string;
  r2_key: string;
  auto_cleanup?: boolean; // crop + white-background cleanup; retailer-toggleable, default true
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

export async function addMeasurementJob(data: MeasurementJobData): Promise<void> {
  await getMeasurementQueue().add('extract-measurement', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });
}

export async function addTryOnJob(data: TryOnJobData): Promise<void> {
  await getTryOnQueue().add('process-tryon', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 20 },
  });
}

export async function addSpinFrameJob(data: SpinFrameJobData): Promise<void> {
  await getSpinFrameQueue().add('extract-spin-frames', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });
}

export async function addGhostMannequinJob(data: GhostMannequinJobData): Promise<void> {
  await getGhostMannequinQueue().add('ghost-mannequin', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 10_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 20 },
  });
}

// ─── Workers ─────────────────────────────────────────────────────

export async function startWorkers(): Promise<void> {
  const redis = getRedis();

  // AI tagging worker (concurrency 3 — respect Claude rate limits)
  const taggingWorker = new Worker(
    QUEUES.AI_TAGGING,
    async (job) => {
      const data = job.data as TaggingJobData;
      await handleTagProduct(data);
    },
    { connection: redis, concurrency: 3 },
  );

  // Embedding worker (concurrency 5 — OpenAI has generous limits)
  const embeddingWorker = new Worker(
    QUEUES.EMBEDDINGS,
    async (job) => {
      const data = job.data as EmbeddingJobData;
      await handleGenerateEmbedding(data);
    },
    { connection: redis, concurrency: 5 },
  );

  // Measurement extraction worker (concurrency 2 — MediaPipe Pose is CPU-bound)
  const measurementWorker = new Worker(
    QUEUES.MEASUREMENT_EXTRACTION,
    async (job) => {
      const data = job.data as MeasurementJobData;
      await handleExtractMeasurement(data);
    },
    { connection: redis, concurrency: 2 },
  );

  // Try-on, Fashion DNA, Ghost-mannequin workers: PAUSED (not needed yet).
  // Jobs still queue via addTryOnJob/addFashionDNAJob/addGhostMannequinJob (routes
  // untouched) but sit unprocessed until re-enabled. To re-enable: uncomment the
  // 3 handler imports above and the Worker block below.
  // const tryOnWorker = new Worker(
  //   QUEUES.TRY_ON,
  //   async (job) => {
  //     const data = job.data as TryOnJobData;
  //     await handleProcessTryOn(data);
  //   },
  //   { connection: redis, concurrency: 2 },
  // );
  //
  // const fashionDNAWorker = new Worker(
  //   QUEUES.FASHION_DNA,
  //   async (job) => {
  //     const data = job.data as FashionDNAJobData;
  //     await handleUpdateFashionDNA(data);
  //   },
  //   { connection: redis, concurrency: 2 },
  // );
  //
  // const ghostMannequinWorker = new Worker(
  //   QUEUES.GHOST_MANNEQUIN,
  //   async (job) => {
  //     const data = job.data as GhostMannequinJobData;
  //     await handleGhostMannequin(data);
  //   },
  //   { connection: redis, concurrency: 2 },
  // );

  // Spin-frame extraction worker (concurrency 1 — ffmpeg is CPU/IO bound)
  const spinFrameWorker = new Worker(
    QUEUES.SPIN_FRAME_EXTRACTION,
    async (job) => {
      const data = job.data as SpinFrameJobData;
      await handleExtractSpinFrames(data);
    },
    { connection: redis, concurrency: 1 },
  );

  // Maintenance worker — cleanup / order-expiry / purge / backup, all cron-only
  // and low-volume. One Worker dispatching on job.name instead of 4 separate
  // Workers, each of which would hold its own duplicated Redis connection.
  const maintenanceWorker = new Worker(
    QUEUES.MAINTENANCE,
    async (job) => {
      switch (job.name) {
        case 'cleanup-training-data':
          return handleCleanupTrainingData();
        case 'backfill-missing-ai-fields':
          return handleBackfillMissingAiFields();
        case 'expire-pending-orders':
          return handleExpirePendingOrders();
        case 'purge-soft-deleted':
          return handlePurgeSoftDeleted();
        case 'backup-database': {
          const data = (job.data ?? {}) as { type?: 'daily' | 'weekly' | 'manual' };
          return handleBackupDatabase(data.type ?? 'daily');
        }
        case 'compress-r2-images':
          return handleCompressR2Images();
        default:
          throw new Error(`[jobs] unknown maintenance job: ${job.name}`);
      }
    },
    { connection: redis, concurrency: 1 },
  );

  // Schedules below are idempotent — BullMQ deduplicates by job name + repeat
  // key, so multiple restarts don't create duplicate schedules.

  // Purge soft-deleted records daily at 1:30 AM UTC (before cleanup at 2:00 AM)
  await getMaintenanceQueue().add(
    'purge-soft-deleted',
    {},
    {
      repeat: { pattern: '30 1 * * *', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Cleanup training data daily at 2:00 AM UTC
  await getMaintenanceQueue().add(
    'cleanup-training-data',
    {},
    {
      repeat: { pattern: '0 2 * * *', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // AI-fields backfill (2026-08-04): re-queue tag jobs for products tagged
  // before migration 043 so name/subtype/SKU/description backfill themselves.
  // Runs 30 min after cleanup; each run is capped (250 jobs) and idempotent,
  // so repeated daily runs drain the backlog without flooding the AI queue.
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

  // R2 image compression pass daily at 4:30 AM UTC (after the backups at
  // 3:00/4:00 AM). Re-compresses any image that landed in the bucket over
  // 80KB since the last pass — bulk imports and legacy objects that bypass
  // the client/server compression paths. In-place overwrite, URLs unchanged.
  await getMaintenanceQueue().add(
    'compress-r2-images',
    {},
    {
      repeat: { pattern: '30 4 * * *', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Weekly backup Sunday at 4:00 AM UTC (staggered 1h after daily)
  await getMaintenanceQueue().add(
    'backup-database',
    { type: 'weekly' },
    {
      repeat: { pattern: '0 4 * * 0', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Pending-order expiry every 5 minutes
  await getMaintenanceQueue().add(
    'expire-pending-orders',
    {},
    {
      repeat: { pattern: '*/5 * * * *', limit: 1 },
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

  measurementWorker.on('failed', (job, err) => {
    console.error(`[jobs] extract-measurement failed ${job?.id}:`, err.message);
  });

  spinFrameWorker.on('failed', (job, err) => {
    console.error(`[jobs] extract-spin-frames failed ${job?.id}:`, err.message);
  });

  maintenanceWorker.on('failed', (job, err) => {
    console.error(`[jobs] maintenance (${job?.name}) failed ${job?.id}:`, err.message);
  });
}
