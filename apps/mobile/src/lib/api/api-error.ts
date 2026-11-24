// Kept dependency-free on purpose: client.ts pulls in native Expo modules, and
// helpers that only need `instanceof ApiError` (errors.ts, mutation-queue.ts) must
// stay importable in unit tests. client.ts re-exports this, so `import { ApiError }
// from './client'` / '../api' keeps working and is the same class.
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    /** Optional structured payload from the server error envelope — e.g.
     * per-target FAILED results on an all-failed social publish (T-7.2). */
    public readonly results?: unknown[] | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
