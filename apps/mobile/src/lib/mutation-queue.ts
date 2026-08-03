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

import { Paths, File, Directory } from 'expo-file-system'

function queueDirUri(): string {
  return `${Paths.document.uri}kanchuki-cache/`
}

function queueFileUri(): string {
  return `${queueDirUri()}mutation-queue.json`
}

export interface PendingStatusMutation {
  id: string
  productId: string
  status: string
  queuedAt: number
}


function queueFile(): File {
  const dir = new Directory(queueDirUri())
  if (!dir.exists) {
    dir.create({
      intermediates: true,
      idempotent: true,
    })
  }
  return new File(queueFileUri())
}

export async function getQueue(): Promise<PendingStatusMutation[]> {
  try {
    const file = queueFile()
    if (!file.exists) return []
    const content = await file.text()
    return JSON.parse(content) as PendingStatusMutation[]
  } catch {
    return []
  }
}

async function writeQueue(queue: PendingStatusMutation[]): Promise<void> {
  try {
    const file = queueFile()
    if (!file.exists) {
      file.create({
        intermediates: true,
        overwrite: true,
      })
    }
    file.write(JSON.stringify(queue))
  } catch (err) {
    console.warn(
      '[mutation-queue] Failed to persist:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

/**
 * Queue a product status change for replay once back online.
 *
 * NOTE: the read-modify-write (getQueue → push → writeQueue) is not
 * atomic — two near-simultaneous enqueues could drop one entry. This is
 * acceptable for a low-frequency offline queue that useSyncQueue() drains
 * one mutation at a time.
 */
export async function enqueueStatusMutation(productId: string, status: string): Promise<void> {
  const queue = await getQueue()
  queue.push({ id: `${productId}-${Date.now()}`, productId, status, queuedAt: Date.now() })
  await writeQueue(queue)
}

export async function dequeueStatusMutation(id: string): Promise<void> {
  const queue = await getQueue()
  await writeQueue(queue.filter((m) => m.id !== id))
}
