import { prisma } from './client.js'
import type { AiProviderType } from '@prisma/client'

// AI Provider Registry (F-023) — the admin-configurable list of tagging models
// that packages/ai/src/providers.ts reads at call time. Admin adds/edits rows
// in Admin → AI Providers; the failover engine tries them in priority order.
//
// AiProviderType is NOT re-exported here — it comes from @prisma/client (the
// generated enum), so re-exporting it would collide with packages/db/src/index.ts's
// `export * from '@prisma/client'` (TS2308). Consumers import it from
// @kanchuki/db, which already surfaces the prisma one.

export interface AiProviderConfigRow {
  id: string
  provider_type: AiProviderType
  label: string
  model_name: string
  lite_model_name: string | null
  base_url: string | null
  api_key_name: string
  priority: number
  is_active: boolean
  credits_per_call: number
}

/**
 * Active providers ordered by priority (1 = tried first).
 *
 * Returns `null` when the table is missing or unreachable (migration not run,
 * DB down) — providers.ts falls back to the legacy hardcoded
 * claude/openai/gemini adapters in that case. Returns `[]` when the table
 * EXISTS but has no active rows — that is admin intent ("disable AI") and must
 * NOT silently fall back to legacy; the caller surfaces a clear error instead.
 */
export async function listActiveAiProviders(): Promise<AiProviderConfigRow[] | null> {
  try {
    const rows = await prisma.aiProviderConfig.findMany({
      where: { is_active: true },
      orderBy: [{ priority: 'asc' }, { created_at: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      provider_type: r.provider_type,
      label: r.label,
      model_name: r.model_name,
      lite_model_name: r.lite_model_name,
      base_url: r.base_url,
      api_key_name: r.api_key_name,
      priority: r.priority,
      is_active: r.is_active,
      credits_per_call: r.credits_per_call,
    }));
  } catch {
    return null; // table missing / DB down — caller uses legacy fallback
  }
}
