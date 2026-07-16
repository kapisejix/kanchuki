/**
 * Offline cache persister for React Query.
 *
 * Uses `expo-file-system` (v19+ class-based API) to persist query cache
 * to a JSON file in the app's document directory. Survives app restarts
 * so the catalog is viewable without network.
 *
 * Design:
 * - Writes are debounced (2s) to batch rapid cache updates
 * - Only queries with remaining gcTime are persisted (skip stale/expired)
 * - Save triggers on AppState background/inactive
 * - Rehydrate on app start before any screen mounts
 * - Write errors are non-fatal (logged, not thrown)
 */

import { Paths } from 'expo-file-system'

// ─── Paths ────────────────────────────────────────────────────
// Use string URIs from Paths.document.uri to avoid passing fake objects
// to the real File/Directory constructors (which expect .uri property).
// The real constructors come from a lightweight require at the point of
// use — they're cached by Node/RN after the first call.

const CACHE_DIR_URI = `${Paths.document.uri}kanchuki-cache/`
const CACHE_FILE_URI = `${CACHE_DIR_URI}rq-cache.json`

/** Lazy-acquired reference to the real expo-file-system `File` class */
function getFileClass(): new (...args: unknown[]) => {
  uri: string
  exists: boolean
  create(opts?: Record<string, boolean>): void
  write(content: string, opts?: Record<string, string>): void
  text(): Promise<string>
  delete(): void
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-file-system') as { File: never }
  return mod.File
}

/** Lazy-acquired reference to the real expo-file-system `Directory` class */
function getDirectoryClass(): new (...args: unknown[]) => {
  uri: string
  exists: boolean
  create(opts?: Record<string, boolean>): void
  delete(): void
} {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-file-system') as { Directory: never }
  return mod.Directory
}

// ─── Types ─────────────────────────────────────────────────────

interface PersistedQuery {
  queryHash: string
  queryKey: unknown[]
  state: Record<string, unknown>
}

interface PersistedCache {
  version: number
  timestamp: number
  queries: PersistedQuery[]
}

const CURRENT_VERSION = 1

// ─── File helpers ──────────────────────────────────────────────

/** Ensure the cache directory exists. Creates it (with intermediates) if missing. */
function ensureCacheDir(): void {
  const DirClass = getDirectoryClass()
  const dir = new DirClass(CACHE_DIR_URI)
  if (!(dir as { exists: boolean }).exists) {
    ;(dir as { create: (opts: Record<string, boolean>) => void }).create({
      intermediates: true,
      idempotent: true,
    })
  }
}

/** Get a File handle for the cache file (does NOT create the file). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cacheFile(): any {
  const FileClass = getFileClass()
  ensureCacheDir()
  return new FileClass(CACHE_FILE_URI)
}

// ─── Persist ───────────────────────────────────────────────────

/**
 * Persist the current React Query cache to the filesystem.
 *
 * Filters to only queries that still have gcTime remaining.
 * Errors are non-fatal — silently logged.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function persistQueryCache(queryClient: any): void {
  try {
    const allQueries = queryClient.getQueryCache().getAll()
    const persistable: PersistedQuery[] = []

    for (const query of allQueries) {
      const state = query.state
      // Skip queries that have no data or whose gcTime window has elapsed
      if (!state.data || query.isStaleByTime(query.gcTime)) continue

      persistable.push({
        queryHash: query.queryHash,
        queryKey: query.queryKey,
        state: {
          data: state.data,
          dataUpdateCount: state.dataUpdateCount,
          dataUpdatedAt: state.dataUpdatedAt,
          error: state.error,
          errorUpdateCount: state.errorUpdateCount,
          errorUpdatedAt: state.errorUpdatedAt,
          fetchFailureCount: state.fetchFailureCount,
          fetchMeta: state.fetchMeta,
          isInvalidated: state.isInvalidated,
          status: state.status,
          fetchStatus: state.fetchStatus,
        },
      })
    }

    if (persistable.length === 0) return

    const payload: PersistedCache = {
      version: CURRENT_VERSION,
      timestamp: Date.now(),
      queries: persistable,
    }

    const file = cacheFile()
    if (!(file as { exists: boolean }).exists) {
      ;(file as { create: (opts: Record<string, boolean>) => void }).create({
        intermediates: true,
        overwrite: true,
      })
    }
    // iOS native File.write(_:) takes exactly one argument — passing an
    // options object throws InvalidArgsNumberException at the native layer.
    ;(file as { write: (c: string) => void }).write(JSON.stringify(payload))
  } catch (err) {
    console.warn(
      '[offline-persister] Failed to persist cache:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

// ─── Restore ──────────────────────────────────────────────────

/**
 * Restore a previously persisted query cache into the query client.
 *
 * Called once on app start before screens render.
 * Returns true if data was restored, false if no cache was found.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function restoreQueryCache(queryClient: any): Promise<boolean> {
  try {
    const file = cacheFile()
    if (!(file as { exists: boolean }).exists) return false

    const content = await (file as { text: () => Promise<string> }).text()
    const payload = JSON.parse(content) as PersistedCache

    // Version check — clear and bail if format changed
    if (payload.version !== CURRENT_VERSION) {
      await clearPersistedCache()
      return false
    }

    // Skip cache older than 24 hours (stale data isn't useful)
    if (Date.now() - payload.timestamp > 24 * 60 * 60 * 1000) {
      await clearPersistedCache()
      return false
    }

    if (!payload.queries?.length) return false

    // Restore each query into React Query's cache
    for (const q of payload.queries) {
      queryClient.setQueryData(q.queryKey, q.state.data, {
        updatedAt: (q.state.dataUpdatedAt as number) ?? Date.now(),
      })
    }

    return true
  } catch (err) {
    // Corrupt cache file — clear it and start fresh
    console.warn(
      '[offline-persister] Failed to restore cache, clearing:',
      err instanceof Error ? err.message : String(err),
    )
    await clearPersistedCache().catch(() => {})
    return false
  }
}

// ─── Clear ────────────────────────────────────────────────────

/**
 * Delete the persisted cache file.
 */
export async function clearPersistedCache(): Promise<void> {
  try {
    const file = cacheFile()
    if ((file as { exists: boolean }).exists) {
      ;(file as { delete: () => void }).delete()
    }
  } catch {
    // Best-effort
  }
}
