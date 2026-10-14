import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';

// /reactivation-suggestions is on the manager allowlist on the strength of
// "ids + counts only". Pin that: a phone in this response is a PII leak.
const findMany = vi.hoisted(() => vi.fn());
vi.mock('@kanchuki/db', () => ({ prisma: { customer: { findMany } } }));
vi.mock('./growth-campaigns-helpers.js', () => ({ requireGrowth: vi.fn() }));

const { growthCampaignReactivationRoutes } = await import('./growth-campaigns-reactivation.js');

describe('POST /v1/growth/reactivation-suggestions', () => {
  it('returns ids and counts only — no phone numbers', async () => {
    findMany.mockResolvedValue([
      { id: 'c1', name: 'Asha', phone: '9876543210', total_spent: 500_000, last_visit_at: null },
      { id: 'c2', name: 'Ravi', phone: '9123456789', total_spent: 100, last_visit_at: null },
    ]);
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorateRequest('retailerId', '');
    app.addHook('onRequest', async (req) => {
      (req as unknown as Record<string, unknown>).retailerId = 'r1';
    });
    await app.register(growthCampaignReactivationRoutes, { prefix: '/v1/growth' });

    const res = await app.inject({ method: 'POST', url: '/v1/growth/reactivation-suggestions' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toMatch(/9876543210|9123456789|phone/);
    expect(res.json().data.total_inactive).toBe(2);
  });
});
