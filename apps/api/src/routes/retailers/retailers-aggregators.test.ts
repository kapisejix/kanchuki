// RC-056: Marketplace Sync wrote status CONNECTED on connect and on "sync"
// with no marketplace call or job behind it. These tests fail if any route
// writes a ChannelSync row again before a real channel adapter exists.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { retailersAggregatorRoutes } from './retailers-aggregators.js';

const { mockCreate, mockUpdate, mockFindFirst, mockHasFeature } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockFindFirst: vi.fn(),
  mockHasFeature: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    channelSync: { create: mockCreate, update: mockUpdate, findFirst: mockFindFirst },
    auditLog: { create: vi.fn() },
  },
  encryptSecret: (s: string) => `enc:${s}`,
}));

vi.mock('../../lib/features.js', () => ({ hasFeature: mockHasFeature }));

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = 'retailer_1';
  });
  await app.register(retailersAggregatorRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasFeature.mockResolvedValue(true);
  mockFindFirst.mockResolvedValue({ id: 'cs1', retailer_id: 'retailer_1', channel: 'MEESHO', status: 'DISCONNECTED' });
});

describe('Marketplace Sync is not available yet (RC-056)', () => {
  it('connect returns 501 and stores nothing', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/me/aggregators',
      payload: { channel: 'MEESHO', api_key: 'k' },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('NOT_AVAILABLE');
    expect(mockCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('sync returns 501 and never marks the channel CONNECTED', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/me/aggregators/cs1/sync' });
    expect(res.statusCode).toBe(501);
    expect(mockUpdate).not.toHaveBeenCalled();
    await app.close();
  });

  it('still enforces the plan gate first', async () => {
    mockHasFeature.mockResolvedValue(false);
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: '/me/aggregators/cs1/sync' });
    expect(res.statusCode).toBe(402);
    await app.close();
  });
});
