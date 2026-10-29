// H4-6 / RC-097 — near-me returned the retailer's login phone next to
// whatsapp_number. Public routes expose only enquiryPhone() (the WhatsApp
// number, falling back to the login phone when none is set).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../plugins/error-handler.js';
import { publicNearMeRoutes } from '../near-me.js';

const mockFindMany = vi.hoisted(() => vi.fn());

vi.mock('@kanchuki/db', () => ({ prisma: { retailer: { findMany: mockFindMany } } }));

const base = {
  id: 'r_1',
  shop_name: 'Shop',
  latitude: 28.6,
  longitude: 77.2,
  city: 'Delhi',
  state: 'DL',
  address_line1: 'A',
  address_line2: null,
  pincode: '110001',
  public_slug: 'shop',
  _count: { products: 3 },
};

async function get() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(publicNearMeRoutes, { prefix: '/v1/public' });
  await app.ready();
  return app.inject({ method: 'GET', url: '/v1/public/near-me?latitude=28.6&longitude=77.2' });
}

beforeEach(() => vi.clearAllMocks());

describe('GET /v1/public/near-me phone exposure', () => {
  it('returns the business WhatsApp number, never the login phone', async () => {
    mockFindMany.mockResolvedValue([
      { ...base, phone: '9000000001', whatsapp_number: '9000000002' },
    ]);
    const row = (await get()).json().data[0];

    expect(row.phone).toBe('9000000002');
    expect(row).not.toHaveProperty('whatsapp_number');
    expect(JSON.stringify(row)).not.toContain('9000000001');
  });

  it('falls back to the phone when no WhatsApp number is set', async () => {
    mockFindMany.mockResolvedValue([{ ...base, phone: '9000000001', whatsapp_number: null }]);

    expect((await get()).json().data[0].phone).toBe('9000000001');
  });
});
