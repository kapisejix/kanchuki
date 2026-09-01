// ─── Shared BullMQ infra ──────────────────────────────────────────
// One Redis connection + one Queue object per queue name for the whole
// API process. Every job producer imports its queue from here so we never
// open a second connection or a divergent Queue config (see the GST
// invoice producer, which used to spin up its own).

import { QUEUES } from '@kanchuki/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

let connection: Redis | null = null;

export function getRedis(): Redis {
  if (!connection) {
    connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null, // required by BullMQ
    });
  }
  return connection;
}

let taggingQueue: Queue | null = null;
let embeddingQueue: Queue | null = null;
let studioShootQueue: Queue | null = null;
let catalogSyncQueue: Queue | null = null;
let maintenanceQueue: Queue | null = null;

export function getTaggingQueue(): Queue {
  taggingQueue ??= new Queue(QUEUES.AI_TAGGING, { connection: getRedis() });
  return taggingQueue;
}

export function getEmbeddingQueue(): Queue {
  embeddingQueue ??= new Queue(QUEUES.EMBEDDINGS, { connection: getRedis() });
  return embeddingQueue;
}

export function getStudioShootQueue(): Queue {
  studioShootQueue ??= new Queue(QUEUES.STUDIO_SHOOT, { connection: getRedis() });
  return studioShootQueue;
}

export function getCatalogSyncQueue(): Queue {
  catalogSyncQueue ??= new Queue(QUEUES.CATALOG_SYNC, { connection: getRedis() });
  return catalogSyncQueue;
}

export function getMaintenanceQueue(): Queue {
  maintenanceQueue ??= new Queue(QUEUES.MAINTENANCE, { connection: getRedis() });
  return maintenanceQueue;
}
