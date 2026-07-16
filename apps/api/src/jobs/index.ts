import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { QUEUES } from '@kanchuki/shared'
import { handleTagProduct } from './tag-product.js'
import { handleGenerateEmbedding } from './generate-embedding.js'
import { handleExtractMeasurement } from './extract-measurement.js'
import { handleProcessTryOn } from './process-tryon.js'
import { handleCleanupTrainingData } from './cleanup-training-data.js'
import { handleUpdateFashionDNA } from './update-fashion-dna.js'
import type { MeasurementJobData } from './extract-measurement.js'
import type { TryOnJobData } from './process-tryon.js'
import type { FashionDNAJobData } from './update-fashion-dna.js'

// ─── Redis Connection ──────────────────────────────────────────────

let connection: Redis | null = null

function getRedis(): Redis {
  if (!connection) {
    connection = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // required by BullMQ
    })
    // Eviction policy (noeviction) is set on the Redis provider directly —
    // managed plans reject CONFIG SET from the client.
  }
  return connection
}

// ─── Queues ───────────────────────────────────────────────────────

let taggingQueue: Queue | null = null
let embeddingQueue: Queue | null = null
let measurementQueue: Queue | null = null
let tryOnQueue: Queue | null = null
let cleanupQueue: Queue | null = null
let fashionDNAQueue: Queue | null = null

function getTaggingQueue(): Queue {
  taggingQueue ??= new Queue(QUEUES.AI_TAGGING, { connection: getRedis() })
  return taggingQueue
}

function getEmbeddingQueue(): Queue {
  embeddingQueue ??= new Queue(QUEUES.EMBEDDINGS, { connection: getRedis() })
  return embeddingQueue
}

function getMeasurementQueue(): Queue {
  measurementQueue ??= new Queue(QUEUES.MEASUREMENT_EXTRACTION, { connection: getRedis() })
  return measurementQueue
}

function getTryOnQueue(): Queue {
  tryOnQueue ??= new Queue(QUEUES.TRY_ON, { connection: getRedis() })
  return tryOnQueue
}

function getCleanupQueue(): Queue {
  cleanupQueue ??= new Queue(QUEUES.CLEANUP, { connection: getRedis() })
  return cleanupQueue
}

function getFashionDNAQueue(): Queue {
  fashionDNAQueue ??= new Queue(QUEUES.FASHION_DNA, { connection: getRedis() })
  return fashionDNAQueue
}

// ─── Job Producers ────────────────────────────────────────────────

export async function addFashionDNAJob(data: FashionDNAJobData): Promise<void> {
  await getFashionDNAQueue().add('update-fashion-dna', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 100 },
  })
}

export interface TaggingJobData {
  product_id: string
  retailer_id: string
  photo_url: string
  r2_key: string
  back_photo_url?: string
  auto_cleanup?: boolean // crop + white-background cleanup; retailer-toggleable, default true
}

export interface EmbeddingJobData {
  product_id: string
  retailer_id: string
}

export async function addTaggingJob(data: TaggingJobData): Promise<void> {
  await getTaggingQueue().add('tag-product', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  })
}

export async function addEmbeddingJob(data: EmbeddingJobData): Promise<void> {
  await getEmbeddingQueue().add('generate-embedding', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 50 },
  })
}

export async function addMeasurementJob(data: MeasurementJobData): Promise<void> {
  await getMeasurementQueue().add('extract-measurement', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  })
}

export async function addTryOnJob(data: TryOnJobData): Promise<void> {
  await getTryOnQueue().add('process-tryon', data, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 20 },
  })
}

// ─── Workers ─────────────────────────────────────────────────────

export async function startWorkers(): Promise<void> {
  const redis = getRedis()

  // AI tagging worker (concurrency 3 — respect Claude rate limits)
  const taggingWorker = new Worker(
    QUEUES.AI_TAGGING,
    async (job) => {
      const data = job.data as TaggingJobData
      await handleTagProduct(data)
    },
    { connection: redis, concurrency: 3 },
  )

  // Embedding worker (concurrency 5 — OpenAI has generous limits)
  const embeddingWorker = new Worker(
    QUEUES.EMBEDDINGS,
    async (job) => {
      const data = job.data as EmbeddingJobData
      await handleGenerateEmbedding(data)
    },
    { connection: redis, concurrency: 5 },
  )

  // Measurement extraction worker (concurrency 2 — MediaPipe Pose is CPU-bound)
  const measurementWorker = new Worker(
    QUEUES.MEASUREMENT_EXTRACTION,
    async (job) => {
      const data = job.data as MeasurementJobData
      await handleExtractMeasurement(data)
    },
    { connection: redis, concurrency: 2 },
  )

  // Virtual try-on worker (concurrency 2 — CatVTON GPU constraints)
  const tryOnWorker = new Worker(
    QUEUES.TRY_ON,
    async (job) => {
      const data = job.data as TryOnJobData
      await handleProcessTryOn(data)
    },
    { connection: redis, concurrency: 2 },
  )

  // Fashion DNA worker (concurrency 2 — OpenAI embedding calls are the bottleneck)
  const fashionDNAWorker = new Worker(
    QUEUES.FASHION_DNA,
    async (job) => {
      const data = job.data as FashionDNAJobData
      await handleUpdateFashionDNA(data)
    },
    { connection: redis, concurrency: 2 },
  )

  // Training-data cleanup worker (concurrency 1 — lightweight, runs daily)
  const cleanupWorker = new Worker(
    QUEUES.CLEANUP,
    async () => {
      await handleCleanupTrainingData()
    },
    { connection: redis, concurrency: 1 },
  )

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
  )

  taggingWorker.on('failed', (job, err) => {
    console.error(`[jobs] tag-product failed ${job?.id}:`, err.message)
  })

  embeddingWorker.on('failed', (job, err) => {
    console.error(`[jobs] generate-embedding failed ${job?.id}:`, err.message)
  })

  measurementWorker.on('failed', (job, err) => {
    console.error(`[jobs] extract-measurement failed ${job?.id}:`, err.message)
  })

  tryOnWorker.on('failed', (job, err) => {
    console.error(`[jobs] process-tryon failed ${job?.id}:`, err.message)
  })

  fashionDNAWorker.on('failed', (job, err) => {
    console.error(`[jobs] update-fashion-dna failed ${job?.id}:`, err.message)
  })

  cleanupWorker.on('failed', (job, err) => {
    console.error(`[jobs] cleanup-training-data failed ${job?.id}:`, err.message)
  })

  console.log('[jobs] Workers started: ai-tagging, embeddings, measurement-extraction, try-on, fashion-dna, cleanup-training-data')
}
