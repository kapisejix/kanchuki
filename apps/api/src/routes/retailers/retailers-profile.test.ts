// T4 — affiliate referral capture as wired into PUT /v1/retailers/me.
//
// The capture LOGIC has its own suite (lib/referral-conversions.test.ts). What
// only a route test can prove is the four things that are true of the WIRING:
//
//  1. An affiliate code and a staff code take different paths out of ONE payload
//     field, and the affiliate path never sets `onboarded_by_id` — the ledgers do
//     not contaminate each other.
//  2. `referral` is ADDITIVE. Existing consumers read `data`; it must still be the
//     updated profile on every path, including the one that applied a bonus.
//  3. A FREE_MONTH bonus is visible in the response. It moves `trial_ends_at` in a
//     separate transaction, so without the re-read the response would carry the
//     pre-bonus date and the bonus would look like it failed.
//  4. A capture that THROWS does not fail the profile save, and does not vanish
//     either. `referral_code` is one optional field of a general save, so a
//     database error there must not block onboarding — but it is reported as
//     CAPTURE_FAILED and logged rather than swallowed.
//
// Deliberately NOT mocking lib/referral-conversions.js: mocking it would make (1)
// unfalsifiable, since the interesting assertion is that the real classifier sends
// the two code shapes down different branches.

import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';
import { retailersProfileRoutes } from './retailers-profile.js';

const {
  mockRetailerFindUnique,
  mockRetailerUpdate,
  mockAuditLogCreate,
  mockTeamMemberFindUnique,
  mockCodeFindUnique,
  mockSettingsFindUnique,
  mockSettingsCreate,
  mockTransaction,
  mockConversionCreate,
  mockTxRetailerUpdate,
} = vi.hoisted(() => ({
  mockRetailerFindUnique: vi.fn(),
  mockRetailerUpdate: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockTeamMemberFindUnique: vi.fn(),
  mockCodeFindUnique: vi.fn(),
  mockSettingsFindUnique: vi.fn(),
  mockSettingsCreate: vi.fn(),
  mockTransaction: vi.fn(),
  mockConversionCreate: vi.fn(),
  mockTxRetailerUpdate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUnique: mockRetailerFindUnique, update: mockRetailerUpdate },
    auditLog: { create: mockAuditLogCreate },
    teamMember: { findUnique: mockTeamMemberFindUnique },
    referralCode: { findUnique: mockCodeFindUnique },
    referralSettings: { findUnique: mockSettingsFindUnique, create: mockSettingsCreate },
    $transaction: mockTransaction,
  },
  Prisma: {},
}));

const RETAILER_ID = 'retailer-referred';
const REFERRER_ID = 'retailer-referrer';
const AFFILIATE_CODE = 'KAN-7F3QMP';
const STAFF_CODE = 'KAN001';

/**
 * The retailer row, as one mutable object.
 *
 * A STATEFUL fake rather than per-test return values, because the route reads
 * this row up to three times in one request: the current-row fetch, the slug
 * collision check, and — after a FREE_MONTH bonus moved `trial_ends_at` in a
 * separate transaction — a re-read whose whole purpose is to see the write. A
 * mock that returns a fixed object regardless of the writes would make the
 * post-bonus assertion untestable and the `data` assertions lie.
 */
let dbRow: Record<string, unknown>;

function resetDbRow() {
  dbRow = {
    id: RETAILER_ID,
    shop_name: 'Sharma Cloth House',
    owner_name: null,
    city: null,
    state: null,
    gstin: '27AAAAA0000A1Z5',
    phone: '+919000000002',
    onboarded_by_id: null,
    public_slug: null,
    whatsapp_number: null,
    trial_ends_at: null,
  };
}

const SETTINGS = {
  id: 'singleton',
  qualify_days: 30,
  referred_bonus_type: 'FREE_MONTH' as const,
  referred_bonus_value: 1,
};

function codeRow() {
  return {
    retailer_id: REFERRER_ID,
    is_active: true,
    retailer: {
      id: REFERRER_ID,
      phone: '+919000000001',
      gstin: '27BBBBB1111B1Z6',
      deleted_at: null,
    },
  };
}

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.addHook('preHandler', async (request) => {
    request.retailerId = RETAILER_ID;
  });
  await app.register(retailersProfileRoutes);
  await app.ready();
  return app;
}

function put(app: Fastify.FastifyInstance, body: Record<string, unknown>) {
  return app.inject({
    method: 'PUT',
    url: '/me',
    payload: body,
  });
}

/** Merge a write into the row — what the real update would leave behind. */
function write(data: Record<string, unknown>) {
  dbRow = { ...dbRow, ...data };
  return dbRow;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetDbRow();
  mockRetailerFindUnique.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => {
      // Only the slug-collision check looks up by slug; the other two reads are by
      // id and must see whatever the writes have left behind.
      if (where.public_slug) return null;
      return dbRow;
    },
  );
  mockRetailerUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    write(data),
  );
  mockAuditLogCreate.mockResolvedValue({});
  mockTeamMemberFindUnique.mockResolvedValue(null);
  mockCodeFindUnique.mockResolvedValue(codeRow());
  mockSettingsFindUnique.mockResolvedValue(SETTINGS);
  mockSettingsCreate.mockResolvedValue(SETTINGS);
  mockConversionCreate.mockResolvedValue({ id: 'conversion-1' });
  mockTxRetailerUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    write(data),
  );
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      referralConversion: { create: mockConversionCreate },
      retailer: { update: mockTxRetailerUpdate },
      auditLog: { create: mockAuditLogCreate },
    }),
  );
});

describe('the two ledgers do not contaminate each other', () => {
  it('records an affiliate conversion and leaves onboarded_by_id alone', async () => {
    const app = await buildApp();
    const res = await put(app, { shop_name: 'Sharma Cloth House', referral_code: AFFILIATE_CODE });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.referral.status).toBe('RECORDED');
    expect(mockConversionCreate).toHaveBeenCalledTimes(1);

    // The affiliate path must never write staff attribution — one signup, one payer.
    const affiliateWrite = mockRetailerUpdate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(affiliateWrite.data).not.toHaveProperty('onboarded_by_id');
  });

  it('sends a staff-shaped code to F-018 and never to the affiliate table', async () => {
    mockTeamMemberFindUnique.mockResolvedValue({ id: 'agent-1', is_active: true });

    const app = await buildApp();
    const res = await put(app, { shop_name: 'Sharma Cloth House', referral_code: STAFF_CODE });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // The classifier routed it away before any affiliate lookup could happen.
    expect(body.referral.status).toBe('NOT_AFFILIATE');
    expect(mockCodeFindUnique).not.toHaveBeenCalled();
    expect(mockConversionCreate).not.toHaveBeenCalled();

    // ...and F-018's own attribution still works, untouched.
    const staffWrite = mockRetailerUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(staffWrite.data.onboarded_by_id).toBe('agent-1');
  });

  it('refuses an affiliate code for a shop an agent already onboarded', async () => {
    // Staff wins: the shop is already attributed in person, so a code typed later
    // must not open a second payout for the same signup.
    dbRow.onboarded_by_id = 'agent-1';

    const app = await buildApp();
    const res = await put(app, { shop_name: 'Sharma Cloth House', referral_code: AFFILIATE_CODE });

    expect(res.json().referral.status).toBe('ALREADY_ATTRIBUTED');
    expect(mockConversionCreate).not.toHaveBeenCalled();
  });
});

describe('referral is additive to the response', () => {
  it('still returns the updated profile when no code was sent', async () => {
    const app = await buildApp();
    const res = await put(app, { shop_name: 'Sharma Cloth House' });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.shop_name).toBe('Sharma Cloth House');
    // null, not undefined — the key is always present so a consumer can tell
    // "no code was sent" from "the field is missing from this build".
    expect(body.referral).toBeNull();
    expect(mockCodeFindUnique).not.toHaveBeenCalled();
  });

  it('returns the updated profile alongside a recorded conversion', async () => {
    const app = await buildApp();
    const body = (await put(app, { shop_name: 'New Name', referral_code: AFFILIATE_CODE })).json();

    expect(body.data.shop_name).toBe('New Name');
    expect(body.referral.referrer_id).toBe(REFERRER_ID);
    expect(body.referral.conversion_id).toBe('conversion-1');
  });

  it('shows the post-bonus trial date, not the one from before the update', async () => {
    // Without the re-read this response would carry the pre-bonus value (null) and
    // the bonus that WAS applied would look like it had not been.
    const app = await buildApp();
    const body = (
      await put(app, { shop_name: 'Sharma Cloth House', referral_code: AFFILIATE_CODE })
    ).json();

    expect(body.referral.reward.kind).toBe('FREE_MONTH');
    // The bonus is now visible in the row the tx wrote...
    expect((dbRow.trial_ends_at as Date).toISOString()).toBe(body.referral.reward.trial_ends_at);
    // ...and it is what the response reports, not the null the update returned.
    expect(new Date(body.data.trial_ends_at).toISOString()).toBe(
      body.referral.reward.trial_ends_at,
    );
  });
});

describe('a capture that fails is non-fatal, not silent', () => {
  it('still saves the profile and reports CAPTURE_FAILED', async () => {
    // The realistic cause: migration 109 not applied yet, so `referral_codes`
    // does not exist. An optional field must not be able to block onboarding.
    mockCodeFindUnique.mockRejectedValue(new Error('relation "referral_codes" does not exist'));

    const app = await buildApp();
    const res = await put(app, {
      shop_name: 'Sharma Cloth House',
      referral_code: AFFILIATE_CODE,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.referral).toEqual({ status: 'CAPTURE_FAILED' });
    // The save actually happened — not "200 with nothing written".
    expect(body.data.shop_name).toBe('Sharma Cloth House');
    expect(mockRetailerUpdate).toHaveBeenCalledTimes(1);
  });

  it('logs the underlying error rather than discarding it', async () => {
    // "Non-fatal" must not mean "invisible": a swallow here is a referral that was
    // attempted and lost with nothing anywhere to investigate.
    const app = await buildApp();
    const logged: unknown[] = [];
    // Spying on the logger, not on `console` — the route uses `request.log`.
    app.log.error = ((...args: unknown[]) => {
      logged.push(args);
    }) as never;

    mockCodeFindUnique.mockRejectedValue(new Error('relation "referral_codes" does not exist'));
    await put(app, { shop_name: 'Sharma Cloth House', referral_code: AFFILIATE_CODE });

    expect(logged).toHaveLength(1);
    const [fields] = logged[0] as [{ err: Error }, string];
    // The CAUSE has to survive into the log. A bare "referral capture failed"
    // with no error attached is only marginally better than a swallow.
    expect(fields.err.message).toContain('referral_codes');
    expect((logged[0] as unknown[])[1]).toBe('referral capture failed');
  });
});
