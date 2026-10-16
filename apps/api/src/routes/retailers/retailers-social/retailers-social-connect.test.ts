// RC-060: auto-connect returned a fabricated `connected: true` account
// (@boutique_official) whenever Meta credentials were missing. This fails if
// any unconfigured environment can report a connection again.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

const { mockResolveMeta, mockConsumeState, mockUpsert } = vi.hoisted(() => ({
  mockResolveMeta: vi.fn(),
  mockConsumeState: vi.fn(),
  mockUpsert: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: { socialAccount: { upsert: mockUpsert } },
  encryptSecret: (s: string) => `enc:${s}`,
}));

vi.mock('../../../lib/meta-graph.js', () => ({
  resolveMetaCredentials: mockResolveMeta,
  buildOAuthUrl: vi.fn(),
  exchangeCodeForToken: vi.fn(),
  exchangeUserTokenForLongLived: vi.fn(),
  listInstagramAccounts: vi.fn(),
  listPages: vi.fn(),
}));

vi.mock('./retailers-social-helpers.js', () => ({
  STATE_TTL_SEC: 600,
  consumeOAuthState: mockConsumeState,
  createOAuthState: vi.fn(),
  getInstagramAccountId: vi.fn(),
  getStateRedis: vi.fn(),
}));

const { retailersSocialConnectRoutes } = await import('./retailers-social-connect.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = 'retailer_1';
  });
  await app.register(retailersSocialConnectRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockConsumeState.mockResolvedValue('retailer_1');
});

describe('POST /me/social/auto-connect without Meta credentials (RC-060)', () => {
  it.each(['instagram', 'facebook'])('%s → 503, never a simulated connection', async (provider) => {
    mockResolveMeta.mockResolvedValue(null);
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/social/auto-connect',
      payload: { code: 'c', state: 's', provider },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().data).toBeUndefined();
    expect(mockUpsert).not.toHaveBeenCalled();
    await app.close();
  });
});
