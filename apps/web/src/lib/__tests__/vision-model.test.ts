import { describe, it, expect } from 'vitest'
import { classifyVisionModel } from '../vision-model'

describe('classifyVisionModel', () => {
  it('recognizes vision-capable models', () => {
    expect(classifyVisionModel('gpt-4o-mini')).toBe('vision')
    expect(classifyVisionModel('gpt-4.1-mini')).toBe('vision')
    expect(classifyVisionModel('gpt-4.5')).toBe('vision')
    expect(classifyVisionModel('claude-sonnet-4-5-20250929')).toBe('vision')
    expect(classifyVisionModel('claude-haiku-4-5-20251001')).toBe('vision')
    expect(classifyVisionModel('gemini-2.5-flash')).toBe('vision')
    expect(classifyVisionModel('gemini-2.5-flash-lite')).toBe('vision')
    expect(classifyVisionModel('meta/llama-3.2-90b-vision-instruct')).toBe('vision')
    expect(classifyVisionModel('meta/llama-3.2-11b-vision-instruct')).toBe('vision')
    expect(classifyVisionModel('qwen/qwen2.5-vl-72b')).toBe('vision')
    expect(classifyVisionModel('qwen/qwen3-vl-235b')).toBe('vision') // qwen3-vl shadows the qwen3 text marker
    expect(classifyVisionModel('meta/llama-4-scout-17b')).toBe('vision') // Llama 4 is multimodal
  })

  it('recognizes text-only models even with provider prefixes', () => {
    expect(classifyVisionModel('deepseek/deepseek-chat')).toBe('text-only')
    expect(classifyVisionModel('deepseek/deepseek-reasoner')).toBe('text-only')
    expect(classifyVisionModel('meta/llama-3.3-70b-instruct')).toBe('text-only')
    expect(classifyVisionModel('mistralai/mixtral-8x7b-instruct-v0.1')).toBe('text-only')
    expect(classifyVisionModel('upstage/solar-10.7b-instruct')).toBe('text-only')
    expect(classifyVisionModel('bytedance/seed-oss-36b-instruct')).toBe('text-only')
    expect(classifyVisionModel('nvidia/nemotron-mini-4b-instruct')).toBe('text-only')
    expect(classifyVisionModel('qwen/qwen3-next-80b-a3b-instruct')).toBe('text-only')
  })

  it('does not misclassify llama vision variants as text-only', () => {
    // "llama" is a text-only marker, but the explicit "-vision-" suffix wins.
    expect(classifyVisionModel('meta/llama-3.2-90b-vision-instruct')).toBe('vision')
    expect(classifyVisionModel('meta/llama-3.2-11b-vision-instruct')).toBe('vision')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(classifyVisionModel('  GPT-4o-MINI  ')).toBe('vision')
    expect(classifyVisionModel('DEEPSEEK/DeepSeek-Chat')).toBe('text-only')
    // Grok 3 accepts images — must NOT be flagged text-only (falls to unknown).
    expect(classifyVisionModel('x-ai/grok-3')).toBe('unknown')
  })

  it('returns unknown for empty / unrecognized names', () => {
    expect(classifyVisionModel('')).toBe('unknown')
    expect(classifyVisionModel(null)).toBe('unknown')
    expect(classifyVisionModel(undefined)).toBe('unknown')
    expect(classifyVisionModel('custom-model-xyz')).toBe('unknown')
  })
})
