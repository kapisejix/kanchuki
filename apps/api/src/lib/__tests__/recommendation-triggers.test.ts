/**
 * Task 24: Recommendation triggers — new arrival, restock, price drop.
 *
 * Tests the notification functions that send WhatsApp messages to
 * consented customers when products are created, restocked, or drop in price.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@kanchuki/db';
import {
  notifyNewArrival,
  notifyRestock,
  notifyPriceDrop,
} from '../recommendation-triggers.js';
import { canMessage, recordMessageSent } from '../messaging-guard.js';

// ─── Mocks ────────────────────────────────────────────────────────

const mockCanMessage = vi.hoisted(() => vi.fn());
const mockRecordMessageSent = vi.hoisted(() => vi.fn());

vi.mock('../messaging-guard.js', () => ({
  canMessage: mockCanMessage,
  recordMessageSent: mockRecordMessageSent,
}));

const mockStoreVisitFindMany = vi.hoisted(() => vi.fn());
const mockRetailerFindUnique = vi.hoisted(() => vi.fn());
const mockAccountFindUnique = vi.hoisted(() => vi.fn());
const mockWishlistFindMany = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({
  prisma: {
    customerStoreVisit: {
      findMany: mockStoreVisitFindMany,
    },
    retailer: {
      findUnique: mockRetailerFindUnique,
    },
    customerAccount: {
      findUnique: mockAccountFindUnique,
    },
    customerWishlistItem: {
      findMany: mockWishlistFindMany,
    },
  },
  Prisma: {},
}));

// Mock fetch for WhatsApp API calls
const mockFetch = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', mockFetch);

// ─── Fixtures ──────────────────────────────────────────────────────

const mockRetailer = {
  id: 'ret_1',
  shop_name: 'Fashion Hub',
  public_slug: 'fashion-hub',
  whatsapp_api_phone_number_id: '123456',
  whatsapp_api_access_token: 'token_abc',
  whatsapp_api_template_name: 'new_arrival',
  whatsapp_api_template_lang: 'en_US',
};

const mockAccount = {
  id: 'ca_1',
  phone: '9876543210',
};

// ─── Setup ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRetailerFindUnique.mockResolvedValue(mockRetailer);
  mockAccountFindUnique.mockResolvedValue(mockAccount);
  mockFetch.mockResolvedValue({ ok: true });
});

// ─── notifyNewArrival ──────────────────────────────────────────────

describe('notifyNewArrival', () => {
  it('sends notifications to consented customers who visited recently', async () => {
    mockStoreVisitFindMany.mockResolvedValue([
      { customer_account_id: 'ca_1' },
      { customer_account_id: 'ca_2' },
    ]);
    mockCanMessage.mockResolvedValue(true);
    mockAccountFindUnique.mockResolvedValue({ phone: '9876543210' });

    const result = await notifyNewArrival('ret_1', 'prod_1', 'Pink Kurta');

    expect(result.sent).toBe(2);
    expect(result.skipped).toBe(0);
    expect(mockCanMessage).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockRecordMessageSent).toHaveBeenCalledTimes(2);
  });

  it('skips customers who cannot be messaged', async () => {
    mockStoreVisitFindMany.mockResolvedValue([
      { customer_account_id: 'ca_1' },
      { customer_account_id: 'ca_2' },
    ]);
    mockCanMessage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await notifyNewArrival('ret_1', 'prod_1', 'Pink Kurta');

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('returns zero when no customers have visited', async () => {
    mockStoreVisitFindMany.mockResolvedValue([]);

    const result = await notifyNewArrival('ret_1', 'prod_1', 'Pink Kurta');

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns zero when retailer not found', async () => {
    mockStoreVisitFindMany.mockResolvedValue([{ customer_account_id: 'ca_1' }]);
    mockRetailerFindUnique.mockResolvedValue(null);

    const result = await notifyNewArrival('ret_1', 'prod_1', 'Pink Kurta');

    expect(result.sent).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── notifyRestock ─────────────────────────────────────────────────

describe('notifyRestock', () => {
  it('sends notifications to customers who favorited the product', async () => {
    mockWishlistFindMany.mockResolvedValue([
      { customer_account_id: 'ca_1' },
      { customer_account_id: 'ca_3' },
    ]);
    mockCanMessage.mockResolvedValue(true);

    const result = await notifyRestock('ret_1', 'prod_1', 'Blue Saree');

    expect(result.sent).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockRecordMessageSent).toHaveBeenCalledTimes(2);
  });

  it('skips when no customers favorited the product', async () => {
    mockWishlistFindMany.mockResolvedValue([]);

    const result = await notifyRestock('ret_1', 'prod_1', 'Blue Saree');

    expect(result.sent).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ─── notifyPriceDrop ───────────────────────────────────────────────

describe('notifyPriceDrop', () => {
  it('sends discount message with correct percentage', async () => {
    mockWishlistFindMany.mockResolvedValue([{ customer_account_id: 'ca_1' }]);
    mockCanMessage.mockResolvedValue(true);

    const result = await notifyPriceDrop('ret_1', 'prod_1', 'Green Suit', 2000, 1500);

    expect(result.sent).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify the template parameters include the discount
    expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
    const fetchCall = mockFetch.mock.calls[0]!;
    const body = JSON.parse(fetchCall[1].body as string);
    const params = body.template.components[0].parameters;
    expect(params[2].text).toBe('25% off');
  });

  it('skips when no customers favorited the product', async () => {
    mockWishlistFindMany.mockResolvedValue([]);

    const result = await notifyPriceDrop('ret_1', 'prod_1', 'Green Suit', 2000, 1500);

    expect(result.sent).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
