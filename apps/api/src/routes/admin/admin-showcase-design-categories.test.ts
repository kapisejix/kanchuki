// Route tests for admin Suits Design Category CRUD + related links (§5/§9).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const {
  mockFindMany,
  mockFindUnique,
  mockFindFirst,
  mockCreate,
  mockUpdate,
  mockDelete,
  mockAudit,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockFindUnique: vi.fn(),
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockAudit: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    showcaseDesignCategory: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      findFirst: mockFindFirst,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
    },
    auditLog: { create: mockAudit },
  },
}));

vi.mock('../admin-auth.js', () => ({ adminAuthPreHandler: async () => undefined }));

const { adminShowcaseDesignCategoryRoutes } = await import(
  './admin-showcase-design-categories.js'
);

const SAREEROW = {
  id: 'cat_saree',
  name: 'Saree',
  slug: 'saree',
  sort_order: 10,
  is_active: true,
  created_at: new Date('2026-09-07T10:00:00Z'),
  updated_at: new Date('2026-09-07T10:00:00Z'),
  _count: { designs: 0 },
  related_to: [],
  related_from: [],
};

async function buildApp() {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  await app.register(adminShowcaseDesignCategoryRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAudit.mockResolvedValue({});
});

describe('GET /showcase-design-categories', () => {
  it('returns categories with deduped symmetric related links', async () => {
    mockFindMany.mockResolvedValue([
      {
        ...SAREEROW,
        related_to: [{ id: 'cat_blouse', name: 'Blouse', slug: 'blouse' }],
        related_from: [{ id: 'cat_blouse', name: 'Blouse', slug: 'blouse' }],
      },
    ]);
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/showcase-design-categories' });
    expect(res.statusCode).toBe(200);
    // Blouse appears in both directions → deduped to one.
    expect(res.json().data[0].related).toHaveLength(1);
    await app.close();
  });
});

describe('POST /showcase-design-categories', () => {
  it('auto-derives the slug from the name', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ ...SAREEROW, name: 'Kids Lehenga', slug: 'kids-lehenga' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/showcase-design-categories',
      payload: { name: 'Kids Lehenga' },
    });
    expect(res.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: 'kids-lehenga' }) }),
    );
    await app.close();
  });

  it('409 on a duplicate name or slug', async () => {
    mockFindFirst.mockResolvedValue({ id: 'other' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/showcase-design-categories',
      payload: { name: 'Saree' },
    });
    expect(res.statusCode).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('422 on an invalid name', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/showcase-design-categories',
      payload: { name: '9 Lives' }, // must start with a letter
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

describe('PATCH /showcase-design-categories/:id', () => {
  it('renames → re-derives slug; explicit slug preserved', async () => {
    mockFindUnique.mockResolvedValue(SAREEROW);
    mockFindFirst.mockResolvedValue(null);
    mockUpdate.mockResolvedValue({ ...SAREEROW, name: 'Sari', slug: 'sari' });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/showcase-design-categories/cat_saree',
      payload: { name: 'Sari', slug: 'sari' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Sari', slug: 'sari' }) }),
    );
    await app.close();
  });

  it('deactivates without touching the slug', async () => {
    mockFindUnique.mockResolvedValue(SAREEROW);
    mockUpdate.mockResolvedValue({ ...SAREEROW, is_active: false });
    const app = await buildApp();
    const res = await app.inject({
      method: 'PATCH',
      url: '/showcase-design-categories/cat_saree',
      payload: { is_active: false },
    });
    expect(res.statusCode).toBe(200);
    expect(mockFindFirst).not.toHaveBeenCalled(); // no name/slug change
    await app.close();
  });
});

describe('PUT /showcase-design-categories/:id/related', () => {
  it('validates ids, clears both directions, reconnects the set (minus self)', async () => {
    mockFindUnique.mockResolvedValue(SAREEROW);
    mockFindMany.mockResolvedValue([
      { id: 'cat_blouse' },
      { id: 'cat_saree' }, // self included by admin — must be filtered out
    ]);
    mockUpdate.mockResolvedValue(SAREEROW);
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/showcase-design-categories/cat_saree/related',
      payload: { related_ids: ['cat_blouse', 'cat_saree'] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.related_ids).toEqual(['cat_blouse']);
    // clear related_to + related_from, then connect one-way
    expect(mockUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 'cat_saree' },
      data: { related_to: { set: [] } },
    });
    expect(mockUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: 'cat_saree' },
      data: { related_from: { set: [] } },
    });
    expect(mockUpdate).toHaveBeenNthCalledWith(3, {
      where: { id: 'cat_saree' },
      data: { related_to: { connect: [{ id: 'cat_blouse' }] } },
    });
    await app.close();
  });

  it('422 when a related id is not a real category', async () => {
    mockFindUnique.mockResolvedValue(SAREEROW);
    mockFindMany.mockResolvedValue([{ id: 'cat_blouse' }]); // request has an extra bogus id
    const app = await buildApp();
    const res = await app.inject({
      method: 'PUT',
      url: '/showcase-design-categories/cat_saree/related',
      payload: { related_ids: ['cat_blouse', 'bogus'] },
    });
    expect(res.statusCode).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('DELETE /showcase-design-categories/:id', () => {
  it('refuses deletion while designs reference the category', async () => {
    mockFindUnique.mockResolvedValue({ ...SAREEROW, _count: { designs: 3 } });
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/showcase-design-categories/cat_saree' });
    expect(res.statusCode).toBe(422);
    expect(mockDelete).not.toHaveBeenCalled();
    await app.close();
  });

  it('deletes an empty category', async () => {
    mockFindUnique.mockResolvedValue(SAREEROW);
    mockDelete.mockResolvedValue({ id: SAREEROW.id });
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/showcase-design-categories/cat_saree' });
    expect(res.statusCode).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cat_saree' } }));
    await app.close();
  });
});
