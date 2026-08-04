// Auto-split from admin-settings.ts (scripts/check-route-size.sh) — route bodies verbatim.
import { DEFAULT_PLATFORM_THEME, type PlatformTheme } from '@kanchuki/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { adminAuthPreHandler } from '../admin.js';
import { getSetting, saveSetting } from './settings-store.js';

// Same audit-log-as-key-value-store pattern as rate limits / AI config —
// no new Prisma model needed. Read by apps/web (primary color → CSS var
// injected server-side) and apps/mobile (full palette fetched at launch, see
// src/lib/theme.tsx) so a palette change doesn't need a new app build. Six
// tokens, defined in packages/shared/src/theme.ts — a partial PUT merges
// over the current saved theme.
const THEME_SETTING_KEY = 'app_theme';

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const THEME_BODY_SCHEMA = z
  .object({
    primary_color: z
      .string()
      .regex(HEX_COLOR_RE, 'Must be a 6-digit hex color like #1E2A3D')
      .optional(),
    accent_color: z.string().regex(HEX_COLOR_RE, 'Must be a 6-digit hex color').optional(),
    tertiary_color: z.string().regex(HEX_COLOR_RE, 'Must be a 6-digit hex color').optional(),
    background_color: z.string().regex(HEX_COLOR_RE, 'Must be a 6-digit hex color').optional(),
    text_color: z.string().regex(HEX_COLOR_RE, 'Must be a 6-digit hex color').optional(),
    surface_color: z.string().regex(HEX_COLOR_RE, 'Must be a 6-digit hex color').optional(),
  })
  .refine((body) => Object.values(body).some((v) => typeof v === 'string'), {
    message: 'Provide at least one color to update',
  });

/**
 * Get the current platform theme (falls back to DEFAULT_PLATFORM_THEME).
 * Used by the public /v1/public/theme route — no admin auth needed to read it.
 * Legacy settings saved with only `primary_color` merge over the defaults,
 * so every other token keeps its shipped value until explicitly changed.
 */
export async function getTheme(): Promise<PlatformTheme> {
  const saved = (await getSetting(THEME_SETTING_KEY)) as Partial<PlatformTheme> | null;
  return {
    primary_color: saved?.primary_color ?? DEFAULT_PLATFORM_THEME.primary_color,
    accent_color: saved?.accent_color ?? DEFAULT_PLATFORM_THEME.accent_color,
    tertiary_color: saved?.tertiary_color ?? DEFAULT_PLATFORM_THEME.tertiary_color,
    background_color: saved?.background_color ?? DEFAULT_PLATFORM_THEME.background_color,
    text_color: saved?.text_color ?? DEFAULT_PLATFORM_THEME.text_color,
    surface_color: saved?.surface_color ?? DEFAULT_PLATFORM_THEME.surface_color,
  };
}

export const adminThemeRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', adminAuthPreHandler);

  server.get('/settings/theme', async () => {
    const data = await getTheme();
    return { data };
  });

  server.put('/settings/theme', async (request) => {
    const body = THEME_BODY_SCHEMA.parse(request.body);

    // Partial update: merge over the currently-live theme so admins can
    // edit one token at a time without resetting the rest (and legacy
    // single-color PUTs keep working).
    const current = await getTheme();
    const merged: PlatformTheme = { ...current, ...body };

    await saveSetting(THEME_SETTING_KEY, merged);
    request.log.info({ merged }, 'Platform theme updated');

    return { data: merged };
  });
};
