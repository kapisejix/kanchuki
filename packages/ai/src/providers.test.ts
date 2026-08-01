import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AiProviderConfigRow } from '@kanchuki/db'

// Controllable getSecret so tests can simulate "only some providers configured".
const { secretState } = vi.hoisted(() => ({
  secretState: { keys: new Map<string, string | undefined>() },
}))

const mockClaudeCreate = vi.fn()
const mockOpenAICreate = vi.fn()
const mockGeminiFetch = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockClaudeCreate }
  },
}))

vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockOpenAICreate } }
  },
}))

// Missing table by default → legacy env-driven fallback rows are used, exactly
// like the pre-registry behavior. Registry-driven tests override this. Note
// the semantics: `null` = table missing (legacy fallback), `[]` = table
// EXISTS but all rows inactive (admin disabled AI → clear error, NO fallback).
const mockListActiveAiProviders = vi.fn<() => Promise<AiProviderConfigRow[] | null>>(
  async () => null,
)

vi.mock('@kanchuki/db', () => ({
  getSecret: vi.fn(async (keyName: string) => secretState.keys.get(keyName)),
  listActiveAiProviders: mockListActiveAiProviders,
}))

const {
  runVisionAsk,
  runVisionExtract,
  reserveAiCredits,
  __resetProviderHealth,
  __setProviderCooldownMs,
} = await import('./providers.js')

const IMG = { buffer: Buffer.from('bytes'), mediaType: 'image/jpeg' as const }

const extractReq = {
  images: [IMG],
  systemPrompt: 'You are a fashion tagger.',
  userPrompt: 'Tag this product.',
  maxTokens: 1024,
  schema: {
    name: 'extract_product_attributes',
    description: 'Extract attributes',
    schema: { type: 'object' as const, properties: { category: { type: 'string' } } },
  },
}

const askReq = {
  images: [IMG],
  systemPrompt: 'You are a color expert.',
  userPrompt: 'What is the dominant color?',
  maxTokens: 50,
}

/** Simulate an Anthropic/OpenAI SDK error carrying an HTTP status. */
function apiError(status: number, message: string): Error {
  const err = new Error(message)
  ;(err as Error & { status: number }).status = status
  return err
}

function claudeToolUse(input: Record<string, unknown>) {
  return { content: [{ type: 'tool_use', input }] }
}

beforeEach(() => {
  mockClaudeCreate.mockReset()
  mockOpenAICreate.mockReset()
  mockGeminiFetch.mockReset()
  mockListActiveAiProviders.mockReset().mockResolvedValue(null) // legacy fallback
  __resetProviderHealth()
  __setProviderCooldownMs(60_000)
  // The geminiAdapter calls the global fetch — stub it so Gemini tests never
  // make real network calls to generativelanguage.googleapis.com.
  vi.stubGlobal('fetch', mockGeminiFetch)
  // Default: all three providers configured (the common production setup).
  secretState.keys.set('ANTHROPIC_API_KEY', 'sk-ant-test')
  secretState.keys.set('OPENAI_API_KEY', 'sk-openai-test')
  secretState.keys.set('GEMINI_API_KEY', 'gemini-test')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runVisionExtract — provider failover', () => {
  it('returns the Claude result when Claude is healthy (first provider)', async () => {
    mockClaudeCreate.mockResolvedValue(claudeToolUse({ category: 'Kurti' }))

    const out = await runVisionExtract(extractReq)

    expect(out).toEqual({ category: 'Kurti' })
    expect(mockClaudeCreate).toHaveBeenCalledTimes(1)
    expect(mockOpenAICreate).not.toHaveBeenCalled()
  })

  it('auto-tries OpenAI when Claude fails with an out-of-credits error', async () => {
    mockClaudeCreate.mockRejectedValue(apiError(400, 'Your credit balance is too low to access the Anthropic API'))
    mockOpenAICreate.mockResolvedValue({ choices: [{ message: { content: '{"category":"Lehenga"}' } }] })

    const out = await runVisionExtract(extractReq)

    expect(out).toEqual({ category: 'Lehenga' })
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
  })

  it('auto-tries Gemini when Claude AND OpenAI both fail (429 rate limit)', async () => {
    mockClaudeCreate.mockRejectedValue(apiError(429, 'rate_limit_error: too many requests'))
    mockOpenAICreate.mockRejectedValue(apiError(429, 'Rate limit reached'))
    mockGeminiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"category":"Saree"}' }] } }] }),
    })

    const out = await runVisionExtract(extractReq)

    expect(out).toEqual({ category: 'Saree' })
    expect(mockGeminiFetch).toHaveBeenCalledTimes(1)
  })

  it('marks the failed provider for cooldown (skipped) and self-heals after cooldown expiry', async () => {
    // Short cooldown so the self-heal leg of this test completes quickly.
    __setProviderCooldownMs(50)
    mockClaudeCreate.mockRejectedValue(apiError(429, 'rate limit'))
    mockOpenAICreate.mockResolvedValue({ choices: [{ message: { content: '{"category":"Kurti"}' } }] })

    // 1st call: Claude down → OpenAI serves it; Claude enters the cooldown.
    await runVisionExtract(extractReq)
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)

    // 2nd call (still in cooldown): Claude skipped, OpenAI serves again.
    await runVisionExtract(extractReq)
    expect(mockClaudeCreate).toHaveBeenCalledTimes(1) // still only the original attempt
    expect(mockOpenAICreate).toHaveBeenCalledTimes(2)

    // Self-heal: wait out the cooldown, then Claude is tried first again
    // (and its success clears the health mark for good).
    await new Promise((r) => setTimeout(r, 70))
    mockClaudeCreate.mockResolvedValue(claudeToolUse({ category: 'Kurti' }))
    await runVisionExtract(extractReq)
    expect(mockClaudeCreate).toHaveBeenCalledTimes(2)
  })

  it('throws an aggregated error when every configured provider fails', async () => {
    mockClaudeCreate.mockRejectedValue(apiError(400, 'credit balance is too low'))
    mockOpenAICreate.mockRejectedValue(apiError(429, 'Rate limit reached'))
    mockGeminiFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: { message: 'API key not valid' } }) })

    await expect(runVisionExtract(extractReq)).rejects.toThrow(/All AI providers failed/)
  })

  it('throws immediately (no failover) on a contract error — Claude responded but gave no tool_use', async () => {
    mockClaudeCreate.mockResolvedValue({ content: [{ type: 'text', text: 'sorry' }] })

    await expect(runVisionExtract(extractReq)).rejects.toThrow('Claude did not return tool use result')
    expect(mockOpenAICreate).not.toHaveBeenCalled()
    expect(mockGeminiFetch).not.toHaveBeenCalled()
  })

  it('reserveAiCredits returns the max credit cost among healthy configured providers', async () => {
    // Legacy fallback: claude=5, openai=2, gemini=1 — with all keys set → 5
    expect(await reserveAiCredits()).toBe(5)

    // Only Gemini key configured → 1
    secretState.keys.set('ANTHROPIC_API_KEY', undefined)
    secretState.keys.set('OPENAI_API_KEY', undefined)
    expect(await reserveAiCredits()).toBe(1)

    // No keys at all → still a positive reservation (1) so quota check passes 1
    secretState.keys.clear()
    expect(await reserveAiCredits()).toBe(1)
  })

  it('treats unparseable JSON as a contract error — no failover to the next provider', async () => {
    mockClaudeCreate.mockRejectedValue(apiError(400, 'credit balance is too low'))
    mockOpenAICreate.mockResolvedValue({ choices: [{ message: { content: 'not json at all' } }] })

    await expect(runVisionExtract(extractReq)).rejects.toThrow(/unparseable JSON/)
    // Provider responded but unusably — must NOT burn Gemini's quota too.
    expect(mockGeminiFetch).not.toHaveBeenCalled()
  })

  it('fails over past an OpenAI-compatible model that cannot accept images (text-only model)', async () => {
    // deepseek-chat rejects image input with a 400 on BOTH attempts (the
    // response_format retry included) — the adapter marks it providerDown so
    // the failover moves to Gemini instead of halting tagging.
    mockClaudeCreate.mockRejectedValue(apiError(400, 'credit balance is too low'))
    mockOpenAICreate.mockRejectedValue(
      apiError(400, 'Invalid image. Image must be a URL or base64 data URL.'),
    )
    mockGeminiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"category":"Saree"}' }] } }] }),
    })

    const out = await runVisionExtract(extractReq)

    expect(out).toEqual({ category: 'Saree' })
    expect(mockOpenAICreate).toHaveBeenCalledTimes(2) // first + response_format retry
    expect(mockGeminiFetch).toHaveBeenCalledTimes(1)
  })

  it('errors clearly when the registry exists but every provider is deactivated (admin intent)', async () => {
    // Table exists, zero active rows — the admin disabled AI. The legacy
    // adapters must NOT silently resurrect.
    mockListActiveAiProviders.mockResolvedValue([])

    await expect(runVisionExtract(extractReq)).rejects.toThrow(/No AI provider configured/)
    expect(mockClaudeCreate).not.toHaveBeenCalled()
    expect(mockOpenAICreate).not.toHaveBeenCalled()
    expect(mockGeminiFetch).not.toHaveBeenCalled()
  })

  it('throws a clear error when no AI provider key is configured', async () => {
    secretState.keys.clear()
    await expect(runVisionExtract(extractReq)).rejects.toThrow(/No AI provider configured/)
  })

  it('uses DB registry rows in priority order when configured', async () => {
    mockListActiveAiProviders.mockResolvedValue([
      {
        id: 'cfg-gemini',
        provider_type: 'GEMINI',
        label: 'Gemini',
        model_name: 'gemini-2.5-flash',
        lite_model_name: null,
        base_url: null,
        api_key_name: 'GEMINI_API_KEY',
        priority: 1,
        is_active: true,
        credits_per_call: 3,
      },
      {
        id: 'cfg-openrouter',
        provider_type: 'OPENAI_COMPAT',
        label: 'OpenRouter',
        model_name: 'anthropic/claude-3.5-sonnet',
        lite_model_name: null,
        base_url: 'https://openrouter.ai/api/v1',
        api_key_name: 'OPENROUTER_API_KEY',
        priority: 2,
        is_active: true,
        credits_per_call: 4,
      },
    ])
    secretState.keys.set('ANTHROPIC_API_KEY', undefined)
    secretState.keys.set('OPENAI_API_KEY', undefined)
    mockGeminiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"category":"Saree"}' }] } }] }),
    })

    const out = await runVisionExtract(extractReq)

    expect(out).toEqual({ category: 'Saree' })
    expect(mockClaudeCreate).not.toHaveBeenCalled()
    expect(mockOpenAICreate).not.toHaveBeenCalled()
  })

  it('reports the winning provider + weighted credits via onProviderUsed', async () => {
    const used: unknown[] = []
    mockClaudeCreate.mockResolvedValue(claudeToolUse({ category: 'Kurti' }))

    await runVisionExtract({ ...extractReq, onProviderUsed: (info) => used.push(info) })

    expect(used).toEqual([
      expect.objectContaining({
        provider_id: 'legacy-claude',
        provider_type: 'ANTHROPIC',
        model_name: 'claude-sonnet-4-5-20250929',
        credits_per_call: 5,
        resource_type: 'AI_TAGGING_CALL',
      }),
    ])
  })

  it('skips providers whose key is missing and uses the first configured one', async () => {
    secretState.keys.set('ANTHROPIC_API_KEY', undefined)
    mockOpenAICreate.mockResolvedValue({ choices: [{ message: { content: '{"category":"Gown"}' } }] })

    const out = await runVisionExtract(extractReq)

    expect(out).toEqual({ category: 'Gown' })
    expect(mockClaudeCreate).not.toHaveBeenCalled()
  })
})

describe('runVisionAsk — color detection failover', () => {
  it('returns Claude Haiku text on first success', async () => {
    mockClaudeCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Maroon' }] })

    const out = await runVisionAsk(askReq)

    expect(out).toBe('Maroon')
  })

  it('falls over to OpenAI when Claude is down', async () => {
    mockClaudeCreate.mockRejectedValue(apiError(400, 'Your credit balance is too low to access the Anthropic API'))
    mockOpenAICreate.mockResolvedValue({ choices: [{ message: { content: 'Bottle Green' } }] })

    const out = await runVisionAsk(askReq)

    expect(out).toBe('Bottle Green')
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
  })

  it('sends the image as a base64 data URL to OpenAI', async () => {
    mockClaudeCreate.mockRejectedValue(apiError(429, 'rate limit'))
    mockOpenAICreate.mockResolvedValue({ choices: [{ message: { content: 'Peach' } }] })

    await runVisionAsk(askReq)

    const call = mockOpenAICreate.mock.calls[0]![0]
    const imagePart = call.messages[1].content.find((c: { type: string }) => c.type === 'image_url')
    expect(imagePart.image_url.url).toBe(`data:image/jpeg;base64,${Buffer.from('bytes').toString('base64')}`)
  })
})

describe('Gemini adapter', () => {
  it('posts inline_data to generateContent and parses the JSON candidate', async () => {
    secretState.keys.set('ANTHROPIC_API_KEY', undefined)
    secretState.keys.set('OPENAI_API_KEY', undefined)
    mockGeminiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"category":"Sherwani"}' }] } }] }),
    })

    const out = await runVisionExtract(extractReq)

    expect(out).toEqual({ category: 'Sherwani' })
    const [, init] = mockGeminiFetch.mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body.contents[0].parts).toHaveLength(3) // system + user + inline image
    expect(body.contents[0].parts[2].inline_data.mime_type).toBe('image/jpeg')
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.temperature).toBe(0)
  })

  it('sends responseSchema with null enum entries stripped (detector pattern schema)', async () => {
    secretState.keys.set('ANTHROPIC_API_KEY', undefined)
    secretState.keys.set('OPENAI_API_KEY', undefined)
    mockGeminiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"category":"Kurti"}' }] } }] }),
    })

    await runVisionExtract({
      ...extractReq,
      schema: {
        ...extractReq.schema,
        schema: {
          type: 'object' as const,
          properties: { pattern: { type: 'string', enum: ['Plain', 'Printed', null] } },
        },
      },
    })

    const [, init] = mockGeminiFetch.mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body.generationConfig.responseSchema.properties.pattern.enum).toEqual(['Plain', 'Printed'])
  })
})
