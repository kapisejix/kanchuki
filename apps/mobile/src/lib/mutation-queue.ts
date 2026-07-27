/**
 * Offline mutation queue for product status changes (e.g. "Mark Sold").
 *
 * ponytail: reuses the same expo-file-system JSON-file pattern as
 * offline-persister.ts instead of adding react-native-mmkv — no new
 * dependency, no native rebuild. Upgrade to MMKV if write frequency
 * ever becomes a bottleneck (it won't for a handful of queued mutations).
 *
 * When a status update fails while offline, the caller enqueues it here.
 * useSyncQueue() replays the queue once the device reconnects.
 */

import { Paths } from 'expo-file-system'

const QUEUE_DIR_URI = `${Paths.document.uri}kanchuki-cache/`
const QUEUE_FILE_URI = `${QUEUE_DIR_URI}mutation-queue.json`

function getFileClass(): new (...args: unknown[]) => {
  uri: string
  exists: boolean
  create(opts?: Record<string, boolean>): void
  write(content: string): void
  text(): Promise<string>
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-file-system') as { File: never }
  return mod.File
}

function getDirectoryClass(): new (...args: unknown[]) => {
  uri: string
  exists: boolean
  create(opts?: Record<string, boolean>): void
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-file-system') as { Directory: never }
  return mod.Directory
}

export interface PendingStatusMutation {
  id: string
  productId: string
  status: string
  queuedAt: number
}


function queueFile(): any {
  const DirClass = getDirectoryClass()
  const dir = new DirClass(QUEUE_DIR_URI)
  if (!(dir as { exists: boolean }).exists) {
    ;(dir as { create: (opts: Record<string, boolean>) => void }).create({
      intermediates: true,
      idempotent: true,
    })
  }
  const FileClass = getFileClass()
  return new FileClass(QUEUE_FILE_URI)
}

export async function getQueue(): Promise<PendingStatusMutation[]> {
  try {
    const file = queueFile()
    if (!(file as { exists: boolean }).exists) return []
    const content = await (file as { text: () => Promise<string> }).text()
    return JSON.parse(content) as PendingStatusMutation[]
  } catch {
    return []
  }
}

async function writeQueue(queue: PendingStatusMutation[]): Promise<void> {
  try {
    const file = queueFile()
    if (!(file as { exists: boolean }).exists) {
      ;(file as { create: (opts: Record<string, boolean>) => void }).create({
        intermediates: true,
        overwrite: true,
      })
    }
    ;(file as { write: (c: string) => void }).write(JSON.stringify(queue))
  } catch (err) {
    console.warn(
      '[mutation-queue] Failed to persist:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

/** Queue a product status change for replay once back online. */
export async function enqueueStatusMutation(productId: string, status: string): Promise<void> {
  const queue = await getQueue()
  queue.push({ id: `${productId}-${Date.now()}`, productId, status, queuedAt: Date.now() })
  await writeQueue(queue)
}

export async function dequeueStatusMutation(id: string): Promise<void> {
  const queue = await getQueue()
  await writeQueue(queue.filter((m) => m.id !== id))
}
