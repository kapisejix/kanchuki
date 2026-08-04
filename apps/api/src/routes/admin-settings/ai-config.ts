// Auto-split from admin-settings.ts (scripts/check-route-size.sh) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin.js';
import { getSetting, saveSetting } from './settings-store.js';

const AI_CONFIG_SETTING_KEY = 'ai_model_config';

export const DEFAULT_AI_CONFIG: Record<
  string,
  { model: string; temperature: number; max_tokens: number; timeout_ms: number }
> = {
  product_tagging: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.1,
    max_tokens: 2000,
    timeout_ms: 30000,
  },
  embedding_generation: {
    model: 'text-embedding-3-small',
    temperature: 0,
    max_tokens: 0,
    timeout_ms: 15000,
  },
  try_on: { model: 'fashion-vtone-v1.5', temperature: 0, max_tokens: 0, timeout_ms: 120000 },
  color_detection: {
    model: 'claude-3-haiku-20240307',
    temperature: 0.1,
    max_tokens: 500,
    timeout_ms: 15000,
  },
  multi_item_detection: {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.2,
    max_tokens: 3000,
    timeout_ms: 45000,
  },
  fashion_dna: {
    model: 'text-embedding-3-small',
    temperature: 0,
    max_tokens: 0,
    timeout_ms: 30000,
  },
};

export const adminAiConfigRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/settings/ai-config', async () => {
    const saved = await getSetting(AI_CONFIG_SETTING_KEY);
    const config = saved as Record<
      string,
      { model: string; temperature: number; max_tokens: number; timeout_ms: number }
    > | null;

    const merged: Record<
      string,
      {
        model: string;
        temperature: number;
        max_tokens: number;
        timeout_ms: number;
        is_default: boolean;
      }
    > = {};
    for (const [key, def] of Object.entries(DEFAULT_AI_CONFIG)) {
      const savedVal = config?.[key];
      merged[key] = {
        model: savedVal?.model ?? def.model,
        temperature: savedVal?.temperature ?? def.temperature,
        max_tokens: savedVal?.max_tokens ?? def.max_tokens,
        timeout_ms: savedVal?.timeout_ms ?? def.timeout_ms,
        is_default: !savedVal,
      };
    }
    return { data: merged };
  });

  server.put('/settings/ai-config', async (request) => {
    const body = z
      .object({
        configs: z.record(
          z.string(),
          z.object({
            model: z.string().min(1).max(200),
            temperature: z.number().min(0).max(2),
            max_tokens: z.number().int().min(0).max(100000),
            timeout_ms: z.number().int().min(1000).max(600000),
          }),
        ),
      })
      .parse(request.body);

    for (const key of Object.keys(body.configs)) {
      if (!DEFAULT_AI_CONFIG[key]) {
        throw validationError(`Unknown AI config key: ${key}`);
      }
    }

    const merged: Record<
      string,
      { model: string; temperature: number; max_tokens: number; timeout_ms: number }
    > = {};
    for (const [key, def] of Object.entries(DEFAULT_AI_CONFIG)) {
      merged[key] = body.configs[key] ?? def;
    }

    await saveSetting(AI_CONFIG_SETTING_KEY, merged as unknown as Record<string, unknown>);
    request.log.info('AI model config updated');

    return { data: merged };
  });
};
