import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler, notFound } from '../../../plugins/error-handler.js';

const m = vi.hoisted(() => ({
  retailerFind: vi.fn(),
  designFindMany: vi.fn(),
  designFindFirst: vi.fn(),
  designUpdate: vi.fn(),
  productFindMany: vi.fn(),
  assertOwnProducts: vi.fn(),
  renderDesign: vi.fn(),
  downloadBuffer: vi.fn(),
  uploadBuffer: vi.fn(),
}));

vi.mock('@kanchuki/ai', () => ({
  publicUrl: (k: string) => `https://cdn/${k}`,
  renderDesign: m.renderDesign,
  downloadBuffer: m.downloadBuffer,
  uploadBuffer: m.uploadBuffer,
}));
vi.mock('@kanchuki/shared', async (orig) => ({
  ...(await orig<object>()),
  parseDesignSpec: () => ({ ok: true, spec: { layers: [] } }),
}));
vi.mock('../../growth/growth-campaigns/growth-campaigns-helpers.js', () => ({
  assertOwnProducts: m.assertOwnProducts,
}));
vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUniqueOrThrow: m.retailerFind },
    designTemplate: {
      findMany: m.designFindMany,
      findFirst: m.designFindFirst,
      update: m.designUpdate,
    },
    product: { findMany: m.productFindMany },
  },
}));

const { retailersSocialDesignsRoutes } = await import('./retailers-social-designs.js');

async function buildApp(staffRole: 'manager' | null = null) {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = 'r1';
    (request as any).staffRole = staffRole;
  });
  await app.register(retailersSocialDesignsRoutes, { prefix: '/v1/retailers' });
  return app;
}

const design = {
  id: 'd1',
  status: 'PUBLISHED',
  plans: ['STARTER'],
  format: 'PORTRAIT_4_5',
  product_slots: 1,
  spec: {},
  background_key: 'admin/design-templates/bg.png',
};
const product = {
  id: 'p1',
  name: 'Cotton Suit',
  sku: 'S-1',
  price_min: 149900,
  mrp: 199900,
  fabrics: ['Cotton'],
  fabric_estimate: null,
  photos: [{ r2_key: 'retailers/r1/p1.jpg', is_primary: true }],
};
const render = (app: Awaited<ReturnType<typeof buildApp>>, payload: object, id = 'd1') =>
  app.inject({ method: 'POST', url: `/v1/retailers/me/designs/${id}/render`, payload });

beforeEach(() => {
  vi.clearAllMocks();
  m.retailerFind.mockResolvedValue({
    plan: 'STARTER',
    shop_name: 'Priya Cloth House',
    city: 'Jaipur',
    phone: '9000000001',
    whatsapp_number: null,
    public_slug: 'priya-x1',
    logo_r2_key: null,
  });
  m.designFindFirst.mockResolvedValue(design);
  m.designUpdate.mockResolvedValue({});
  m.assertOwnProducts.mockResolvedValue(undefined);
  m.productFindMany.mockResolvedValue([product]);
  m.downloadBuffer.mockResolvedValue(Buffer.from('x'));
  m.renderDesign.mockResolvedValue(Buffer.from('jpg'));
  m.uploadBuffer.mockResolvedValue(undefined);
});

describe('GET /me/designs', () => {
  it('asks for PUBLISHED designs of the caller plan only', async () => {
    m.designFindMany.mockResolvedValue([
      { id: 'd1', name: 'A', thumbnail_key: 'admin/design-templates/t.png' },
    ]);
    const res = await (await buildApp()).inject({ method: 'GET', url: '/v1/retailers/me/designs' });
    expect(res.statusCode).toBe(200);
    expect(m.designFindMany.mock.calls[0]?.[0].where).toEqual({
      status: 'PUBLISHED',
      plans: { has: 'STARTER' },
    });
    expect(res.json().data[0].thumbnail_url).toBe('https://cdn/admin/design-templates/t.png');
    expect(res.json().data[0]).not.toHaveProperty('thumbnail_key');
  });

  it('refuses a manager', async () => {
    const res = await (await buildApp('manager')).inject({
      method: 'GET',
      url: '/v1/retailers/me/designs',
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /me/designs/:id/render', () => {
  it('fills variables from DB rows, stores under the retailer prefix, bumps usage_count', async () => {
    const res = await render(await buildApp(), { product_ids: ['p1'], custom_text: 'Diwali' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.image_url).toMatch(/^https:\/\/cdn\/retailers\/r1\/designs\/.+\.jpg$/);
    const input = m.renderDesign.mock.calls[0]?.[0];
    expect(input.products[0].texts).toMatchObject({
      product_name: 'Cotton Suit',
      price: '₹1,499',
      mrp: '₹1,999',
      discount_pct: '25% off',
      fabric: 'Cotton',
    });
    expect(input.shop.texts).toMatchObject({
      shop_name: 'Priya Cloth House',
      shop_phone: '9000000001',
    });
    expect(input.shop.logo).toBeNull();
    expect(input.custom).toEqual({ custom_text: 'Diwali' });
    expect(m.designUpdate).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { usage_count: { increment: 1 } },
    });
  });

  it('treats a draft / hidden / wrong-plan design as missing (filter is in the query)', async () => {
    m.designFindFirst.mockResolvedValue(null);
    const res = await render(await buildApp(), { product_ids: ['p1'] });
    expect(res.statusCode).toBe(404);
    expect(m.designFindFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'd1',
      status: 'PUBLISHED',
      plans: { has: 'STARTER' },
    });
    expect(m.renderDesign).not.toHaveBeenCalled();
  });

  it("refuses another retailer's product (RC-138 pattern)", async () => {
    m.assertOwnProducts.mockRejectedValue(notFound('Product'));
    const res = await render(await buildApp(), { product_ids: ['other'] });
    expect(res.statusCode).toBe(404);
    expect(m.renderDesign).not.toHaveBeenCalled();
  });

  it('rejects more products than the design holds, and a product with no photo', async () => {
    const app = await buildApp();
    expect((await render(app, { product_ids: ['p1', 'p2'] })).statusCode).toBe(422);
    m.productFindMany.mockResolvedValue([{ ...product, photos: [] }]);
    expect((await render(app, { product_ids: ['p1'] })).statusCode).toBe(422);
    expect(m.renderDesign).not.toHaveBeenCalled();
  });

  it('refuses a manager and over-long custom text', async () => {
    expect((await render(await buildApp('manager'), { product_ids: ['p1'] })).statusCode).toBe(403);
    const long = 'x'.repeat(81);
    const res = await render(await buildApp(), { product_ids: ['p1'], offer_text: long });
    expect(res.statusCode).toBe(422);
  });

  it('a render failure is a plain 422 and does not bump usage_count', async () => {
    m.renderDesign.mockRejectedValue(new Error('boom'));
    const res = await render(await buildApp(), { product_ids: ['p1'] });
    expect(res.statusCode).toBe(422);
    expect(m.designUpdate).not.toHaveBeenCalled();
  });
});
