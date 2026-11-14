import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const {
  mockFindMany,
  mockFindUnique,
  mockCreate,
  mockUpdate,
  mockAudit,
  mockRender,
  mockDownload,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockAudit: vi.fn(),
  mockRender: vi.fn(),
  mockDownload: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    designTemplate: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
    auditLog: { create: mockAudit },
  },
}));

const { mockInspect } = vi.hoisted(() => ({ mockInspect: vi.fn() }));
vi.mock('@kanchuki/ai', () => ({
  getUploadPresignedUrl: vi.fn(async () => 'https://r2.example/put'),
  publicUrl: (k: string) => `https://cdn.example/${k}`,
  deleteObject: vi.fn(async () => undefined),
  inspectObject: mockInspect,
  renderDesign: mockRender,
  samplePhoto: vi.fn(async () => Buffer.from('photo')),
  downloadBuffer: mockDownload,
}));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

vi.mock('../admin-auth.js', () => ({ adminAuthPreHandler: async () => undefined }));

const { adminDesignTemplateRoutes } = await import('./admin-design-templates.js');

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminDesignTemplateRoutes);
  await app.ready();
  return app;
}

const goodSpec = {
  layers: [
    { type: 'text', var: 'shop_name', x: 40, y: 40, size: 48, font: 'sans', color: '#000000' },
  ],
};
const BG = 'admin/design-templates/abc.png';

beforeEach(() => {
  vi.clearAllMocks();
  mockInspect.mockResolvedValue({ head: PNG, size: 1000 });
});

describe('admin design-templates', () => {
  it('has no DELETE route (retire = HIDDEN)', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/design-templates/t1' });
    expect(res.statusCode).toBe(404);
  });

  it('POST rejects an invalid spec (unknown variable)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/design-templates',
      payload: {
        name: 'X',
        spec: {
          layers: [{ type: 'text', var: 'password', x: 1, y: 1, size: 20, color: '#000000' }],
        },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST rejects an unknown format', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/design-templates',
      payload: { name: 'X', format: 'BILLBOARD', spec: goodSpec },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST rejects a layer index beyond product_slots', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/design-templates',
      payload: {
        name: 'X',
        product_slots: 1,
        spec: {
          layers: [
            { type: 'text', var: 'price', x: 1, y: 1, size: 20, color: '#000000', index: 2 },
          ],
        },
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('POST creates a DRAFT for every plan by default and audits', async () => {
    mockCreate.mockResolvedValueOnce({ id: 't1', name: 'X', format: 'PORTRAIT_4_5' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/design-templates',
      payload: { name: 'X', spec: goodSpec },
    });
    expect(res.statusCode).toBe(201);
    const data = mockCreate.mock.calls[0]?.[0].data;
    expect(data.plans).toEqual(['STARTER', 'GROWTH', 'PRO']);
    expect(data.status).toBeUndefined(); // column default = DRAFT
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'CREATE' }) }),
    );
  });

  it('POST refuses a background key outside the design-template prefix', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/design-templates',
      payload: { name: 'X', spec: goodSpec, background_key: 'retailers/r1/secret.png' },
    });
    expect(res.statusCode).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST stores the verified key, never a client URL', async () => {
    mockCreate.mockResolvedValueOnce({ id: 't1', name: 'X' });
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/design-templates',
      payload: { name: 'X', spec: goodSpec, background_key: BG },
    });
    expect(mockCreate.mock.calls[0]?.[0].data.background_key).toBe(BG);
  });

  it('PUT re-validates the stored spec when product_slots shrinks', async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: 't1',
      format: 'PORTRAIT_4_5',
      product_slots: 2,
      spec: {
        layers: [{ type: 'text', var: 'price', x: 1, y: 1, size: 20, color: '#000000', index: 1 }],
      },
    });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/design-templates/t1',
      payload: { product_slots: 1 },
    });
    expect(res.statusCode).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('PUT 404s on an unknown id', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const app = await buildApp();
    const res = await app.inject({ method: 'PUT', url: '/design-templates/nope', payload: {} });
    expect(res.statusCode).toBe(404);
  });

  it('PUT /status rejects an unknown status and accepts HIDDEN', async () => {
    const app = await buildApp();
    const bad = await app.inject({
      method: 'PUT',
      url: '/design-templates/t1/status',
      payload: { status: 'DELETED' },
    });
    expect(bad.statusCode).toBe(422);

    mockFindUnique.mockResolvedValueOnce({ id: 't1', status: 'PUBLISHED' });
    mockUpdate.mockResolvedValueOnce({ id: 't1', status: 'HIDDEN' });
    const ok = await app.inject({
      method: 'PUT',
      url: '/design-templates/t1/status',
      payload: { status: 'HIDDEN' },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('upload-url requires content_length (RC-080)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/design-templates/upload-url',
      payload: { content_type: 'image/png', filename: 'a.png' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('upload-url mints a staged key under the design-template prefix', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/design-templates/upload-url',
      payload: { content_type: 'image/png', filename: 'a.png', content_length: 5000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.r2_key).toMatch(/^uploads\/pending\/admin\/design-templates\/.+\.png$/);
  });

  it('preview renders an unsaved draft and returns a data URL', async () => {
    mockRender.mockResolvedValueOnce(Buffer.from('jpegbytes'));
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/design-templates/preview',
      payload: { format: 'SQUARE', product_slots: 1, spec: goodSpec },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.image).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('preview refuses a background key outside the prefix', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/design-templates/preview',
      payload: {
        format: 'SQUARE',
        product_slots: 1,
        spec: goodSpec,
        background_key: 'retailers/r1/secret.png',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(mockDownload).not.toHaveBeenCalled();
  });
});
