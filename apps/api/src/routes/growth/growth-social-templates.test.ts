// RC-102: POST /social-templates/:id/generate enqueues a studio-shoot job. The job no longer
// increments STUDIO_SHOOT usage (it only refunds a reservation), so this route must reserve
// one slot per enqueue and hand it back if the enqueue fails - otherwise the path is unmetered.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockTemplateFind,
  mockPhotoFind,
  mockAddJob,
  mockReserve,
  mockRefund,
  mockHasFeature,
  mockResolveStyle,
} = vi.hoisted(() => ({
  mockTemplateFind: vi.fn(),
  mockPhotoFind: vi.fn(),
  mockAddJob: vi.fn(),
  mockReserve: vi.fn(),
  mockRefund: vi.fn(),
  mockHasFeature: vi.fn(),
  mockResolveStyle: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    socialTemplate: { findFirst: mockTemplateFind },
    productPhoto: { findFirst: mockPhotoFind },
  },
}));
vi.mock('../../jobs/index.js', () => ({ addStudioShootJob: mockAddJob }));
vi.mock('../../lib/features.js', () => ({ hasFeature: mockHasFeature }));
vi.mock('../../lib/quota.js', () => ({ reserveJobQuota: mockReserve, refundJobQuota: mockRefund }));
vi.mock('../../lib/studio-shoot.js', () => ({
  getStudioJobStatus: vi.fn(),
  isStudioShootConfigured: () => true,
  resolveStudioStyleJob: mockResolveStyle,
}));

import { errorHandler, planLimitExceeded } from '../../plugins/error-handler.js';
import { growthSocialTemplateRoutes } from './growth-social-templates.js';

const RETAILER = 'ret_1';

async function generate() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('onRequest', async (req) => {
    (req as unknown as { retailerId: string }).retailerId = RETAILER;
  });
  await app.register(growthSocialTemplateRoutes, { prefix: '/growth' });
  await app.ready();
  return app.inject({ method: 'POST', url: '/growth/social-templates/t1/generate', payload: {} });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockHasFeature.mockResolvedValue(true);
  mockTemplateFind.mockResolvedValue({ id: 't1', product_ids: ['p1'], background_style: 'gold' });
  mockPhotoFind.mockResolvedValue({ id: 'ph1' });
  mockResolveStyle.mockResolvedValue({ slug: 'gold', prompt: 'x', tab: 'no_model' });
  mockAddJob.mockResolvedValue(undefined);
  mockReserve.mockResolvedValue(undefined);
  mockRefund.mockResolvedValue(undefined);
});

describe('POST /social-templates/:id/generate quota', () => {
  it('reserves one STUDIO_SHOOT slot under the enqueued job id', async () => {
    const res = await generate();
    expect(res.statusCode).toBe(202);
    const jobId = res.json().data.job_id;
    expect(mockReserve).toHaveBeenCalledWith(RETAILER, 'STUDIO_SHOOT', jobId);
    expect(mockAddJob.mock.calls[0]?.[0].job_id).toBe(jobId);
    expect(mockRefund).not.toHaveBeenCalled();
  });

  it('402 when the reserve loses the limit: nothing is enqueued', async () => {
    mockReserve.mockRejectedValue(planLimitExceeded('studio shoot'));
    const res = await generate();
    expect(res.statusCode).toBe(402);
    expect(mockAddJob).not.toHaveBeenCalled();
  });

  it('a failed enqueue hands the slot back', async () => {
    mockAddJob.mockRejectedValue(new Error('redis down'));
    const res = await generate();
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(mockRefund).toHaveBeenCalledWith(mockReserve.mock.calls[0]?.[2], 'STUDIO_SHOOT');
  });
});
