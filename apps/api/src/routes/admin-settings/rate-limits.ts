// Auto-split from admin-settings.ts (scripts/check-route-size.sh) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';
import { adminAuthPreHandler } from '../admin.js';
import { getSetting, saveSetting } from './settings-store.js';

export const DEFAULT_RATE_LIMITS: Record<
  string,
  { window_ms: number; max_requests: number; description: string }
> = {
  'products:create': {
    window_ms: 60_000,
    max_requests: 60,
    description: 'Product creation per minute',
  },
  'products:upload': {
    window_ms: 60_000,
    max_requests: 20,
    description: 'File upload URLs per minute',
  },
  'ai:tag': { window_ms: 3_600_000, max_requests: 200, description: 'AI tagging calls per hour' },
  'collections:create': {
    window_ms: 60_000,
    max_requests: 30,
    description: 'Collection creation per minute',
  },
  'tryon:initiate': {
    window_ms: 3_600_000,
    max_requests: 50,
    description: 'Try-on initiations per hour',
  },
  'auth:otp': {
    window_ms: 900_000,
    max_requests: 3,
    description: 'OTP requests per 15min per phone',
  },
  'checkout:create': {
    window_ms: 60_000,
    max_requests: 10,
    description: 'Order creation per minute',
  },
  'webhook:razorpay': {
    window_ms: 60_000,
    max_requests: 30,
    description: 'Razorpay webhooks per minute',
  },
  'webhook:msg91': {
    window_ms: 60_000,
    max_requests: 60,
    description: 'MSG91 event webhooks per minute',
  },
};

// In-memory cache (populated from audit log on first load)
let cachedRateLimits: Record<
  string,
  { window_ms: number; max_requests: number; description: string }
> | null = null;

const RATE_LIMIT_SETTING_KEY = 'rate_limits';

/**
 * Get cached rate limits for use by the rate limiter middleware.
 */
export function getCachedRateLimits(): Record<
  string,
  { window_ms: number; max_requests: number; description: string }
> {
  return cachedRateLimits ?? DEFAULT_RATE_LIMITS;
}

export const adminRateLimitsRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/settings/rate-limits', async () => {
    const saved = await getSetting(RATE_LIMIT_SETTING_KEY);
    const limits = saved as Record<
      string,
      { window_ms: number; max_requests: number; description: string }
    > | null;

    const merged: Record<
      string,
      { window_ms: number; max_requests: number; description: string; is_default: boolean }
    > = {};
    for (const [key, def] of Object.entries(DEFAULT_RATE_LIMITS)) {
      const savedVal = limits?.[key];
      merged[key] = {
        window_ms: savedVal?.window_ms ?? def.window_ms,
        max_requests: savedVal?.max_requests ?? def.max_requests,
        description: def.description,
        is_default: !savedVal,
      };
    }
    return { data: merged };
  });

  server.put('/settings/rate-limits', async (request) => {
    const body = z
      .object({
        limits: z.record(
          z.string(),
          z.object({
            window_ms: z.number().int().min(1000).max(86400000),
            max_requests: z.number().int().min(1).max(10000),
          }),
        ),
      })
      .parse(request.body);

    // Validate keys exist in defaults
    for (const key of Object.keys(body.limits)) {
      if (!DEFAULT_RATE_LIMITS[key]) {
        throw validationError(`Unknown rate limit key: ${key}`);
      }
    }

    // Merge with defaults to preserve descriptions
    const merged: Record<string, { window_ms: number; max_requests: number; description: string }> =
      {};
    for (const [key, def] of Object.entries(DEFAULT_RATE_LIMITS)) {
      if (body.limits[key]) {
        merged[key] = { ...body.limits[key], description: def.description };
      } else {
        merged[key] = def;
      }
    }

    await saveSetting(RATE_LIMIT_SETTING_KEY, merged as unknown as Record<string, unknown>);
    cachedRateLimits = merged;

    request.log.info('Rate limits updated');
    return { data: merged };
  });

  /**
   * Get effective rate limit for a given endpoint key.
   * Called by the rate limiter middleware at startup.
   */
  server.get('/settings/rate-limits/:key', async (request) => {
    const { key } = z.object({ key: z.string() }).parse(request.params);
    const saved = await getSetting(RATE_LIMIT_SETTING_KEY);
    const limits = saved as Record<string, { window_ms: number; max_requests: number }> | null;

    if (limits?.[key]) {
      return { data: limits[key] };
    }
    if (DEFAULT_RATE_LIMITS[key]) {
      return { data: DEFAULT_RATE_LIMITS[key] };
    }
    throw notFound(`Rate limit '${key}' not found`);
  });
};
