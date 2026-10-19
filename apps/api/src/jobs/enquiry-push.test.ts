// F-046 slice 2 — new-enquiry push handler (Expo send + receipts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  deviceFindMany: vi.fn(),
  deviceUpdateMany: vi.fn(),
  staffFindMany: vi.fn(),
  queueAdd: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    staffPushDevice: { findMany: h.deviceFindMany, updateMany: h.deviceUpdateMany },
    staff: { findMany: h.staffFindMany },
  },
}));
vi.mock('./queue.js', () => ({ getPushQueue: () => ({ add: h.queueAdd }) }));

import { handleEnquiryPush, handleEnquiryPushReceipts } from './enquiry-push.js';

const JOB = { retailer_id: 'ret_1', enquiry_id: 'enq_1', item_count: 3 };

// In-memory tables. The stubs honour the query (retailer, disabled_at, id in, is_active)
// so a wrong filter in the handler fails here instead of agreeing with a canned answer.
const devices = [
  {
    expo_token: 'ExponentPushToken[owner]',
    staff_id: null,
    retailer_id: 'ret_1',
    disabled_at: null,
  },
  {
    expo_token: 'ExponentPushToken[mgr]',
    staff_id: 'stf_m',
    retailer_id: 'ret_1',
    disabled_at: null,
  },
  {
    expo_token: 'ExponentPushToken[gone]',
    staff_id: 'stf_x',
    retailer_id: 'ret_1',
    disabled_at: null,
  },
  {
    expo_token: 'ExponentPushToken[off]',
    staff_id: null,
    retailer_id: 'ret_1',
    disabled_at: new Date(),
  },
  {
    expo_token: 'ExponentPushToken[other]',
    staff_id: null,
    retailer_id: 'ret_2',
    disabled_at: null,
  },
];
const staff = [
  { id: 'stf_m', retailer_id: 'ret_1', is_active: true },
  { id: 'stf_x', retailer_id: 'ret_1', is_active: false },
];

const fetchMock = vi.fn();
const TWO_OK = {
  data: [
    { status: 'ok', id: 't1' },
    { status: 'ok', id: 't2' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.EXPO_ACCESS_TOKEN = '';
  h.deviceFindMany.mockImplementation(
    async ({ where }: { where: { retailer_id: string; disabled_at: null } }) =>
      devices.filter(
        (d) => d.retailer_id === where.retailer_id && d.disabled_at === where.disabled_at,
      ),
  );
  h.staffFindMany.mockImplementation(
    async ({
      where,
    }: { where: { id: { in: string[] }; retailer_id: string; is_active: boolean } }) =>
      staff.filter(
        (s) =>
          where.id.in.includes(s.id) &&
          s.retailer_id === where.retailer_id &&
          s.is_active === where.is_active,
      ),
  );
  h.deviceUpdateMany.mockResolvedValue({ count: 1 });
  h.queueAdd.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function expoOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function sentMessages(call = 0) {
  return JSON.parse(fetchMock.mock.calls[call]?.[1].body) as Record<string, unknown>[];
}

describe('handleEnquiryPush', () => {
  it('sends to the owner and active staff only: not inactive staff, disabled or other-shop devices', async () => {
    fetchMock.mockResolvedValue(expoOk(TWO_OK));
    const out = await handleEnquiryPush(JOB);
    expect(out).toEqual({ sent: 2, disabled: 0 });
    expect(
      sentMessages()
        .map((m) => m.to)
        .sort(),
    ).toEqual(['ExponentPushToken[mgr]', 'ExponentPushToken[owner]']);
  });

  it('payload carries an enquiry id and a count: no customer data', async () => {
    fetchMock.mockResolvedValue(expoOk(TWO_OK));
    await handleEnquiryPush(JOB);
    const [m] = sentMessages();
    expect(m).toMatchObject({
      title: 'New enquiry',
      body: '3 items asked about',
      data: { type: 'enquiry', enquiryId: 'enq_1' },
    });
    expect(Object.keys(m?.data as object).sort()).toEqual(['enquiryId', 'type']);
    expect(JSON.stringify(m)).not.toMatch(/phone|customer_name|98765/);
  });

  it('singular copy for one item', async () => {
    fetchMock.mockResolvedValue(expoOk(TWO_OK));
    await handleEnquiryPush({ ...JOB, item_count: 1 });
    expect(sentMessages()[0]?.body).toBe('1 item asked about');
  });

  it('no devices: no network call', async () => {
    const out = await handleEnquiryPush({ ...JOB, retailer_id: 'ret_none' });
    expect(out).toEqual({ sent: 0, disabled: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables a DeviceNotRegistered token and schedules a receipts check for the rest', async () => {
    fetchMock.mockResolvedValue(
      expoOk({
        data: [
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
          { status: 'ok', id: 'ticket-2' },
        ],
      }),
    );
    const out = await handleEnquiryPush(JOB);
    expect(out).toEqual({ sent: 1, disabled: 1 });
    const upd = h.deviceUpdateMany.mock.calls[0]?.[0];
    expect(upd.where.expo_token.in).toHaveLength(1);
    expect(upd.data.disabled_at).toBeInstanceOf(Date);
    const [name, payload, opts] = h.queueAdd.mock.calls[0] ?? [];
    expect(name).toBe('enquiry-push-receipts');
    expect(payload.tickets).toHaveLength(1);
    expect(opts.delay).toBe(15 * 60 * 1000);
  });

  it('a non-DeviceNotRegistered ticket error disables nothing', async () => {
    fetchMock.mockResolvedValue(
      expoOk({
        data: [
          { status: 'error', details: { error: 'MessageRateExceeded' } },
          { status: 'ok', id: 'ticket-2' },
        ],
      }),
    );
    const out = await handleEnquiryPush(JOB);
    expect(out.disabled).toBe(0);
    expect(h.deviceUpdateMany).not.toHaveBeenCalled();
  });

  it('Expo HTTP failure throws so BullMQ retries', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(handleEnquiryPush(JOB)).rejects.toThrow('Expo push HTTP 503');
    expect(h.queueAdd).not.toHaveBeenCalled();
  });

  it('adds the bearer token only when EXPO_ACCESS_TOKEN is set', async () => {
    fetchMock.mockResolvedValue(expoOk({ data: [] }));
    await handleEnquiryPush(JOB);
    expect(fetchMock.mock.calls[0]?.[1].headers.Authorization).toBeUndefined();
    process.env.EXPO_ACCESS_TOKEN = 'secret';
    await handleEnquiryPush(JOB);
    expect(fetchMock.mock.calls[1]?.[1].headers.Authorization).toBe('Bearer secret');
  });
});

describe('handleEnquiryPushReceipts', () => {
  it('disables only tokens whose receipt says DeviceNotRegistered', async () => {
    fetchMock.mockResolvedValue(
      expoOk({
        data: {
          a: { status: 'ok' },
          b: { status: 'error', details: { error: 'DeviceNotRegistered' } },
          c: { status: 'error', details: { error: 'MessageTooBig' } },
        },
      }),
    );
    const out = await handleEnquiryPushReceipts({
      tickets: [
        { id: 'a', token: 'ExponentPushToken[a]' },
        { id: 'b', token: 'ExponentPushToken[b]' },
        { id: 'c', token: 'ExponentPushToken[c]' },
      ],
    });
    expect(out).toEqual({ disabled: 1 });
    expect(h.deviceUpdateMany.mock.calls[0]?.[0].where.expo_token.in).toEqual([
      'ExponentPushToken[b]',
    ]);
  });

  it('empty ticket list: no call', async () => {
    expect(await handleEnquiryPushReceipts({ tickets: [] })).toEqual({ disabled: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
