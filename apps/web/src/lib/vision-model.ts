/**
 * Vision-capability classifier for AI provider model names.
 *
 * AI tagging sends product *images* to the model. A text-only model can't
 * serve that request — every tagging call would fail, burn quota, and fail
 * over to the next provider (or halt tagging entirely if it's the last one).
 * This helper classifies a model name string so the AI Providers admin page
 * can badge rows ("Vision" / "Text-only") and warn the admin before a
 * text-only model is silently picked for tagging.
 *
 * This is a best-effort heuristic over a free-form model name — it can never
 * be perfectly complete. It errs toward "unknown" rather than guessing:
 * a model we can't identify is flagged as unverified instead of silently
 * assumed vision-capable.
 */

export type VisionCapability = 'vision' | 'text-only' | 'unknown'

/**
 * Model families known to accept image inputs. Substring match on the
 * lowercased name — these markers are unambiguous enough that a hit is
 * trustworthy (e.g. "gpt-4o", "claude", "gemini", "...-vision-...").
 */
const VISION_MARKERS = [
  'vision', // llama-3.2-*-vision, gpt-4-vision, phi-3-vision, ...
  'gpt-4o',
  'gpt-4.1',
  'gpt-4.5',
  'gpt-4-turbo',
  'gpt-5',
  'claude',
  'gemini', // all Gemini models are multimodal
  'gemma-3',
  'llama-4', // Llama 4 Scout/Maverick are natively multimodal
  'llava',
  'pixtral',
  'moondream',
  'idefics',
  'paligemma',
  'fuyu',
  'qwen-vl', // Qwen vision-language line: qwen-vl / qwen2-vl / qwen2.5-vl / qwen3-vl
  'qwen2-vl',
  'qwen2.5-vl',
  'qwen3-vl',
  'internvl',
  'phi-3-vision',
  'phi-4-multimodal',
  'minicpm-v',
  'smolvlm',
  'molmo',
  'xgen-mm',
  'florence',
  'kosmos',
]

/**
 * Model families known to be text-only (no image input). Checked AFTER the
 * vision markers, so "llama-3.2-90b-vision" is caught by "vision" before the
 * generic "llama" text marker applies. Substring match, so provider prefixes
 * ("meta/llama-3.3-70b-instruct") and OpenRouter-style names work too.
 */
const TEXT_ONLY_MARKERS = [
  // Specific llama families, not bare "llama" — llama-4 is multimodal and
  // llama-3.2-*-vision variants are caught by "vision" above.
  'llama-3.1',
  'llama-3.2',
  'llama-3.3',
  'deepseek', // deepseek-chat / deepseek-reasoner
  'mixtral',
  'mistral',
  'gemma-2', // gemma-3 is vision-capable (caught above)
  'nemotron',
  'solar',
  'seed-oss',
  'command-r',
  'gpt-3.5',
  'gpt-4-base',
  // Note: no bare 'grok-3' marker — Grok 3 accepts image inputs, so grok
  // models resolve to 'unknown' (the safe default) rather than a wrong warning.
  'qwen3', // qwen3 / qwen3-next are text-only; qwen*-vl variants are caught above
]

/** Classify a single model name string. */
export function classifyVisionModel(modelName: string | null | undefined): VisionCapability {
  if (!modelName) return 'unknown'
  const name = modelName.trim().toLowerCase()
  if (!name) return 'unknown'

  if (VISION_MARKERS.some((marker) => name.includes(marker))) return 'vision'
  if (TEXT_ONLY_MARKERS.some((marker) => name.includes(marker))) return 'text-only'
  return 'unknown'
}
