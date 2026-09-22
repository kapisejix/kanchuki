// T4 — affiliate referral capture.
//
// Four independent ways this code could pay the wrong person, and one way it
// could pay twice. Each has a describe block below, and each is asserted on the
// MECHANISM rather than the return value where possible: "a staff code never
// reaches the affiliate table" is checked by asserting `referralCode.findUnique`
// was not called, not by reading the status. A status assertion passes even if
// the lookup happened and merely lost a race to the right answer, which is the
// wrong-ledger resolution this whole namespace split exists to make impossible.
//
// The fixture terms (qualify_days 30, FREE_MONTH 1) stand in for "whatever the
// admin configured" — they are NOT constants in application code, which is T1's
// no-hardcode rule.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addCalendarMonths, applyReferralCapture } from './referral-conversions.js';

const {
  mockRetailerFindUnique,
  mockCodeFindUnique,
  mockAuditLogCreate,
  mockTransaction,
  mockConversionCreate,
  mockTxRetailerUpdate,
  mockSettingsFindUnique,
  mockSettingsCreate,
} = vi.hoisted(() => ({
  mockRetailerFindUnique: vi.fn(),
  mockCodeFindUnique: vi.fn(),
  mockAuditLogCreate: vi.fn(),
  mockTransaction: vi.fn(),
  mockConversionCreate: vi.fn(),
  mockTxRetailerUpdate: vi.fn(),
  mockSettingsFindUnique: vi.fn(),
  mockSettingsCreate: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUnique: mockRetailerFindUnique },
    referralCode: { findUnique: mockCodeFindUnique },
    auditLog: { create: mockAuditLogCreate },
    referralSettings: { findUnique: mockSettingsFindUnique, create: mockSettingsCreate },
    $transaction: mockTransaction,
  },
}));

const REFERRED_ID = 'retailer-referred';
const REFERRER_ID = 'retailer-referrer';
const AFFILIATE_CODE = 'KAN-7F3QMP';

/** The referred store, as a fresh onboarding profile: nothing attributed yet. */
function referred(overrides: Record<string, unknown> = {}) {
  return {
    id: REFERRED_ID,
    phone: '+919000000002',
    gstin: '27AAAAA0000A1Z5',
    onboarded_by_id: null,
    trial_ends_at: null,
    ...overrides,
  };
}

/** The referring store's code row, with its owner joined. */
function codeRow(overrides: Record<string, unknown> = {}) {
  return {
    retailer_id: REFERRER_ID,
    is_active: true,
    retailer: {
      id: REFERRER_ID,
      phone: '+919000000001',
      gstin: '27BBBBB1111B1Z6',
      deleted_at: null,
    },
    ...overrides,
  };
}

const SETTINGS = {
  id: 'singleton',
  commission_pct: 30,
  duration_months: 12,
  qualify_days: 30,
  referred_bonus_type: 'FREE_MONTH' as const,
  referred_bonus_value: 1,
  second_tier_enabled: false,
  second_tier_pct: null,
  payout_min_amount: 50000,
  payout_cadence: 'MONTHLY' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRetailerFindUnique.mockResolvedValue(referred());
  mockCodeFindUnique.mockResolvedValue(codeRow());
  mockAuditLogCreate.mockResolvedValue({});
  mockSettingsFindUnique.mockResolvedValue(SETTINGS);
  mockSettingsCreate.mockResolvedValue(SETTINGS);
  mockConversionCreate.mockResolvedValue({ id: 'conversion-1' });
  mockTxRetailerUpdate.mockResolvedValue({});
  // The real transaction runs its callback against the mocked tx surface.
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      referralConversion: { create: mockConversionCreate },
      retailer: { update: mockTxRetailerUpdate },
      auditLog: { create: mockAuditLogCreate },
    }),
  );
});

describe('the ledger is chosen by shape, never by lookup order', () => {
  it.each([
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('treats %s as no code at all', async (_label, value) => {
    const result = await applyReferralCapture({ referredRetailerId: REFERRED_ID, code: value });

    expect(result.status).toBe('NOT_AFFILIATE');
    expect(mockCodeFindUnique).not.toHaveBeenCalled();
    expect(mockRetailerFindUnique).not.toHaveBeenCalled();
  });

  it('leaves a staff-shaped code to F-018 without querying the affiliate table', async () => {
    const result = await applyReferralCapture({ referredRetailerId: REFERRED_ID, code: 'KAN001' });

    expect(result.status).toBe('NOT_AFFILIATE');
    // The mechanism: an affiliate lookup here is the wrong-ledger resolution.
    expect(mockCodeFindUnique).not.toHaveBeenCalled();
  });

  it('reports a hyphen-dropped affiliate code as INVALID rather than looking it up', async () => {
    // `KAN7F3QMP` is also staff-SHAPED, so a lookup-order implementation would
    // quietly search the staff table and then the affiliate one. Neither is right:
    // the code is a typo, and saying so is the only honest answer.
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: 'KAN7F3QMP',
    });

    expect(result.status).toBe('INVALID_CODE');
    expect(mockCodeFindUnique).not.toHaveBeenCalled();
  });

  it('accepts a lowercased, space-padded code from the onboarding form', async () => {
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: '  kan-7f3qmp  ',
    });

    expect(result.status).toBe('RECORDED');
    expect(mockCodeFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: AFFILIATE_CODE } }),
    );
  });
});

describe('a code that cannot pay out is refused by name', () => {
  it('reports an unknown code', async () => {
    mockCodeFindUnique.mockResolvedValue(null);
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('UNKNOWN_CODE');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('reports a disabled code', async () => {
    mockCodeFindUnique.mockResolvedValue(codeRow({ is_active: false }));
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('INACTIVE_CODE');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses a soft-deleted referrer, whose rows are on the purge path', async () => {
    // Credit that lands against a closed shop can never be paid out, and its own
    // conversion rows are removed by the purge job (migration 109's RESTRICT FKs).
    mockCodeFindUnique.mockResolvedValue(
      codeRow({ retailer: { ...codeRow().retailer, deleted_at: new Date('2026-01-01') } }),
    );
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('UNKNOWN_CODE');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses when the referred store no longer exists', async () => {
    mockRetailerFindUnique.mockResolvedValue(null);
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('UNKNOWN_CODE');
  });
});

describe('self-referral', () => {
  it('refuses a store referring itself by id', async () => {
    mockCodeFindUnique.mockResolvedValue(
      codeRow({ retailer_id: REFERRED_ID, retailer: { ...codeRow().retailer, id: REFERRED_ID } }),
    );
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('SELF_REFERRAL');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('refuses a second shop on the same phone', async () => {
    mockCodeFindUnique.mockResolvedValue(
      codeRow({ retailer: { ...codeRow().retailer, phone: '+919000000002' } }),
    );
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('SELF_REFERRAL');
  });

  it('matches GSTIN case- and whitespace-insensitively', async () => {
    mockCodeFindUnique.mockResolvedValue(
      codeRow({ retailer: { ...codeRow().retailer, gstin: ' 27aaaaa0000a1z5 ' } }),
    );
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('SELF_REFERRAL');
  });

  it('does not treat two blank GSTINs as the same shop', async () => {
    // `gstin` is nullable and a blank is a legitimate value for an unregistered
    // store — only one of the two has to be set for the comparison to mean
    // anything. Without this, every unregistered store is "the same shop".
    mockRetailerFindUnique.mockResolvedValue(referred({ gstin: '' }));
    mockCodeFindUnique.mockResolvedValue(
      codeRow({ retailer: { ...codeRow().retailer, gstin: null } }),
    );

    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('RECORDED');
  });

  it('leaves an audit trace, unlike a typo', async () => {
    // An abuse attempt is not the same event as a mistyped code, and the
    // difference has to survive in the data or nobody can ever investigate one.
    mockCodeFindUnique.mockResolvedValue(
      codeRow({ retailer: { ...codeRow().retailer, phone: '+919000000002' } }),
    );
    await applyReferralCapture({ referredRetailerId: REFERRED_ID, code: AFFILIATE_CODE });

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'REFERRAL_SELF_REFERRAL_BLOCKED' }),
      }),
    );
  });

  it('does not audit a code that simply does not exist', async () => {
    mockCodeFindUnique.mockResolvedValue(null);
    await applyReferralCapture({ referredRetailerId: REFERRED_ID, code: AFFILIATE_CODE });

    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });
});

describe('one attribution, and staff wins', () => {
  it('refuses a shop a marketing agent already onboarded', async () => {
    mockRetailerFindUnique.mockResolvedValue(referred({ onboarded_by_id: 'agent-1' }));
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('ALREADY_ATTRIBUTED');
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('treats a lost race on the unique constraint as already attributed, not an error', async () => {
    mockTransaction.mockRejectedValue({ code: 'P2002' });
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('ALREADY_ATTRIBUTED');
  });

  it('does not re-apply the bonus when the insert loses the race', async () => {
    // This is why the reward lives INSIDE the transaction that failed: a retry
    // that extended the trial before hitting the constraint would grant a second
    // free month for one signup, and the conversion row would not record it.
    mockTransaction.mockRejectedValue({ code: 'P2002' });
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('ALREADY_ATTRIBUTED');
    expect(mockTxRetailerUpdate).not.toHaveBeenCalled();
  });

  it('rethrows a database error rather than reporting a refusal', async () => {
    // A capture that failed on a connection blip must not look like "no referral
    // here" — that is a shop that was referred and a referrer never paid.
    mockTransaction.mockRejectedValue(new Error('connection terminated'));
    await expect(
      applyReferralCapture({ referredRetailerId: REFERRED_ID, code: AFFILIATE_CODE }),
    ).rejects.toThrow('connection terminated');
  });
});

describe('recording a conversion', () => {
  it('writes a PENDING row whose qualify date comes from the settings row', async () => {
    const now = new Date('2026-09-22T00:00:00.000Z');
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
      now,
    });

    expect(result.status).toBe('RECORDED');
    expect(mockConversionCreate).toHaveBeenCalledWith({
      data: {
        referrer_id: REFERRER_ID,
        referred_id: REFERRED_ID,
        status: 'PENDING',
        qualifies_at: new Date('2026-10-22T00:00:00.000Z'),
      },
      select: { id: true },
    });
    expect(result.qualifies_at).toBe('2026-10-22T00:00:00.000Z');
  });

  it('marks the conversion with the qualifying period, not a stored term', async () => {
    // Change the setting and the date must move with it — proof that qualify_days
    // is read at call time rather than baked into the row.
    mockSettingsFindUnique.mockResolvedValue({ ...SETTINGS, qualify_days: 7 });
    const now = new Date('2026-09-22T00:00:00.000Z');
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
      now,
    });

    expect(result.qualifies_at).toBe('2026-09-29T00:00:00.000Z');
  });

  it('applies the free-month bonus to the referred store in the same transaction', async () => {
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
      now: new Date('2026-09-22T00:00:00.000Z'),
    });

    expect(result.reward).toEqual({
      kind: 'FREE_MONTH',
      months: 1,
      trial_ends_at: '2026-10-22T00:00:00.000Z',
    });
    expect(mockTxRetailerUpdate).toHaveBeenCalledWith({
      where: { id: REFERRED_ID },
      data: { trial_ends_at: new Date('2026-10-22T00:00:00.000Z') },
    });
  });

  it('never forces plan_status to TRIAL', async () => {
    // A store that paid during onboarding must not be downgraded by typing a
    // referral code into a profile form.
    await applyReferralCapture({ referredRetailerId: REFERRED_ID, code: AFFILIATE_CODE });

    const bonusWrite = mockTxRetailerUpdate.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(bonusWrite.data).not.toHaveProperty('plan_status');
  });

  it('discards a reward the code cannot honour, but records it LOUDLY', async () => {
    // Reachable only for a row written outside the admin API (the route 422s
    // FLAT_DISCOUNT). Silently returning NONE is the RC-027 failure: the config
    // says one thing and the store gets another, with no error anywhere.
    mockSettingsFindUnique.mockResolvedValue({
      ...SETTINGS,
      referred_bonus_type: 'FLAT_DISCOUNT',
      referred_bonus_value: 50000,
    });
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('RECORDED');
    expect(result.reward).toEqual({ kind: 'UNSUPPORTED', bonus_type: 'FLAT_DISCOUNT' });
    expect(mockTxRetailerUpdate).not.toHaveBeenCalled();
    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({ unsupported_bonus_type: 'FLAT_DISCOUNT' }),
        }),
      }),
    );
  });

  it('gives nothing when the bonus is switched off', async () => {
    mockSettingsFindUnique.mockResolvedValue({ ...SETTINGS, referred_bonus_type: 'NONE' });
    const result = await applyReferralCapture({
      referredRetailerId: REFERRED_ID,
      code: AFFILIATE_CODE,
    });

    expect(result.status).toBe('RECORDED');
    expect(result.reward).toEqual({ kind: 'NONE' });
    expect(mockTxRetailerUpdate).not.toHaveBeenCalled();
  });
});

describe('addCalendarMonths', () => {
  // Every case below pins the evaluation instant BEFORE the date being extended,
  // so `from` is the base and the arithmetic is what is under test. The rule that
  // picks the LATER of the two has its own test at the bottom.
  const now = new Date('2026-01-01T00:00:00.000Z');

  it('adds whole calendar months', () => {
    expect(addCalendarMonths(new Date('2026-09-22T00:00:00.000Z'), 1, now).toISOString()).toBe(
      '2026-10-22T00:00:00.000Z',
    );
    expect(addCalendarMonths(new Date('2026-01-15T00:00:00.000Z'), 3, now).toISOString()).toBe(
      '2026-04-15T00:00:00.000Z',
    );
  });

  it('clamps to the target month rather than overflowing', () => {
    // Jan 31 + 1 month is not Mar 3. The naive setUTCMonth on the 31st grants a
    // month and two days, and nothing would ever report it.
    expect(addCalendarMonths(new Date('2026-01-31T00:00:00.000Z'), 1, now).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('clamps to Feb 29 in a leap year', () => {
    expect(addCalendarMonths(new Date('2028-01-31T00:00:00.000Z'), 1, now).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
  });

  it('extends a still-active trial rather than resetting it', () => {
    const now = new Date('2026-09-22T00:00:00.000Z');
    const active = new Date('2026-11-01T00:00:00.000Z');
    expect(addCalendarMonths(active, 1, now).toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('counts from now when the trial has already lapsed', () => {
    // Worth the same on day 1 or day 20 — otherwise the bonus silently expires
    // for anyone who signs up slowly.
    const now = new Date('2026-09-22T00:00:00.000Z');
    const lapsed = new Date('2026-01-01T00:00:00.000Z');
    expect(addCalendarMonths(lapsed, 1, now).toISOString()).toBe('2026-10-22T00:00:00.000Z');
  });

  it('adds nothing for zero months', () => {
    expect(addCalendarMonths(new Date('2026-12-05T00:00:00.000Z'), 0, now).toISOString()).toBe(
      '2026-12-05T00:00:00.000Z',
    );
  });
});
