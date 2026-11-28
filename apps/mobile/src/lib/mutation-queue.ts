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

import { Directory, File, Paths } from 'expo-file-system';
import { ApiError } from './api/api-error';

/**
 * Only failures that can succeed later belong in the queue: network (status 0),
 * timeout (408), 429 and 5xx. Any other 4xx never will, so replaying it loops forever.
 */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
}

function queueDirUri(): string {
  return `${Paths.document.uri}kanchuki-cache/`;
}

function queueFileUri(): string {
  return `${queueDirUri()}mutation-queue.json`;
}

export interface PendingStatusMutation {
  id: string;
  productId: string;
  status: string;
  queuedAt: number;
}

/** F-047: a bill confirmed offline, replayed with the same bill id (the server dedupes on it). */
export interface PendingSellMutation {
  /** The bill id: one entry per bill. */
  id: string;
  lines: { product_id: string; size: string; quantity: number }[];
  /** product_id -> name, so a replay failure can name the article. */
  names: Record<string, string>;
  queuedAt: number;
}

// Sells live in their own file so the status queue's shape and readers stay untouched.
function sellQueueFileUri(): string {
  return `${queueDirUri()}sell-queue.json`;
}

function fileAt(uri: string): File {
  const dir = new Directory(queueDirUri());
  if (!dir.exists) {
    dir.create({
      intermediates: true,
      idempotent: true,
    });
  }
  return new File(uri);
}

async function readList<T>(uri: string): Promise<T[]> {
  try {
    const file = fileAt(uri);
    if (!file.exists) return [];
    const content = await file.text();
    return JSON.parse(content) as T[];
  } catch {
    return [];
  }
}

/** Returns false when the write failed, so a caller never claims something was saved. */
async function writeList<T>(uri: string, list: T[]): Promise<boolean> {
  try {
    const file = fileAt(uri);
    if (!file.exists) {
      file.create({
        intermediates: true,
        overwrite: true,
      });
    }
    file.writeSync(JSON.stringify(list));
    return true;
  } catch (err) {
    console.warn(
      '[mutation-queue] Failed to persist:',
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}

export const getQueue = () => readList<PendingStatusMutation>(queueFileUri());
const writeQueue = (queue: PendingStatusMutation[]) => writeList(queueFileUri(), queue);

/**
 * Strict read for bills: [] when the file is missing, null when it exists but cannot be read as a
 * list. Callers that write must never treat null as empty, or one bad read erases every queued bill.
 */
async function readSellList(): Promise<PendingSellMutation[] | null> {
  try {
    const file = fileAt(sellQueueFileUri());
    if (!file.exists) return [];
    const parsed: unknown = JSON.parse(await file.text());
    if (Array.isArray(parsed)) return parsed as PendingSellMutation[];
    console.warn('[mutation-queue] sell queue file is not a list; leaving it untouched');
  } catch (err) {
    console.warn(
      '[mutation-queue] cannot read sell queue:',
      err instanceof Error ? err.message : String(err),
    );
  }
  return null;
}

// Enqueue (screen) and dequeue (replay) both read-modify-write the whole file: run them one at a time.
let sellQueueChain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = sellQueueChain.then(fn, fn);
  sellQueueChain = run.catch(() => undefined);
  return run;
}

export async function getSellQueue(): Promise<PendingSellMutation[]> {
  return (await readSellList()) ?? [];
}

/** Queue a bill for replay. Resolves false if it could not be persisted. */
export function enqueueSellMutation(
  billId: string,
  lines: PendingSellMutation['lines'],
  names: Record<string, string>,
): Promise<boolean> {
  return serial(async () => {
    const queue = await readSellList();
    if (queue === null) return false;
    if (queue.some((m) => m.id === billId)) return true;
    queue.push({ id: billId, lines, names, queuedAt: Date.now() });
    return writeList(sellQueueFileUri(), queue);
  });
}

export function dequeueSellMutation(billId: string): Promise<void> {
  return serial(async () => {
    const queue = await readSellList();
    if (queue === null) return;
    await writeList(
      sellQueueFileUri(),
      queue.filter((m) => m.id !== billId),
    );
  });
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
  const queue = await getQueue();
  queue.push({ id: `${productId}-${Date.now()}`, productId, status, queuedAt: Date.now() });
  await writeQueue(queue);
}

/** Delete the whole queue file (sign-out: it must not replay under the next account's token). */
export async function clearQueue(): Promise<void> {
  for (const uri of [queueFileUri(), sellQueueFileUri()]) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch (err) {
      // Best-effort, but a surviving queue would replay under the next account: leave a trace.
      console.warn(
        '[mutation-queue] clearQueue failed:',
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

export async function dequeueStatusMutation(id: string): Promise<void> {
  const queue = await getQueue();
  await writeQueue(queue.filter((m) => m.id !== id));
}
