import { randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PLATFORM_THEME } from '@kanchuki/shared';
import { errorHandler } from '../plugins/error-handler.js';
import { adminSettingsRoutes } from './admin-settings.js';

// ─── Mock Prisma (vi.hoisted to avoid Vitest hoisting TDZ issue) ─
// The theme endpoints use the audit-log-as-key-value-store pattern:
//   getSetting  → prisma.auditLog.findFirst  (most recent SETTING_* entry)
//   saveSetting → prisma.auditLog.create     (new SETTING_* entry)
// A module-level themeStore simulates that store so PUT → GET round-trips.

const { mockAuditLogFindFirst, mockAuditLogCreate } = vi.hoisted(() => ({
  mockAuditLogFindFirst: vi.fn(),
  mockAuditLogCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    auditLog: {
      findFirst: mockAuditLogFindFirst,
      create: mockAuditLogCreate,
    },
  },
  Prisma: {},
}));

// ─── Test Helpers ──────────────────────────────────────────────────

const ADMIN_KEY = 'test-admin-key-12345';
const THEME_SETTING_ACTION = 'SETTING_app_theme';

/** Simulated audit-log store — the most recent SETTING_app_theme metadata. */
let themeStore: Record<string, unknown> | null = null;

type AuditLogFindFirstArgs = {
  where?: { action?: string; resource_type?: string };
};

type AuditLogCreateArgs = {
  data?: { action?: string; metadata?: Record<string, unknown> };
};

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(cookie, { secret: 'test-cookie-secret' });
  await app.register(adminSettingsRoutes, { prefix: '/v1/admin' });
  await app.ready();
  return app;
}

function authedHeaders() {
  return { 'x-admin-key': ADMIN_KEY };
}

/** CSRF headers for mutating requests — cookie must match x-csrf-token. */
function csrfHeaders() {
  const token = randomBytes(16).toString('hex');
  return {
    ...authedHeaders(),
    'x-csrf-token': token,
    cookie: `csrf-token=${token}`,
    'content-type': 'application/json',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  themeStore = null;

  mockAuditLogFindFirst.mockImplementation(
    async (args: AuditLogFindFirstArgs) => {
      if (args?.where?.action !== THEME_SETTING_ACTION) return null;
      return themeStore ? { metadata: themeStore } : null;
    },
  );

  mockAuditLogCreate.mockImplementation(async (args: AuditLogCreateArgs) => {
    if (args?.data?.action === THEME_SETTING_ACTION) {
      themeStore = args.data.metadata ?? null;
    }
    return { id: 'audit_1', ...args.data };
  });
});

// ─── Theme API — Round-Trip Tests ──────────────────────────────────

describe('Platform theme API', () => {
  it('GET /settings/theme returns the default platform theme when none saved', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/settings/theme',
      headers: authedHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual(DEFAULT_PLATFORM_THEME);
    await app.close();
  });

  it('PUT with a single legacy primary_color merges over the defaults', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/theme',
      headers: csrfHeaders(),
      payload: { primary_color: '#FF0000' },
    });
    expect(res.statusCode).toBe(200);

    const data = res.json().data;
    expect(data.primary_color).toBe('#FF0000');
    // every other token keeps its default
    expect(data.accent_color).toBe(DEFAULT_PLATFORM_THEME.accent_color);
    expect(data.tertiary_color).toBe(DEFAULT_PLATFORM_THEME.tertiary_color);
    expect(data.background_color).toBe(DEFAULT_PLATFORM_THEME.background_color);
    expect(data.text_color).toBe(DEFAULT_PLATFORM_THEME.text_color);
    expect(data.surface_color).toBe(DEFAULT_PLATFORM_THEME.surface_color);

    // persisted through the audit-log-as-key-value-store
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: THEME_SETTING_ACTION,
          resource_type: 'AdminSetting',
          metadata: expect.objectContaining({ primary_color: '#FF0000' }),
        }),
      }),
    );
    await app.close();
  });

  it('round-trips a full palette: PUT then GET return the same six tokens', async () => {
    const palette = {
      primary_color: '#0B1F3A',
      accent_color: '#E8A33D',
      tertiary_color: '#6F4B14',
      background_color: '#FAF7F2',
      text_color: '#1A1A1A',
      surface_color: '#F0EBE3',
    };

    const app = await buildApp();

    const put = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/theme',
      headers: csrfHeaders(),
      payload: palette,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().data).toEqual(palette);

    const get = await app.inject({
      method: 'GET',
      url: '/v1/admin/settings/theme',
      headers: authedHeaders(),
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data).toEqual(palette);
    await app.close();
  });

  it('incremental partial edits accumulate across PUTs', async () => {
    const app = await buildApp();

    const first = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/theme',
      headers: csrfHeaders(),
      payload: { primary_color: '#FF0000' },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/theme',
      headers: csrfHeaders(),
      payload: { accent_color: '#00FF00' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.primary_color).toBe('#FF0000');
    expect(second.json().data.accent_color).toBe('#00FF00');

    const get = await app.inject({
      method: 'GET',
      url: '/v1/admin/settings/theme',
      headers: authedHeaders(),
    });
    expect(get.json().data).toEqual({
      primary_color: '#FF0000',
      accent_color: '#00FF00',
      tertiary_color: DEFAULT_PLATFORM_THEME.tertiary_color,
      background_color: DEFAULT_PLATFORM_THEME.background_color,
      text_color: DEFAULT_PLATFORM_THEME.text_color,
      surface_color: DEFAULT_PLATFORM_THEME.surface_color,
    });
    await app.close();
  });

  it('rejects a non-hex color value with 422', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/theme',
      headers: csrfHeaders(),
      payload: { primary_color: 'not-a-color' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('rejects a PUT with no color fields (at least one required)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/theme',
      headers: csrfHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('rejects GET without an admin key (403)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/admin/settings/theme',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    await app.close();
  });

  it('rejects PUT without CSRF tokens (403)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/admin/settings/theme',
      headers: authedHeaders(),
      payload: { primary_color: '#FF0000' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    await app.close();
  });
});
