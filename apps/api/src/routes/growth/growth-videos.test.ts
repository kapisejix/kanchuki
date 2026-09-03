import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    product: { findFirst: vi.fn() },
    productVideo: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@kanchuki/db', () => ({ prisma: mockPrisma }));

const { mockHasFeature } = vi.hoisted(() => ({
  mockHasFeature: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../lib/features.js', () => ({ hasFeature: mockHasFeature }));

const { mockAddKenBurnsVideoJob } = vi.hoisted(() => ({
  mockAddKenBurnsVideoJob: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../jobs/index.js', () => ({ addKenBurnsVideoJob: mockAddKenBurnsVideoJob }));

vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: vi.fn().mockResolvedValue('https://r2.example.com/upload-signed'),
  publicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
}));

const { growthVideoRoutes } = await import('./growth-videos.js');

describe('growthVideoRoutes', () => {
  let handlers: Record<string, (...args: any[]) => any>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasFeature.mockResolvedValue(true);
    handlers = {};

    const mockServer = {
      post: (path: string, handler: (...args: any[]) => any) => {
        handlers[`POST ${path}`] = handler;
      },
      get: (path: string, handler: (...args: any[]) => any) => {
        handlers[`GET ${path}`] = handler;
      },
      delete: (path: string, handler: (...args: any[]) => any) => {
        handlers[`DELETE ${path}`] = handler;
      },
    };

    growthVideoRoutes(mockServer as any, {} as any);
  });

  describe('POST /products/:id/video/generate', () => {
    it('enqueues ken-burns video job when product has at least 2 photos and < 3 videos', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod-123',
        retailer_id: 'ret-1',
        _count: { videos: 0, photos: 3 },
      });

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };
      const req = {
        retailerId: 'ret-1',
        params: { id: 'prod-123' },
      };

      await handlers['POST /products/:id/video/generate']!(req, reply);

      expect(mockAddKenBurnsVideoJob).toHaveBeenCalledWith({
        product_id: 'prod-123',
        retailer_id: 'ret-1',
      });
      expect(reply.status).toHaveBeenCalledWith(202);
      expect(reply.send).toHaveBeenCalledWith({ data: { message: 'Video generation started' } });
    });

    it('rejects video generation when product has fewer than 2 photos', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod-123',
        retailer_id: 'ret-1',
        _count: { videos: 0, photos: 1 },
      });

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };
      const req = {
        retailerId: 'ret-1',
        params: { id: 'prod-123' },
      };

      await expect(handlers['POST /products/:id/video/generate']!(req, reply)).rejects.toThrow(
        'Add at least 2 photos before generating a video',
      );
    });

    it('rejects video generation when product already has 3 videos', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod-123',
        retailer_id: 'ret-1',
        _count: { videos: 3, photos: 4 },
      });

      const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() };
      const req = {
        retailerId: 'ret-1',
        params: { id: 'prod-123' },
      };

      await expect(handlers['POST /products/:id/video/generate']!(req, reply)).rejects.toThrow(
        'Maximum 3 videos per product',
      );
    });
  });

  describe('GET /products/:id/videos', () => {
    it('returns resolved video URLs for product', async () => {
      mockPrisma.product.findFirst.mockResolvedValue({
        id: 'prod-123',
        retailer_id: 'ret-1',
      });
      mockPrisma.productVideo.findMany.mockResolvedValue([
        {
          id: 'vid-1',
          product_id: 'prod-123',
          retailer_id: 'ret-1',
          r2_key: 'retailers/ret-1/products/prod-123/videos/clip.mp4',
          public_url: 'https://cdn.example.com/retailers/ret-1/products/prod-123/videos/clip.mp4',
          duration_sec: 6,
          is_main: true,
          source: 'KEN_BURNS',
        },
      ]);

      const req = {
        retailerId: 'ret-1',
        params: { id: 'prod-123' },
      };

      const result = await handlers['GET /products/:id/videos']!(req);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('vid-1');
      expect(result.data[0].duration_sec).toBe(6);
      expect(result.data[0].source).toBe('KEN_BURNS');
    });
  });
});
