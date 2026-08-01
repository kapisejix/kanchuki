import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {
  getSecret,
  listActiveAiProviders,
  type AiProviderConfigRow,
  type AiProviderType,
} from '@kanchuki/db'

// ─── Multi-provider vision failover (F-023) ───────────────────────────────
// The provider list is DB-driven: admin adds any model + API key + priority
// order in Admin → AI Providers (ai_provider_configs table). Only providers
// with a configured key (getSecret — DB-stored IntegrationSetting row or env
// var of the same name) are tried, in priority order. A failing provider
// enters a cooldown (circuit breaker) and is retried lazily once the cooldown
// expires — a successful call clears the mark immediately, so the pool
// self-heals.
//
// provider_type OPENAI_COMPAT is the "generic" adapter: every provider that
// speaks the OpenAI chat-completions protocol (OpenAI, OpenRouter, DeepSeek,
// Mistral, Groq, Together, ...) works through it via a base_url override —
// one adapter, any model on the market.
//
// Contract errors — the provider responded but returned an unusable shape
// (e.g. no tool_use block, bad JSON) — are NOT failover events: they rethrow
// immediately so a model quirk doesn't burn money on a second provider. Only
// provider-level outages trip the breaker.
//
// If the registry table is empty/unreachable (migration not run, tests), the
// legacy hardcoded claude/openai/gemini adapters are used so nothing breaks.

export type { AiProviderType }
export type AiProviderId = string

export interface AiImageInput {
  buffer: Buffer
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
}

export interface AiJsonSchema {
  name: string
  description: string
  /** Plain JSON Schema object (the same shape Claude's tool input_schema uses). */
  schema: Record<string, unknown>
}

export interface ProviderUsedInfo {
  provider_id: string
  provider_type: AiProviderType
  model_name: string
  credits_per_call: number
  resource_type: 'AI_TAGGING_CALL' | 'AI_ITEM_DETECT' | 'AI_COLOR_DETECT'
}

export interface VisionExtractRequest {
  images: AiImageInput[]
  systemPrompt: string
  userPrompt: string
  maxTokens: number
  schema: AiJsonSchema
  /** Claude-only: treat a missing tool_use block as an empty result instead of an error. */
  missingToolUseIsEmpty?: boolean
  /** Fired once when a provider successfully serves the call (for usage attribution). */
  onProviderUsed?: (info: ProviderUsedInfo) => void
  /** Attribution bucket — defaults to AI_TAGGING_CALL for extract. */
  resourceType?: ProviderUsedInfo['resource_type']
}

export interface VisionAskRequest {
  images: AiImageInput[]
  systemPrompt: string
  userPrompt: string
  maxTokens: number
  /** Fired once when a provider successfully serves the call (for usage attribution). */
  onProviderUsed?: (info: ProviderUsedInfo) => void
  /** Attribution bucket — defaults to AI_COLOR_DETECT for ask. */
  resourceType?: ProviderUsedInfo['resource_type']
}

/** Normalized provider outage so the failover runner can classify by status. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly provider: AiProviderId,
    /** Adapter-level "this provider can never serve this request" flag (e.g. a
     * text-only model fed an image). Survives wrapProviderError because that
     * helper returns AiProviderError instances as-is. */
    public readonly providerDown = false,
  ) {
    super(message)
    this.name = 'AiProviderError'
  }
}

interface ProviderAdapter {
  id: string
  providerType: AiProviderType
  modelName: string // model used for extract (tagging/detection)
  liteModelName: string | null // model used for ask (color detection)
  creditsPerCall: number
  extract(req: VisionExtractRequest): Promise<Record<string, unknown>>
  ask(req: VisionAskRequest): Promise<string>
}

function wrapProviderError(err: unknown, provider: AiProviderId): AiProviderError {
  if (err instanceof AiProviderError) return err
  const status = (err as { status?: number } | null)?.status ?? 0
  const message = err instanceof Error ? err.message : String(err)
  return new AiProviderError(message, status, provider)
}

/**
 * Parse a provider's JSON payload with a descriptive failure. A parse error
 * is a contract error (provider responded but unusable) — never an outage —
 * so the failover runner rethrows it without burning another provider.
 */
function parseJsonOutput(text: string, provider: AiProviderId): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch (err) {
    throw new AiProviderError(
      `${provider} returned unparseable JSON (${err instanceof Error ? err.message : String(err)})`,
      0,
      provider,
    )
  }
}

/**
 * Gemini's responseSchema rejects `null` inside a typed enum — the detector's
 * pattern enum lists null as a valid value (Claude tolerates it). Recursively
 * drop null enum entries so the schema stays Gemini-valid.
 */
function sanitizeSchemaForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini)
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (key === 'enum' && Array.isArray(value)) {
        out[key] = value.filter((item) => item !== null)
      } else {
        out[key] = sanitizeSchemaForGemini(value)
      }
    }
    return out
  }
  return schema
}

// ─── Health registry (circuit breaker + self-heal) ─────────────────────────
// id → epoch-ms when the provider may be tried again. An outage sets
// now + cooldown; a successful call deletes the mark (immediate heal).
const health = new Map<string, number>()
const DEFAULT_COOLDOWN_MS = 5 * 60_000
let cooldownMs = Number(process.env['AI_PROVIDER_COOLDOWN_MS']) || DEFAULT_COOLDOWN_MS

/** Test hook: shrink the cooldown so self-heal can be exercised quickly. */
export function __setProviderCooldownMs(ms: number): void {
  cooldownMs = ms
}

/** Test hook: clear all health marks between tests. */
export function __resetProviderHealth(): void {
  health.clear()
}

// ─── Provider registry loading ─────────────────────────────────────────────
// DB rows win; fall back to legacy hardcoded adapters when the table is
// empty or unreachable (migration not run / DB down / unit tests).

const LEGACY_ROWS: AiProviderConfigRow[] = [
  {
    id: 'legacy-claude',
    provider_type: 'ANTHROPIC',
    label: 'Claude (legacy)',
    model_name: 'claude-sonnet-4-5-20250929',
    lite_model_name: 'claude-haiku-4-5-20251001',
    base_url: null,
    api_key_name: 'ANTHROPIC_API_KEY',
    priority: 1,
    is_active: true,
    credits_per_call: 5,
  },
  {
    id: 'legacy-openai',
    provider_type: 'OPENAI_COMPAT',
    label: 'OpenAI (legacy)',
    model_name: process.env['OPENAI_VISION_MODEL'] ?? 'gpt-4o-mini',
    lite_model_name: null,
    base_url: null,
    api_key_name: 'OPENAI_API_KEY',
    priority: 2,
    is_active: true,
    credits_per_call: 2,
  },
  {
    id: 'legacy-gemini',
    provider_type: 'GEMINI',
    label: 'Gemini (legacy)',
    model_name: process.env['GEMINI_VISION_MODEL'] ?? 'gemini-2.5-flash',
    lite_model_name: process.env['GEMINI_VISION_LITE_MODEL'] ?? 'gemini-2.5-flash-lite',
    base_url: null,
    api_key_name: 'GEMINI_API_KEY',
    priority: 3,
    is_active: true,
    credits_per_call: 1,
  },
]

/** Order legacy rows by AI_PROVIDER_ORDER (claude,openai,gemini by default). */
function legacyRowsOrdered(): AiProviderConfigRow[] {
  const order = (process.env['AI_PROVIDER_ORDER'] ?? 'claude,openai,gemini')
    .split(',')
    .map((s) => s.trim())
  const byLegacyId: Record<string, AiProviderConfigRow> = {
    claude: LEGACY_ROWS[0]!,
    openai: LEGACY_ROWS[1]!,
    gemini: LEGACY_ROWS[2]!,
  }
  const rows = order.map((id) => byLegacyId[id]).filter((r): r is AiProviderConfigRow => !!r)
  return rows.length > 0 ? rows : LEGACY_ROWS
}

async function loadProviderRows(): Promise<AiProviderConfigRow[]> {
  const rows = await listActiveAiProviders()
  // null = table missing/unreachable (migration not run, DB down) → legacy
  // hardcoded adapters keep working out of the box.
  // [] = table EXISTS but every row is inactive → that is admin intent
  // ("disable AI") — return [] so the caller surfaces a clear error instead
  // of silently resurrecting legacy providers the admin disabled.
  if (rows !== null) return rows
  return legacyRowsOrdered()
}

async function configuredAdapters(): Promise<ProviderAdapter[]> {
  const rows = await loadProviderRows()
  const adapters: ProviderAdapter[] = []
  for (const row of rows) {
    if (!(await getSecret(row.api_key_name))) continue // no key → skip provider
    adapters.push(buildAdapter(row))
  }
  return adapters
}

/** Outage classification: auth/credit/rate/5xx/transport = provider down. */
function isProviderDown(err: unknown): boolean {
  // Explicit marker set by adapters that know this request can never succeed
  // on this provider (e.g. an OpenAI-compatible model that rejects the image
  // input entirely — text-only model). Must trip the breaker + fail over,
  // otherwise a single bad model selection halts tagging (the exact problem
  // this feature exists to solve).
  if ((err as { providerDown?: boolean } | null)?.providerDown === true) return true
  const status = (err as { status?: number } | null)?.status ?? 0
  if (status === 401 || status === 402 || status === 403 || status === 408 || status === 429) {
    return true
  }
  if (status >= 500) return true
  const msg = err instanceof Error ? err.message : String(err)
  // Anthropic maps a zero-credit 400 to "Unsupported state or unable to
  // authenticate data" — match the auth wording and the plain-English
  // credit/rate/overload phrasings each provider returns.
  return /credit balance|credit is too low|insufficient_?quota|quota|rate limit|rate_limit|overloaded|api key|authenticat|permission|billing|too many requests|unavailable|ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(
    msg,
  )
}

async function runWithFailover<T>(
  resourceType: ProviderUsedInfo['resource_type'],
  op: (p: ProviderAdapter) => Promise<T>,
  onProviderUsed?: (info: ProviderUsedInfo) => void,
): Promise<T> {
  const adapters = await configuredAdapters()
  if (adapters.length === 0) {
    throw new Error(
      'No AI provider configured — add an API key (Admin → Integrations) for at least one active AI provider',
    )
  }

  const failures: string[] = []
  for (const adapter of adapters) {
    const retryAt = health.get(adapter.id) ?? 0
    if (Date.now() < retryAt) {
      failures.push(`${adapter.id}: cooling down until ${new Date(retryAt).toISOString()}`)
      continue
    }
    try {
      const result = await op(adapter)
      health.delete(adapter.id) // self-heal on success
      onProviderUsed?.({
        provider_id: adapter.id,
        provider_type: adapter.providerType,
        model_name: adapter.modelName,
        credits_per_call: adapter.creditsPerCall,
        resource_type: resourceType,
      })
      return result
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      failures.push(`${adapter.id}: ${detail}`)
      if (isProviderDown(err)) {
        health.set(adapter.id, Date.now() + cooldownMs)
        continue // outage — auto-try the next provider
      }
      throw err // contract error — not a provider outage, don't burn another provider
    }
  }
  throw new Error(
    `All AI providers failed — tried ${adapters.map((a) => a.id).join(', ')}. ${failures.join(' | ')}`,
  )
}

/**
 * Weighted quota reservation: the most expensive credit cost among currently
 * healthy, key-configured providers. The quota gate reserves this before a
 * call so the retailer can always afford whichever provider actually serves
 * (failover only incurs costs from healthy providers). Min 1 credit.
 */
export async function reserveAiCredits(): Promise<number> {
  const adapters = await configuredAdapters()
  const healthy = adapters.filter((a) => Date.now() >= (health.get(a.id) ?? 0))
  return Math.max(1, ...healthy.map((a) => a.creditsPerCall))
}

/** Structured JSON extraction with automatic provider failover. */
export function runVisionExtract(req: VisionExtractRequest): Promise<Record<string, unknown>> {
  return runWithFailover(
    req.resourceType ?? 'AI_TAGGING_CALL',
    (p) => p.extract(req),
    req.onProviderUsed,
  )
}

/** Free-text single answer (e.g. color detection) with failover. */
export function runVisionAsk(req: VisionAskRequest): Promise<string> {
  return runWithFailover(
    req.resourceType ?? 'AI_COLOR_DETECT',
    (p) => p.ask(req),
    req.onProviderUsed,
  )
}

// ─── Adapter construction ──────────────────────────────────────────────────

function buildAdapter(row: AiProviderConfigRow): ProviderAdapter {
  const base = {
    id: row.id,
    providerType: row.provider_type,
    modelName: row.model_name,
    liteModelName: row.lite_model_name,
    creditsPerCall: row.credits_per_call,
  }
  switch (row.provider_type) {
    case 'ANTHROPIC':
      return { ...base, extract: anthropicExtract(row), ask: anthropicAsk(row) }
    case 'OPENAI_COMPAT':
      return { ...base, extract: openaiExtract(row), ask: openaiAsk(row) }
    case 'GEMINI':
      return { ...base, extract: geminiExtract(row), ask: geminiAsk(row) }
  }
}

// ─── Anthropic (Claude) ────────────────────────────────────────────────────
// Tool-call extraction keeps the exact semantics of the original tagger:
// the model must emit a tool_use block or we treat it as a contract error
// (unless missingToolUseIsEmpty, used by the item detector).

const claudeClients = new Map<string, Anthropic>()
async function getClaudeClient(apiKeyName: string): Promise<Anthropic> {
  let client = claudeClients.get(apiKeyName)
  if (!client) {
    client = new Anthropic({ apiKey: (await getSecret(apiKeyName)) ?? '' })
    claudeClients.set(apiKeyName, client)
  }
  return client
}

function claudeImageBlocks(images: AiImageInput[]): Anthropic.ImageBlockParam[] {
  return images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.buffer.toString('base64') },
  }))
}

function anthropicExtract(row: AiProviderConfigRow) {
  return async (req: VisionExtractRequest): Promise<Record<string, unknown>> => {
    try {
      const response = await (await getClaudeClient(row.api_key_name)).messages.create({
        model: row.model_name,
        max_tokens: req.maxTokens,
        temperature: 0,
        system: req.systemPrompt,
        tools: [
          {
            name: req.schema.name,
            description: req.schema.description,
            input_schema: req.schema.schema as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'tool', name: req.schema.name },
        messages: [
          {
            role: 'user',
            content: [...claudeImageBlocks(req.images), { type: 'text', text: req.userPrompt }],
          },
        ],
      })
      const toolUse = response.content.find((c) => c.type === 'tool_use')
      if (!toolUse || toolUse.type !== 'tool_use') {
        if (req.missingToolUseIsEmpty) return {}
        throw new Error('Claude did not return tool use result')
      }
      return toolUse.input as Record<string, unknown>
    } catch (err) {
      throw wrapProviderError(err, row.id)
    }
  }
}

function anthropicAsk(row: AiProviderConfigRow) {
  const model = row.lite_model_name ?? row.model_name
  return async (req: VisionAskRequest): Promise<string> => {
    try {
      const response = await (await getClaudeClient(row.api_key_name)).messages.create({
        model,
        max_tokens: req.maxTokens,
        temperature: 0,
        system: req.systemPrompt,
        messages: [
          {
            role: 'user',
            content: [...claudeImageBlocks(req.images), { type: 'text', text: req.userPrompt }],
          },
        ],
      })
      return response.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text.trim())
        .join(' ')
    } catch (err) {
      throw wrapProviderError(err, row.id)
    }
  }
}

// ─── OpenAI-compatible (OpenAI + OpenRouter/DeepSeek/Mistral/Groq/Together) ─
// The generic adapter: base_url + model name come from the registry row, so
// ANY OpenAI-protocol provider works with no new code.

const openaiClients = new Map<string, OpenAI>()
async function getOpenAIClient(apiKeyName: string, baseUrl: string | null): Promise<OpenAI> {
  const cacheKey = `${apiKeyName}|${baseUrl ?? ''}`
  let client = openaiClients.get(cacheKey)
  if (!client) {
    client = new OpenAI({
      apiKey: (await getSecret(apiKeyName)) ?? '',
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    })
    openaiClients.set(cacheKey, client)
  }
  return client
}

function openaiContent(
  req: VisionExtractRequest | VisionAskRequest,
): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  return [
    { type: 'text', text: req.userPrompt },
    ...req.images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${img.mediaType};base64,${img.buffer.toString('base64')}` },
    })),
  ]
}

function openaiExtract(row: AiProviderConfigRow) {
  return async (req: VisionExtractRequest): Promise<Record<string, unknown>> => {
    try {
      let response: OpenAI.Chat.Completions.ChatCompletion
      try {
        response = await (await getOpenAIClient(row.api_key_name, row.base_url)).chat.completions.create(
          {
            model: row.model_name,
            max_tokens: req.maxTokens,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  `${req.systemPrompt}\n\n` +
                  `Return ONLY a valid JSON object matching this schema:\n${JSON.stringify(req.schema.schema)}`,
              },
              { role: 'user', content: openaiContent(req) },
            ],
          },
        )
      } catch (err) {
        // Some OpenAI-compatible providers (older OpenRouter models, Groq
        // free-tier) reject response_format. Retry once without it and parse
        // the JSON from plain text. Only retry on a 400 (config-level), not
        // on 429/5xx — those are real outages handled by the failover.
        const status = (err as { status?: number } | null)?.status ?? 0
        if (status !== 400) throw err
        try {
          response = await (await getOpenAIClient(row.api_key_name, row.base_url)).chat.completions.create(
            {
              model: row.model_name,
              max_tokens: req.maxTokens,
              temperature: 0,
              messages: [
                { role: 'system', content: req.systemPrompt },
                { role: 'user', content: openaiContent(req) },
              ],
            },
          )
        } catch (retryErr) {
          // A second 400 means the model cannot serve this request AT ALL —
          // the most common cause is a text-only model (e.g. deepseek-chat)
          // rejecting the image input. That's a provider-level problem, not a
          // bad response: mark it as an outage so the failover moves to the
          // next provider instead of halting tagging on a bad model choice.
          // AiProviderError carries the flag so wrapProviderError's instanceof
          // short-circuit preserves it through the outer catch below.
          const retryStatus = (retryErr as { status?: number } | null)?.status ?? 0
          if (retryStatus === 400) {
            const detail = retryErr instanceof Error ? retryErr.message : String(retryErr)
            throw new AiProviderError(detail, retryStatus, row.id, true)
          }
          throw retryErr
        }
      }
      const text = response.choices[0]?.message?.content
      if (!text) {
        if (req.missingToolUseIsEmpty) return {}
        throw new Error('OpenAI returned an empty response')
      }
      return parseJsonOutput(text, row.id)
    } catch (err) {
      throw wrapProviderError(err, row.id)
    }
  }
}

function openaiAsk(row: AiProviderConfigRow) {
  const model = row.lite_model_name ?? row.model_name
  return async (req: VisionAskRequest): Promise<string> => {
    try {
      const response = await (await getOpenAIClient(row.api_key_name, row.base_url)).chat.completions.create(
        {
          model,
          max_tokens: req.maxTokens,
          temperature: 0,
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: openaiContent(req) },
          ],
        },
      )
      return (response.choices[0]?.message?.content ?? '').trim()
    } catch (err) {
      // The ask path (color detection) sends no response_format, so a 400 here
      // means the model cannot serve this request at all (most commonly a
      // text-only model rejecting the image input). Same providerDown treatment
      // as openaiExtract's retry — color detection must fail over, not halt.
      const status = (err as { status?: number } | null)?.status ?? 0
      if (status === 400) {
        const detail = err instanceof Error ? err.message : String(err)
        throw new AiProviderError(detail, status, row.id, true)
      }
      throw wrapProviderError(err, row.id)
    }
  }
}

// ─── Google Gemini (REST — no SDK dependency) ───────────────────────────────

async function geminiGenerateContent(
  apiKeyName: string,
  model: string,
  req: VisionExtractRequest | VisionAskRequest,
  responseMimeType: string,
  schema?: Record<string, unknown>,
): Promise<string> {
  const apiKey = await getSecret(apiKeyName)
  if (!apiKey) throw new AiProviderError(`${apiKeyName} not configured`, 0, apiKeyName)

  const parts: Record<string, unknown>[] = [
    { text: req.systemPrompt },
    { text: req.userPrompt },
    ...req.images.map((img) => ({
      inline_data: { mime_type: img.mediaType, data: img.buffer.toString('base64') },
    })),
  ]

  let res: Response
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: req.maxTokens,
            responseMimeType,
            // Schema-enforced output (like Claude's tool_use): the model must
            // conform, so the returned JSON always parses and matches shape.
            ...(schema ? { responseSchema: sanitizeSchemaForGemini(schema) } : {}),
          },
        }),
      },
    )
  } catch (err) {
    throw wrapProviderError(err, apiKeyName)
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: { message?: string } }
      if (body.error?.message) detail = `${body.error.message} (HTTP ${res.status})`
    } catch {
      // body wasn't JSON — the status alone is enough
    }
    throw new AiProviderError(`Gemini API error: ${detail}`, res.status, apiKeyName)
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }
  if (data.error?.message) {
    throw new AiProviderError(`Gemini API error: ${data.error.message}`, res.status, apiKeyName)
  }
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

function geminiExtract(row: AiProviderConfigRow) {
  return async (req: VisionExtractRequest): Promise<Record<string, unknown>> => {
    const text = await geminiGenerateContent(
      row.api_key_name,
      row.model_name,
      req,
      'application/json',
      req.schema.schema,
    )
    if (!text.trim()) {
      if (req.missingToolUseIsEmpty) return {}
      throw new Error('Gemini returned an empty response')
    }
    return parseJsonOutput(text, row.id)
  }
}

function geminiAsk(row: AiProviderConfigRow) {
  const model = row.lite_model_name ?? row.model_name
  return async (req: VisionAskRequest): Promise<string> => {
    return (await geminiGenerateContent(row.api_key_name, model, req, 'text/plain')).trim()
  }
}
