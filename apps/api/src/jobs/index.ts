import { QUEUES } from '@kanchuki/shared';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { handleBackupDatabase } from './backup-database.js';
import { handleCleanupTrainingData } from './cleanup-training-data.js';
import { handleExpirePendingOrders } from './expire-pending-orders.js';
import { handleExtractMeasurement } from './extract-measurement.js';
import type { MeasurementJobData } from './extract-measurement.js';
import { handleExtractSpinFrames } from './extract-spin-frames.js';
import type { SpinFrameJobData } from './extract-spin-frames.js';
import { handleGenerateEmbedding } from './generate-embedding.js';
import { handleGhostMannequin } from './ghost-mannequin.js';
import type { GhostMannequinJobData } from './ghost-mannequin.js';
import { handleProcessTryOn } from './process-tryon.js';
import type { TryOnJobData } from './process-tryon.js';
import { handleTagProduct } from './tag-product.js';
import { handleUpdateFashionDNA } from './update-fashion-dna.js';
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
let cleanupQueue: Queue | null = null;
let orderExpiryQueue: Queue | null = null;
let fashionDNAQueue: Queue | null = null;
let spinFrameQueue: Queue | null = null;
let backupQueue: Queue | null = null;
let ghostMannequinQueue: Queue | null = null;

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

function getCleanupQueue(): Queue {
  cleanupQueue ??= new Queue(QUEUES.CLEANUP, { connection: getRedis() });
  return cleanupQueue;
}

function getOrderExpiryQueue(): Queue {
  orderExpiryQueue ??= new Queue(QUEUES.ORDER_EXPIRY, { connection: getRedis() });
  return orderExpiryQueue;
}

function getFashionDNAQueue(): Queue {
  fashionDNAQueue ??= new Queue(QUEUES.FASHION_DNA, { connection: getRedis() });
  return fashionDNAQueue;
}

function getSpinFrameQueue(): Queue {
  spinFrameQueue ??= new Queue(QUEUES.SPIN_FRAME_EXTRACTION, { connection: getRedis() });
  return spinFrameQueue;
}

function getBackupQueue(): Queue {
  backupQueue ??= new Queue(QUEUES.DATABASE_BACKUP, { connection: getRedis() });
  return backupQueue;
}

function getGhostMannequinQueue(): Queue {
  ghostMannequinQueue ??= new Queue(QUEUES.GHOST_MANNEQUIN, { connection: getRedis() });
  return ghostMannequinQueue;
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

  // Virtual try-on worker (concurrency 2)
  const tryOnWorker = new Worker(
    QUEUES.TRY_ON,
    async (job) => {
      const data = job.data as TryOnJobData;
      await handleProcessTryOn(data);
    },
    { connection: redis, concurrency: 2 },
  );

  // Fashion DNA worker (concurrency 2 — OpenAI embedding calls are the bottleneck)
  const fashionDNAWorker = new Worker(
    QUEUES.FASHION_DNA,
    async (job) => {
      const data = job.data as FashionDNAJobData;
      await handleUpdateFashionDNA(data);
    },
    { connection: redis, concurrency: 2 },
  );

  // Spin-frame extraction worker (concurrency 1 — ffmpeg is CPU/IO bound)
  const spinFrameWorker = new Worker(
    QUEUES.SPIN_FRAME_EXTRACTION,
    async (job) => {
      const data = job.data as SpinFrameJobData;
      await handleExtractSpinFrames(data);
    },
    { connection: redis, concurrency: 1 },
  );

  // Training-data cleanup worker (concurrency 1 — lightweight, runs daily)
  const cleanupWorker = new Worker(
    QUEUES.CLEANUP,
    async () => {
      await handleCleanupTrainingData();
    },
    { connection: redis, concurrency: 1 },
  );

  // Pending-order expiry worker (concurrency 1 — lightweight DB query, runs every 5 min)
  const orderExpiryWorker = new Worker(
    QUEUES.ORDER_EXPIRY,
    async () => {
      await handleExpirePendingOrders();
    },
    { connection: redis, concurrency: 1 },
  );

  // Ghost-mannequin worker (concurrency 2 — Snappyit API calls are network-bound)
  const ghostMannequinWorker = new Worker(
    QUEUES.GHOST_MANNEQUIN,
    async (job) => {
      const data = job.data as GhostMannequinJobData;
      await handleGhostMannequin(data);
    },
    { connection: redis, concurrency: 2 },
  );

  // Database backup worker (concurrency 1 — I/O bound, only one backup at a time)
  // The job data may include a `type` field: 'daily' (default) or 'weekly'.
  const backupWorker = new Worker(
    QUEUES.DATABASE_BACKUP,
    async (job) => {
      const data = (job.data ?? {}) as { type?: 'daily' | 'weekly' | 'manual' };
      await handleBackupDatabase(data.type ?? 'daily');
    },
    { connection: redis, concurrency: 1 },
  );

  // Schedule the cleanup to run daily at 2:00 AM UTC (add is idempotent —
  // BullMQ deduplicates by job name + repeat key, so multiple restarts
  // don't create duplicate schedules).
  await getCleanupQueue().add(
    'cleanup-training-data',
    {},
    {
      repeat: { pattern: '0 2 * * *', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Schedule database backup to run daily at 3:00 AM UTC
  await getBackupQueue().add(
    'backup-database-daily',
    { type: 'daily' },
    {
      repeat: { pattern: '0 3 * * *', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Schedule weekly backup to run Sunday at 4:00 AM UTC (staggered 1h after daily)
  await getBackupQueue().add(
    'backup-database-weekly',
    { type: 'weekly' },
    {
      repeat: { pattern: '0 4 * * 0', limit: 1 },
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  );

  // Schedule pending-order expiry every 5 minutes
  await getOrderExpiryQueue().add(
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

  tryOnWorker.on('failed', (job, err) => {
    console.error(`[jobs] process-tryon failed ${job?.id}:`, err.message);
  });

  fashionDNAWorker.on('failed', (job, err) => {
    console.error(`[jobs] update-fashion-dna failed ${job?.id}:`, err.message);
  });

  spinFrameWorker.on('failed', (job, err) => {
    console.error(`[jobs] extract-spin-frames failed ${job?.id}:`, err.message);
  });

  cleanupWorker.on('failed', (job, err) => {
    console.error(`[jobs] cleanup-training-data failed ${job?.id}:`, err.message);
  });

  orderExpiryWorker.on('failed', (job, err) => {
    console.error(`[jobs] expire-pending-orders failed ${job?.id}:`, err.message);
  });

  ghostMannequinWorker.on('failed', (job, err) => {
    console.error(`[jobs] ghost-mannequin failed ${job?.id}:`, err.message);
  });

  backupWorker.on('failed', (job, err) => {
    console.error(`[jobs] backup-database failed ${job?.id}:`, err.message);
  });
}
