// RC-079 — the OpenAI embeddings client must not inherit the SDK's 10 min timeout.
import { describe, expect, it, vi } from 'vitest'

const { clientOptions } = vi.hoisted(() => ({ clientOptions: [] as Record<string, unknown>[] }))

vi.mock('openai', () => ({
  default: class {
    embeddings = { create: async () => ({ data: [{ embedding: [0.1] }] }) }
    constructor(opts: Record<string, unknown>) {
      clientOptions.push(opts)
    }
  },
}))
vi.mock('@kanchuki/db', () => ({ getSecret: async () => 'sk-test' }))

const { generateEmbedding } = await import('./embedder.js')

describe('embedder OpenAI client', () => {
  it('is built with a 60 s timeout and 1 retry', async () => {
    await generateEmbedding('pink suit')
    expect(clientOptions[0]).toMatchObject({ timeout: 60_000, maxRetries: 1 })
  })
})
