// F-045 T8: PATCH /v1/public/passport/style-quiz
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../../plugins/error-handler.js';

const { mockSession, mockUpdate, mockFamilies } = vi.hoisted(() => ({
  mockSession: vi.fn(),
  mockUpdate: vi.fn(),
  mockFamilies: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({ prisma: { customerAccount: { update: mockUpdate } } }));
vi.mock('../passport-helpers.js', () => ({ getPassportSession: mockSession }));
vi.mock('../../../../lib/color-families.js', () => ({ getActiveColorFamilies: mockFamilies }));

const { passportStyleQuizRoutes } = await import('../passport-style-quiz.js');

async function patch(payload: unknown) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(passportStyleQuizRoutes, { prefix: '/v1/public/passport' });
  await app.ready();
  const res = await app.inject({
    method: 'PATCH',
    url: '/v1/public/passport/style-quiz',
    payload: payload as object,
  });
  await app.close();
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.mockResolvedValue({ customer_account_id: 'acct_a' });
  mockUpdate.mockResolvedValue({});
  mockFamilies.mockResolvedValue([
    { name: 'red', aliases: [] },
    { name: 'maroon', aliases: [] },
  ]);
});

describe('PATCH /passport/style-quiz', () => {
  it('401 without a passport session, and writes nothing', async () => {
    mockSession.mockResolvedValue(null);
    const res = await patch({ fabric: ['Silk'] });
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('maps the quiz labels and updates ONLY the signed-in account', async () => {
    const res = await patch({
      occasion: ['Wedding / Bridal'],
      budget: ['₹500 – ₹1,500'],
      color: ['Red / Maroon'],
    });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'acct_a' },
      data: {
        pref_occasions: ['wedding'],
        pref_colors: ['red', 'maroon'],
        budget_min: 50_000,
        budget_max: 150_000,
      },
    });
  });

  it('a partial body leaves the other columns out of the update', async () => {
    await patch({ fabric: ['Silk'] });
    expect(mockUpdate.mock.calls[0]?.[0].data).toEqual({ pref_fabrics: ['silk'] });
  });

  it('uses the DB colour families when available', async () => {
    mockFamilies.mockResolvedValue([{ name: 'maroon', aliases: ['red'] }]);
    await patch({ color: ['Red'] });
    expect(mockUpdate.mock.calls[0]?.[0].data.pref_colors).toEqual(['maroon']);
  });

  it('still saves (built-in families) when the family lookup fails', async () => {
    mockFamilies.mockRejectedValue(new Error('db down'));
    const res = await patch({ color: ['Black'] });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate.mock.calls[0]?.[0].data.pref_colors).toEqual(['black']);
  });

  it.each([
    ['empty body', {}],
    ['unknown key (cannot write other columns)', { name: 'x', fabric: ['Silk'] }],
    ['non-array answer', { fabric: 'Silk' }],
    ['too many answers', { color: Array.from({ length: 13 }, (_, i) => `c${i}`) }],
    ['overlong label', { fabric: ['x'.repeat(41)] }],
  ])('400 for %s', async (_label, payload) => {
    const res = await patch(payload);
    expect(res.statusCode).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
