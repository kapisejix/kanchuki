import type { PlatformTheme } from '@kanchuki/shared'
import { request } from './client'

// ─── Theme (admin-configurable brand palette) ─────────────────────

export const themeApi = {
  get: () =>
    request<{ data: Partial<PlatformTheme> }>('/v1/public/theme', { getCacheTtlMs: 60_000 }),
}
