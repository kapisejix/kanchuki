/**
 * In-store try-on session orchestrator (F-044 R2 T3). Plain async module — no
 * React — so it is testable like mutation-queue.ts.
 *
 * Privacy: items carry product id/name only (never customer phone/name) and no
 * photo URI is ever logged.
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { billingApi } from './api/billing';
import { productApi } from './api/products';
import { compressImageForUpload } from './compress-image';
import { pollWithBackoff } from './polling';

export interface SessionItem {
  productId: string;
  name: string;
  state: 'queued' | 'running' | 'ready' | 'failed' | 'discarded';
  url?: string;
  jobId?: string;
  error?: string;
}

/** Matches the API worker concurrency. */
const MAX_CONCURRENCY = 2;
const MAX_POLL_ATTEMPTS = 60;
const DISCARD_CHUNK = 10;

const KEEP_AWAKE_TAG = 'enquiry-try-on';

/** A screen timeout backgrounds the app, which runs cleanup and loses paid-for results. */
export function shouldKeepAwake(step: string): boolean {
  return step === 'running' || step === 'gallery';
}

/** Never throws: keep-awake is a convenience and must not block the session. */
export async function setSessionKeepAwake(on: boolean): Promise<void> {
  try {
    if (on) await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    else await deactivateKeepAwake(KEEP_AWAKE_TAG);
  } catch {
    // swallowed on purpose
  }
}

/** True only for a URI inside the app cache dir — never a gallery original. */
export function isAppCacheUri(uri: string, cacheDir: string | null | undefined): boolean {
  return !!cacheDir && uri.startsWith(cacheDir);
}

/**
 * Top-up packs the admin has switched on for this plan (F-044 R2 T6). Any
 * failure (managers get 403, offline, flag off) is `[]` so the "Buy more
 * try-ons" button stays hidden.
 */
export async function loadBuyablePacks(): Promise<
  { id: string; label: string; pack_size: number; price_paise: number }[]
> {
  try {
    return (await billingApi.tryOnPacks()).data;
  } catch {
    return [];
  }
}

/** First `remaining` products run; the rest are skipped (quota pre-flight). */
export function planSession<T>(products: T[], remaining: number): { run: T[]; skipped: T[] } {
  const n = Math.max(0, remaining);
  return { run: products.slice(0, n), skipped: products.slice(n) };
}

const errCode = (e: unknown): string | undefined => (e as { code?: string } | null)?.code;
const errMsg = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

export async function runTryOnSession(args: {
  products: { id: string; name: string }[];
  photoUri: string;
  consentVersion: string;
  onItem: (i: SessionItem) => void;
  signal: AbortSignal;
  /** Called once with the compressed copy's uri (only when it differs from photoUri) so the caller can delete it. */
  onCompressed?: (uri: string) => void;
}): Promise<SessionItem[]> {
  const { photoUri, consentVersion, onItem, signal, onCompressed } = args;

  const seen = new Set<string>();
  const unique = args.products.filter((p) => !seen.has(p.id) && !!seen.add(p.id));
  const items: SessionItem[] = unique.map((p) => ({
    productId: p.id,
    name: p.name,
    state: 'queued',
  }));
  const set = (i: number, patch: Partial<SessionItem>) => {
    items[i] = { ...items[i]!, ...patch };
    onItem(items[i]!);
  };
  items.forEach((it) => onItem(it));

  // Compress ONCE; every product reuses the same file.
  let uri = photoUri;
  try {
    uri = await compressImageForUpload(photoUri);
    if (uri !== photoUri) onCompressed?.(uri);
  } catch {
    uri = photoUri; // original still fits the API cap
  }

  const waitForJob = (i: number, productId: string, jobId: string) =>
    new Promise<void>((resolve) => {
      let attempts = 0;
      let done = false;
      let stop: () => void = () => {};
      const finish = (patch: Partial<SessionItem>) => {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', onAbort);
        stop();
        set(i, patch);
        resolve();
      };
      const onAbort = () => finish({ state: 'failed', error: 'Cancelled' });
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort);

      stop = pollWithBackoff({
        maxAttempts: MAX_POLL_ATTEMPTS,
        onPoll: async () => {
          if (done) return true;
          attempts++;
          try {
            const { data } = await productApi.getTryOnStatus(productId, jobId);
            if (data.status === 'ready') {
              finish({ state: 'ready', url: data.url ?? undefined });
              return true;
            }
            if (data.status === 'failed') {
              finish({ state: 'failed', error: data.error ?? 'Try-on failed' });
              return true;
            }
            if (data.status === 'withdrawn' || data.status === 'discarded') {
              finish({ state: 'discarded' });
              return true;
            }
          } catch (e) {
            if (attempts >= MAX_POLL_ATTEMPTS) {
              finish({ state: 'failed', error: 'Timed out waiting for the try-on' });
              return true;
            }
            throw e; // transient — pollWithBackoff keeps polling
          }
          if (attempts >= MAX_POLL_ATTEMPTS) {
            finish({ state: 'failed', error: 'Timed out waiting for the try-on' });
            return true;
          }
          return false;
        },
      });
      if (done) stop();
    });

  let next = 0;
  let limitHit = false;

  const worker = async () => {
    while (!signal.aborted && !limitHit) {
      const i = next++;
      if (i >= items.length) return;
      const productId = items[i]!.productId;
      set(i, { state: 'running' });
      let jobId: string;
      try {
        const res = await productApi.startTryOn(productId, consentVersion, uri, {
          skipCompress: true,
        });
        jobId = res.data.job_id;
      } catch (e) {
        if (errCode(e) === 'PLAN_LIMIT_EXCEEDED') limitHit = true;
        set(i, { state: 'failed', error: errMsg(e, 'Could not start the try-on') });
        continue;
      }
      set(i, { jobId });
      await waitForJob(i, productId, jobId);
    }
  };

  await Promise.all(Array.from({ length: MAX_CONCURRENCY }, worker));

  // Anything never started: tell the UI why instead of leaving it queued.
  items.forEach((it, i) => {
    if (it.state === 'queued') {
      set(i, { state: 'failed', error: limitHit ? 'Try-on limit reached' : 'Cancelled' });
    }
  });
  return items;
}

/**
 * Delete the wearer-photo copies (app cache only) and discard the generated
 * results. Each step is isolated: a failed API discard never skips file
 * deletion.
 *
 * KNOWN LIMIT: a job still PENDING when discard runs will land its image
 * later. runTryOnSession only resolves after every started job settles, so
 * callers should discard after it resolves; jobs unsettled at abort rely on
 * the server's 2 h age sweep.
 */
export async function cleanupSession(args: {
  photoUris: string[];
  jobIds: string[];
}): Promise<void> {
  const cacheDir = LegacyFileSystem.cacheDirectory;
  for (const uri of new Set(args.photoUris)) {
    if (!uri || !isAppCacheUri(uri, cacheDir)) continue;
    try {
      await LegacyFileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // best effort — OS clears the cache eventually
    }
  }
  const ids = [...new Set(args.jobIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += DISCARD_CHUNK) {
    try {
      await productApi.discardTryOnJobs(ids.slice(i, i + DISCARD_CHUNK));
    } catch {
      // server age sweep is the backstop
    }
  }
}
