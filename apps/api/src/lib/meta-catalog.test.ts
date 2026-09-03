import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getOrCreateCatalog,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  listCatalogItems,
  uploadCatalogImage,
  getCatalogItemByRetailerId,
  batchCatalogItems,
} from './meta-catalog.js';
import { MetaApiError } from './meta-graph.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock getSecret
vi.mock('@kanchuki/db', () => ({
  getSecret: vi.fn(),
}));

import { getSecret } from '@kanchuki/db';

describe('meta-catalog', () => {
  const mockWabaId = '123456789';
  const mockAccessToken = 'test_access_token';
  const mockCatalogId = 'catalog_123';
  const mockRetailerId = 'product_abc';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSecret).mockResolvedValue('test_waba_id');
  });

  describe('getOrCreateCatalog', () => {
    it('returns existing catalog ID when one exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ id: mockCatalogId, name: 'Test Catalog' }] }),
      });

      const result = await getOrCreateCatalog(mockWabaId, mockAccessToken);

      expect(result).toBe(mockCatalogId);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('creates new catalog when none exists', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: mockCatalogId }),
        });

      const result = await getOrCreateCatalog(mockWabaId, mockAccessToken);

      expect(result).toBe(mockCatalogId);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws MetaApiError on create failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: { message: 'Failed' } }),
        });

      await expect(getOrCreateCatalog(mockWabaId, mockAccessToken)).rejects.toThrow(MetaApiError);
    });
  });

  describe('uploadCatalogImage', () => {
    it('uploads image and returns image_hash', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ image_hash: 'hash_123' }),
        });

      const result = await uploadCatalogImage('https://example.com/image.jpg', mockAccessToken);

      expect(result).toBe('hash_123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws on image fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(
        uploadCatalogImage('https://example.com/missing.jpg', mockAccessToken),
      ).rejects.toThrow(MetaApiError);
    });
  });

  describe('createCatalogItem', () => {
    it('creates item with image upload', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ image_hash: 'hash_123' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'item_123' }),
        });

      const result = await createCatalogItem(
        mockCatalogId,
        mockAccessToken,
        {
          name: 'Test Product',
          price: 100000,
          currency: 'INR',
          availability: 'in stock',
          image_url: 'https://example.com/image.jpg',
        },
        mockRetailerId,
      );

      expect(result.id).toBe('item_123');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('continues without image if upload fails', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: { message: 'Failed' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'item_123' }),
        });

      const result = await createCatalogItem(
        mockCatalogId,
        mockAccessToken,
        {
          name: 'Test Product',
          price: 100000,
          currency: 'INR',
          availability: 'in stock',
          image_url: 'https://example.com/image.jpg',
        },
        mockRetailerId,
      );

      expect(result.id).toBe('item_123');
    });
  });

  describe('updateCatalogItem', () => {
    it('updates item fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await updateCatalogItem(mockCatalogId, mockAccessToken, 'item_123', {
        name: 'Updated Name',
        price: 150000,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toContain('item_123');
      const body = JSON.parse(call[1]?.body as string);
      expect(body.name).toBe('Updated Name');
      expect(body.price).toBe(150000);
    });

    it('throws on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Failed' } }),
      });

      await expect(
        updateCatalogItem(mockCatalogId, mockAccessToken, 'item_123', {
          name: 'Updated',
        }),
      ).rejects.toThrow(MetaApiError);
    });
  });

  describe('deleteCatalogItem', () => {
    it('deletes item', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await deleteCatalogItem(mockCatalogId, mockAccessToken, 'item_123');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0]!;
      expect(call[0]).toContain('item_123');
      expect(call[1]?.method).toBe('DELETE');
    });
  });

  describe('listCatalogItems', () => {
    it('returns items and next cursor', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 'item_1',
                retailer_id: 'prod_1',
                name: 'Product 1',
                price: 100000,
                currency: 'INR',
                availability: 'in stock',
                condition: 'new',
              },
              {
                id: 'item_2',
                retailer_id: 'prod_2',
                name: 'Product 2',
                price: 200000,
                currency: 'INR',
                availability: 'out of stock',
                condition: 'new',
              },
            ],
            paging: { cursors: { after: 'cursor_123' } },
          }),
      });

      const result = await listCatalogItems(mockCatalogId, mockAccessToken);

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).toBe('cursor_123');
    });
  });

  describe('getCatalogItemByRetailerId', () => {
    it('returns item when found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: 'item_1',
                retailer_id: mockRetailerId,
                name: 'Product 1',
                price: 100000,
                currency: 'INR',
                availability: 'in stock',
                condition: 'new',
              },
            ],
          }),
      });

      const result = await getCatalogItemByRetailerId(
        mockCatalogId,
        mockAccessToken,
        mockRetailerId,
      );

      expect(result).not.toBeNull();
      expect(result?.retailer_id).toBe(mockRetailerId);
    });

    it('returns null when not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const result = await getCatalogItemByRetailerId(
        mockCatalogId,
        mockAccessToken,
        'nonexistent',
      );

      expect(result).toBeNull();
    });
  });

  describe('batchCatalogItems', () => {
    it('processes batch operations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve([
            { code: 200, body: { id: 'item_1' } },
            { code: 200, body: { success: true } },
            { code: 400, body: { error: { message: 'Failed' } } },
          ]),
      });

      const result = await batchCatalogItems(mockCatalogId, mockAccessToken, [
        {
          method: 'POST',
          retailer_id: 'prod_1',
          item: { name: 'Product 1', price: 100000, currency: 'INR', availability: 'in stock' },
        },
        { method: 'DELETE', retailer_id: 'prod_2' },
        {
          method: 'POST',
          retailer_id: 'prod_3',
          item: { name: 'Product 3', price: 300000, currency: 'INR', availability: 'in stock' },
        },
      ]);

      expect(result).toHaveLength(3);
      expect(result[0]!.success).toBe(true);
      expect(result[0]!.id).toBe('item_1');
      expect(result[1]!.success).toBe(true);
      expect(result[2]!.success).toBe(false);
      expect(result[2]!.error).toBe('Failed');
    });
  });
});
