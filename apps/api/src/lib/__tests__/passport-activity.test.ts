// Tests for passport-activity.ts — recordInteraction helper (Task 11).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @kanchuki/db
vi.mock('@kanchuki/db', () => ({
  prisma: {
    customerInteraction: {
      create: vi.fn().mockResolvedValue({ id: 'mock-interaction-id' }),
    },
    customerAccount: {
      findUnique: vi.fn().mockResolvedValue({ profiling_enabled: true }),
    },
  },
}));

import { prisma } from '@kanchuki/db';
import { recordInteraction, SIGNAL_WEIGHTS } from '../passport-activity.js';

describe('recordInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create interaction with customer_account_id when accountId is present', async () => {
    await recordInteraction({
      accountId: 'account-123',
      customerId: 'cust-456',
      retailerId: 'ret-789',
      productId: 'prod-001',
      type: 'view',
      metadata: { source: 'catalog' },
    });

    expect(prisma.customerInteraction.create).toHaveBeenCalledWith({
      data: {
        customer_id: 'cust-456',
        retailer_id: 'ret-789',
        product_id: 'prod-001',
        collection_id: null,
        type: 'view',
        metadata: { source: 'catalog' },
        customer_account_id: 'account-123',
      },
    });
  });

  it('should create interaction without customer_account_id when no session', async () => {
    await recordInteraction({
      retailerId: 'ret-789',
      productId: 'prod-001',
      type: 'favorite',
    });

    expect(prisma.customerInteraction.create).toHaveBeenCalledWith({
      data: {
        customer_id: '_passport_only_',
        retailer_id: 'ret-789',
        product_id: 'prod-001',
        collection_id: null,
        type: 'favorite',
        metadata: undefined,
        customer_account_id: null,
      },
    });
  });

  it('should use placeholder customer_id when customerId not provided', async () => {
    await recordInteraction({
      accountId: 'account-123',
      retailerId: 'ret-789',
      productId: 'prod-001',
      type: 'search',
    });

    expect(prisma.customerInteraction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customer_id: '_passport_only_',
        customer_account_id: 'account-123',
      }),
    });
  });

  it('should not throw on database error (fire-and-forget)', async () => {
    (prisma.customerInteraction.create as any).mockRejectedValueOnce(new Error('DB error'));

    await expect(
      recordInteraction({
        retailerId: 'ret-789',
        type: 'view',
      })
    ).resolves.toBeUndefined();
  });

  it('should not throw when the profiling lookup fails (fire-and-forget)', async () => {
    (prisma.customerAccount.findUnique as any).mockRejectedValueOnce(new Error('DB error'));

    await expect(
      recordInteraction({ accountId: 'account-123', retailerId: 'ret-789', type: 'view' })
    ).resolves.toBeUndefined();
    expect(prisma.customerInteraction.create).not.toHaveBeenCalled();
  });

  it('should warn and skip for unknown interaction type', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await recordInteraction({
      retailerId: 'ret-789',
      type: 'unknown_type' as any,
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown interaction type')
    );
    expect(prisma.customerInteraction.create).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('should handle null metadata gracefully', async () => {
    await recordInteraction({
      retailerId: 'ret-789',
      productId: 'prod-001',
      type: 'view',
    });

    expect(prisma.customerInteraction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: undefined,
      }),
    });
  });

  it('should handle collection_id correctly', async () => {
    await recordInteraction({
      retailerId: 'ret-789',
      collectionId: 'coll-123',
      type: 'collection_open',
    });

    expect(prisma.customerInteraction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        collection_id: 'coll-123',
        product_id: null,
      }),
    });
  });
});

describe('SIGNAL_WEIGHTS', () => {
  it('should have weights for all interaction types', () => {
    expect(SIGNAL_WEIGHTS.purchase).toBe(10);
    expect(SIGNAL_WEIGHTS.favorite).toBe(5);
    expect(SIGNAL_WEIGHTS.enquiry).toBe(4);
    expect(SIGNAL_WEIGHTS.try_on).toBe(3);
    expect(SIGNAL_WEIGHTS.view).toBe(1);
    expect(SIGNAL_WEIGHTS.unfavorite).toBe(-5);
  });
});
