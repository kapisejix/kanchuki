import { runVisionAsk, type VisionAskRequest } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { recordAiUsage } from '../../lib/ai-usage.js';
import { hasFeature } from '../../lib/features.js';
import { checkQuota, incrementUsage } from '../../lib/quota.js';
import { featureUnavailable, notFound, validationError } from '../../plugins/error-handler.js';

// Roadmap M Phase 1 priorities: Hindi + Hinglish first, then the big regional
// languages. Language → prompt suffix map (kept in one place so adding a
// language is a one-line change).
export const SUPPORTED_LANGUAGES = {
  hindi: 'Hindi (Devanagari script)',
  hinglish: 'Hinglish (Hindi words in Roman script, as spoken on WhatsApp)',
  tamil: 'Tamil',
  telugu: 'Telugu',
  marathi: 'Marathi',
  gujarati: 'Gujarati',
  bengali: 'Bengali',
} as const;

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES;

const LANGUAGE_PROMPT: Record<SupportedLanguage, string> = {
  hindi: 'in Hindi using Devanagari script',
  hinglish: 'in Hinglish (Roman script, natural WhatsApp-style Hindi)', 
  tamil: 'in Tamil (Tamil script)',
  telugu: 'in Telugu (Telugu script)',
  marathi: 'in Marathi (Devanagari script)',
  gujarati: 'in Gujarati (Gujarati script)',
  bengali: 'in Bengali (Bengali script)',
};

export const growthTranslateRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /growth/products/:id/descriptions ─────────────────────
  // AI-generates a localized product description from the product's
  // attributes (no image needed — cheap text call) and caches it on
  // product.metadata.translations.{lang}. Re-running for the same lang
  // returns the cached copy.
  server.post('/products/:id/descriptions', async (request, reply) => {
    const retailerId = request.retailerId;
    if (!(await hasFeature(retailerId, 'GROWTH_ENGINE'))) throw featureUnavailable('Growth tools');
    const { id } = request.params as { id: string };

    const product = await prisma.product.findFirst({
      where: { id, retailer_id: retailerId, deleted_at: null },
    });
    if (!product) throw notFound('Product');

    const body = z
      .object({ language: z.enum(Object.keys(LANGUAGE_PROMPT) as [SupportedLanguage, ...SupportedLanguage[]]) })
      .safeParse(request.body);
    if (!body.success) throw validationError('Unsupported language');

    const language = body.data.language;
    const metadata = (product.metadata as Record<string, unknown> | null) ?? {};
    const translations = (metadata.translations as Record<string, string> | null) ?? {};
    const cached = translations[language];
    if (cached) return reply.send({ data: { product_id: id, language, description: cached, cached: true } });

    // Metered like tagging: AI_TAGGING_CALL quota + per-call usage log.
    await checkQuota(retailerId, 'AI_TAGGING_CALL');
    await incrementUsage(retailerId, 'AI_TAGGING_CALL');

    const attrs = [
      product.name,
      product.category,
      product.subtype,
      product.primary_color,
      product.fabric_estimate,
      product.pattern,
      product.description,
      product.sizes.length ? `Sizes: ${product.sizes.join(', ')}` : null,
      product.price_min ? `Price: ₹${(product.price_min / 100).toFixed(0)}` : null,
    ]
      .filter(Boolean)
      .join('. ');

    const req: VisionAskRequest = {
      resourceType: 'AI_TAGGING_CALL',
      onProviderUsed: recordAiUsage(retailerId),
      images: [],
      systemPrompt:
        'You are a fashion copywriter for an Indian clothing store. Write short, friendly, accurate product descriptions in the requested language.',
      userPrompt: `Write a 2-3 sentence product description (no emojis, no prices unless given) ${LANGUAGE_PROMPT[language]}. Base it ONLY on these facts:\n\n${attrs || 'A new Indian fashion product.'}\n\nReturn only the description text.`,
      maxTokens: 300,
    };
    const description = await runVisionAsk(req).catch((err: unknown) => {
      throw validationError(`AI description failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    });

    const clean = description.trim().replace(/\s+/g, ' ');
    if (!clean) throw validationError('AI returned an empty description — try again');

    await prisma.product.update({
      where: { id },
      data: { metadata: { ...metadata, translations: { ...translations, [language]: clean } } },
    });
    return reply.send({ data: { product_id: id, language, description: clean, cached: false } });
  });

  // ─── POST /growth/translate/message ──────────────────────────────
  // Roadmap M — WhatsApp messages & campaign templates in regional
  // languages. Localizes a message template into a language, preserving
  // {{placeholders}} verbatim so send-time fill still works. Stateless
  // (no cache — templates are short and retailer-edited); metered like
  // tagging.
  server.post('/translate/message', async (request, reply) => {
    const retailerId = request.retailerId;
    if (!(await hasFeature(retailerId, 'GROWTH_ENGINE'))) throw featureUnavailable('Growth tools');

    const body = z
      .object({
        message: z.string().min(1).max(2000),
        language: z.enum(Object.keys(LANGUAGE_PROMPT) as [SupportedLanguage, ...SupportedLanguage[]]),
        // Optional product context so the copywriter can stay on-topic.
        context: z.string().max(300).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError('message and language are required');

    const { message, language, context } = body.data;

    await checkQuota(retailerId, 'AI_TAGGING_CALL');
    await incrementUsage(retailerId, 'AI_TAGGING_CALL');

    const req: VisionAskRequest = {
      resourceType: 'AI_TAGGING_CALL',
      onProviderUsed: recordAiUsage(retailerId),
      images: [],
      systemPrompt:
        'You are a WhatsApp marketing copywriter for an Indian clothing store. Rewrite messages naturally in the requested language, keeping a warm, short, sales-friendly tone.',
      userPrompt: `Rewrite this WhatsApp message ${LANGUAGE_PROMPT[language]}. Keep the same meaning and length. Preserve {{placeholders}} (e.g. {{name}}, {{shop}}, {{link}}) EXACTLY as-is — they are filled per customer later and must not be translated, reordered, or removed.${
        context ? `\n\nContext about the offer/products: ${context}` : ''
      }\n\nMessage to translate:\n${message}\n\nReturn only the translated message text.`,
      maxTokens: 500,
    };
    const translated = await runVisionAsk(req).catch((err: unknown) => {
      throw validationError(`AI translation failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    });

    const clean = translated.trim().replace(/\s+/g, ' ');
    if (!clean) throw validationError('AI returned an empty message — try again');

    return reply.send({ data: { message: clean, language, placeholders_preserved: true } });
  });
};
