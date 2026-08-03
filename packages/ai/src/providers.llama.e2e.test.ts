import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AiProviderConfigRow } from '@kanchuki/db'

// ─── Seeded registry rows (mirror migrations 041 + 042) ─────────────────────
// 041 seeded Claude/GPT/Gemini at priorities 1–3; 042 appended the two Llama
// 3.2 Vision fallbacks at priorities 4–5, pointing at NVIDIA's OpenAI-protocol
// endpoint. The Llama rows are seeded active but "ready to activate": a row
// only joins the failover chain once its API key is configured — which is
// exactly the scenario these e2e tests exercise (only NVIDIA_API_KEY set, so
// the chain skips Claude/GPT/Gemini and lands on the first Llama row).
const SEEDED_ROWS: AiProviderConfigRow[] = [
  {
    id: 'seed-claude',
    provider_type: 'ANTHROPIC',
    label: 'Claude Sonnet (default)',
    model_name: 'claude-sonnet-4-5-20250929',
    lite_model_name: 'claude-haiku-4-5-20251001',
    base_url: null,
    api_key_name: 'ANTHROPIC_API_KEY',
    priority: 1,
    is_active: true,
    credits_per_call: 5,
  },
  {
    id: 'seed-openai',
    provider_type: 'OPENAI_COMPAT',
    label: 'OpenAI GPT-4o-mini',
    model_name: 'gpt-4o-mini',
    lite_model_name: null,
    base_url: null,
    api_key_name: 'OPENAI_API_KEY',
    priority: 2,
    is_active: true,
    credits_per_call: 2,
  },
  {
    id: 'seed-gemini',
    provider_type: 'GEMINI',
    label: 'Google Gemini Flash',
    model_name: 'gemini-2.5-flash',
    lite_model_name: 'gemini-2.5-flash-lite',
    base_url: null,
    api_key_name: 'GEMINI_API_KEY',
    priority: 3,
    is_active: true,
    credits_per_call: 1,
  },
  {
    id: 'seed-llama-90b',
    provider_type: 'OPENAI_COMPAT',
    label: 'Llama 3.2 90B Vision (free fallback)',
    model_name: 'meta/llama-3.2-90b-vision-instruct',
    lite_model_name: null,
    base_url: 'https://integrate.api.nvidia.com/v1',
    api_key_name: 'NVIDIA_API_KEY',
    priority: 4,
    is_active: true,
    credits_per_call: 1,
  },
  {
    id: 'seed-llama-11b',
    provider_type: 'OPENAI_COMPAT',
    label: 'Llama 3.2 11B Vision (cheap fallback)',
    model_name: 'meta/llama-3.2-11b-vision-instruct',
    lite_model_name: null,
    base_url: 'https://integrate.api.nvidia.com/v1',
    api_key_name: 'NVIDIA_API_KEY',
    priority: 5,
    is_active: true,
    credits_per_call: 1,
  },
]

// Controllable secret store — the real getSecret reads IntegrationSetting rows
// + env vars; here only NVIDIA_API_KEY is "configured" (as if the admin added
// it in Admin → Integrations), so the failover chain lands on the Llama rows.
const { secretState } = vi.hoisted(() => ({
  secretState: { keys: new Map<string, string | undefined>() },
}))

const mockOpenAICreate = vi.fn()
const mockClaudeCreate = vi.fn()
const mockGeminiFetch = vi.fn()

// The Llama rows are OPENAI_COMPAT → served through the OpenAI SDK pointed at
// NVIDIA's base_url. Stub the SDK so no real network call happens; the rest of
// the chain (registry → failover → adapter → attribution) is real.
vi.mock('openai', () => ({
  default: class {
    chat = { completions: { create: mockOpenAICreate } }
  },
}))

// Claude/GPT/Gemini are skipped (keys unset), but providers.ts imports the
// SDKs at module load — stub them to keep the test hermetic.
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockClaudeCreate }
  },
}))

vi.mock('@kanchuki/db', () => ({
  getSecret: vi.fn(async (keyName: string) => secretState.keys.get(keyName)),
  listActiveAiProviders: vi.fn(async () => SEEDED_ROWS),
}))

// ssrfSafeFetch resolves the hostname before calling fetch — stub it to a
// public IP so the cdn.example.com fixture below doesn't hit real DNS.
vi.mock('node:dns/promises', () => {
  const lookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  return { lookup, default: { lookup } }
})

const { tagProductImages, detectColor } = await import('./tagger.js')
const { __resetProviderHealth } = await import('./providers.js')

// A real (if tiny) product image — 1×1 transparent PNG.
const PRODUCT_IMG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

function tagPayload(category: string, primary_color: string) {
  return JSON.stringify({
    category,
    product_type: 'Readymade',
    primary_color,
    secondary_colors: [],
    fabric_estimate: 'Cotton',
    pattern: 'Plain',
    embellishments: [],
    neck_style: 'Round Neck',
    sleeve_type: 'Full Sleeve',
    occasions: ['Casual'],
    price_range_estimate: '₹500-₹1000',
    design_number_visible: null,
    is_catalog_image: false,
    search_tags: [`${primary_color.toLowerCase()} ${category.toLowerCase()}`],
  })
}

beforeEach(() => {
  mockClaudeCreate.mockReset()
  mockOpenAICreate.mockReset()
  mockGeminiFetch.mockReset()
  __resetProviderHealth()
  secretState.keys.clear()
  secretState.keys.set('NVIDIA_API_KEY', 'nvapi-test-key')
  // Gemini adapter uses the global fetch — stub it so no real network call
  // can ever escape the test even if the chain mis-routes.
  vi.stubGlobal('fetch', mockGeminiFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('e2e — seeded Llama vision fallback serves tagging + attribution', () => {
  it('tags a product image via Llama 3.2 90B Vision and reports it via onProviderUsed', async () => {
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: tagPayload('Kurti', 'Pink') } }],
    })

    const used: unknown[] = []
    const result = await tagProductImages([{ buffer: PRODUCT_IMG, mediaType: 'image/png' }], {
      onProviderUsed: (info) => used.push(info),
    })

    // Only the Llama 90B row served — Claude/GPT/Gemini were skipped because
    // their keys are unset (the "ready to activate" behavior).
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    expect(mockClaudeCreate).not.toHaveBeenCalled()
    expect(mockGeminiFetch).not.toHaveBeenCalled()

    // The request went to NVIDIA's OpenAI-protocol endpoint with the 90B model,
    // and the product image travelled as a base64 data URL.
    const call = mockOpenAICreate.mock.calls[0]![0]
    expect(call.model).toBe('meta/llama-3.2-90b-vision-instruct')
    const imagePart = call.messages[1].content.find((c: { type: string }) => c.type === 'image_url')
    expect(imagePart.image_url.url).toContain('data:image/png;base64,')

    // Attribution: exactly one provider, the seeded Llama 90B row, 1 credit.
    expect(used).toEqual([
      expect.objectContaining({
        provider_id: 'seed-llama-90b',
        provider_type: 'OPENAI_COMPAT',
        model_name: 'meta/llama-3.2-90b-vision-instruct',
        credits_per_call: 1,
        resource_type: 'AI_TAGGING_CALL',
      }),
    ])

    expect(result.category).toBe('Kurti')
    expect(result.primary_color).toBe('Pink')
  })

  it('fails over 90B → 11B when 90B is out of credits and attributes the 11B row', async () => {
    mockOpenAICreate
      .mockRejectedValueOnce({ status: 429, message: 'Rate limit reached' })
      .mockResolvedValueOnce({
        choices: [{ message: { content: tagPayload('Saree', 'Maroon') } }],
      })

    const used: unknown[] = []
    const result = await tagProductImages([{ buffer: PRODUCT_IMG, mediaType: 'image/png' }], {
      onProviderUsed: (info) => used.push(info),
    })

    expect(mockOpenAICreate).toHaveBeenCalledTimes(2)
    expect(mockOpenAICreate.mock.calls[1]![0].model).toBe('meta/llama-3.2-11b-vision-instruct')
    expect(used).toEqual([
      expect.objectContaining({
        provider_id: 'seed-llama-11b',
        provider_type: 'OPENAI_COMPAT',
        model_name: 'meta/llama-3.2-11b-vision-instruct',
        credits_per_call: 1,
        resource_type: 'AI_TAGGING_CALL',
      }),
    ])
    expect(result.category).toBe('Saree')
  })

  it('attributes AI_COLOR_DETECT to the Llama provider via detectColor', async () => {
    // detectColor fetches the image by URL first (global fetch), then runs the
    // vision ask through the OpenAI adapter. Gemini is skipped (no key), so the
    // only fetch call is the image fetch — serve a real PNG response here.
    mockGeminiFetch.mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => PRODUCT_IMG.buffer.slice(0, PRODUCT_IMG.length),
    })
    mockOpenAICreate.mockResolvedValue({
      choices: [{ message: { content: 'Bottle Green' } }],
    })

    const used: unknown[] = []
    const color = await detectColor('https://cdn.example.com/garment.png', {
      onProviderUsed: (info) => used.push(info),
    })

    expect(color).toBe('Bottle Green')
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    // The one fetch call was the image download — Gemini was skipped (no key),
    // otherwise the Gemini adapter would have hit the global fetch a second time.
    expect(mockGeminiFetch).toHaveBeenCalledTimes(1)
    expect(used).toEqual([
      expect.objectContaining({
        provider_id: 'seed-llama-90b',
        model_name: 'meta/llama-3.2-90b-vision-instruct',
        resource_type: 'AI_COLOR_DETECT',
      }),
    ])
  })
})
