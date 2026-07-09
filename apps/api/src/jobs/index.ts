import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { QUEUES } from '@kanchuki/shared'
import { handleTagProduct } from './tag-product.js'
import { handleGenerateEmbedding } from './generate-embedding.js'
import { handleExtractMeasurement } from './extract-measurement.js'
import { handleProcessTryOn } from './process-tryon.js'
import type { MeasurementJobData } from './extract-measurement.js'
import type { TryOnJobData } from './process-tryon.js'

// ─── Redis Connection ──────────────────────────────────────────────

let connection: Redis | null = null

function getRedis(): Redis {
  if (!connection) {
    connection = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // required by BullMQ
    })
    // BullMQ jobs must never be evicted under memory pressure — volatile-lru/allkeys-lru
    // can silently drop queued jobs. Enforce noeviction on connect.
    connection.config('SET', 'maxmemory-policy', 'noeviction').catch((err) => {
      console.warn('[jobs] could not enforce noeviction policy on Redis:', (err as Error).message)
    })
  }
  return connection
}

// ─── Queues ───────────────────────────────────────────────────────

let taggingQueue: Queue | null = null
let embeddingQueue: Queue | null = null
let measurementQueue: Queue | null = null
let tryOnQueue: Queue | null = null

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

// ─── Job Producers ────────────────────────────────────────────────

export interface TaggingJobData {
  product_id: string
  retailer_id: string
  photo_url: string
  r2_key: string
  back_photo_url?: string
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

  console.log('[jobs] Workers started: ai-tagging, embeddings, measurement-extraction, try-on')
}
