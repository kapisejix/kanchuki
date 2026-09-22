// Route tests for the retailer affiliate referral code + link (T3).
// Spec: docs/tasks/referral-program-retailer-affiliate.md §7 T3.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { retailersReferralRoutes } from './retailers-referral.js';

const { mockReferralCodeFindUnique, mockReferralCodeCreate } = vi.hoisted(() => ({
  mockReferralCodeFindUnique: vi.fn(),
  mockReferralCodeCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    referralCode: {
      findUnique: mockReferralCodeFindUnique,
      create: mockReferralCodeCreate,
    },
  },
  Prisma: {},
}));

const RETAILER_ID = 'ret_1';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

function row(overrides: Partial<{ code: string; is_active: boolean; created_at: Date }> = {}) {
  return {
    code: 'KAN-7F3QMP',
    is_active: true,
    created_at: new Date('2026-09-22T10:00:00.000Z'),
    ...overrides,
  };
}

async function buildApp(captureError?: (err: unknown) => void) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  // An unexpected 500 is deliberately sanitised to "Something went wrong" by the
  // shared errorHandler — leaking a raw DB error to a client is its own bug. So
  // "the real error is thrown, not a constant" cannot be asserted on the response
  // body; it is asserted on the error object that actually reached the framework.
  if (captureError) {
    app.addHook('onError', async (_request, _reply, err) => {
      captureError(err);
    });
  }
  await app.register(retailersReferralRoutes);
  await app.ready();
  return app;
}

/** A P2002 as Prisma raises it — detection is on `.code`, per the fan-out rows. */
function uniqueViolation(target?: string) {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target } });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WEB_URL = 'https://kanchuki.app';
});

describe('GET /me/referral-code', () => {
  it('is registered and resolves (RC-025 — the URL works, not just the file)', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(row());
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/referral-code' });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns the existing code untouched — never re-mints, because links are already shared', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(row({ code: 'KAN-AAAAAA' }));
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/referral-code' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      code: 'KAN-AAAAAA',
      link: 'https://kanchuki.app/for-retailers?ref=KAN-AAAAAA',
      is_active: true,
    });
    expect(mockReferralCodeCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('mints a namespaced code on the retailer first request', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(null);
    mockReferralCodeCreate.mockImplementation(async ({ data }: { data: { code: string } }) =>
      row({ code: data.code }),
    );
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/referral-code' });

    expect(res.statusCode).toBe(200);
    const data = res.json().data as { code: string; link: string };
    // The affiliate namespace, asserted at the boundary: this is what makes the
    // typed code distinguishable from an F-018 staff code at signup.
    expect(data.code).toMatch(/^KAN-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(data.link).toBe(`https://kanchuki.app/for-retailers?ref=${data.code}`);
    expect(mockReferralCodeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ retailer_id: RETAILER_ID }) }),
    );
    await app.close();
  });

  it('reconciles a concurrent first request to the winner instead of minting a second code', async () => {
    // Two first-requests race: our create loses on retailer_id. Before the
    // reconcile this was a 500 and the retailer saw an error on a happy path.
    mockReferralCodeCreate.mockRejectedValue(uniqueViolation('retailer_id'));
    mockReferralCodeFindUnique
      .mockResolvedValueOnce(null) // the pre-check
      .mockResolvedValueOnce(row({ code: 'KAN-WINNER' })); // the twin's row

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/referral-code' });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.code).toBe('KAN-WINNER');
    expect(mockReferralCodeCreate).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('retries on a code collision rather than failing the retailer request', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(null); // nothing on retailer_id either time
    mockReferralCodeCreate
      .mockRejectedValueOnce(uniqueViolation('code'))
      .mockImplementationOnce(async ({ data }: { data: { code: string } }) =>
        row({ code: data.code }),
      );

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/me/referral-code' });

    expect(res.statusCode).toBe(200);
    expect(mockReferralCodeCreate).toHaveBeenCalledTimes(2);
    // The two attempts must not reuse the same code — a retry of the same value
    // would just collide again.
    const [first, second] = mockReferralCodeCreate.mock.calls.map(
      (c) => (c[0] as { data: { code: string } }).data.code,
    );
    expect(first).not.toBe(second);
    await app.close();
  });

  it('does not retry a non-unique-violation failure, and rethrows the real error', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(null);
    const boom = new Error('connection terminated unexpectedly');
    mockReferralCodeCreate.mockRejectedValue(boom);
    const seen: unknown[] = [];

    const app = await buildApp((err) => seen.push(err));
    const res = await app.inject({ method: 'GET', url: '/me/referral-code' });

    expect(res.statusCode).toBe(500);
    // The ORIGINAL error must be what we throw — replacing it with a constant
    // ("Failed to generate your referral code") is the RC-003/RC-009 failure, and
    // it is what destroys the log line that would explain a production incident.
    expect(seen).toEqual([boom]);
    // A DB blip is not a collision — retrying it five times would just fail five
    // times and delay the error.
    expect(mockReferralCodeCreate).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('gives up after the mint attempts and rethrows the real error', async () => {
    mockReferralCodeFindUnique.mockResolvedValue(null);
    const collision = uniqueViolation('code');
    mockReferralCodeCreate.mockRejectedValue(collision);
    const seen: unknown[] = [];

    const app = await buildApp((err) => seen.push(err));
    const res = await app.inject({ method: 'GET', url: '/me/referral-code' });

    expect(res.statusCode).toBe(500);
    expect(mockReferralCodeCreate).toHaveBeenCalledTimes(5);
    expect(seen).toEqual([collision]);
    await app.close();
  });
});

// ── Registration guard (RC-025) ────────────────────────────────────
// The 404 this repo shipped once: a route module that existed, was exported, and
// was never registered with the aggregator. Registering only the module in this
// test would not have caught it, so the wiring is asserted at its source.
describe('route wiring', () => {
  it('is exported from the barrel and registered by the aggregator', () => {
    const barrel = readFileSync(join(REPO_ROOT, 'apps/api/src/routes/retailers/index.ts'), 'utf8');
    const aggregator = readFileSync(join(REPO_ROOT, 'apps/api/src/routes/retailers.ts'), 'utf8');

    expect(barrel).toMatch(
      /export \{ retailersReferralRoutes \} from '\.\/retailers-referral\.js'/,
    );
    expect(aggregator).toContain('retailersReferralRoutes');
    expect(aggregator).toMatch(/server\.register\(retailersReferralRoutes\)/);
  });
});
