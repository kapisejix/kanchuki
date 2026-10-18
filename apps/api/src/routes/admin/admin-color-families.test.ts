// Route tests for admin colour-family alias CRUD (F-045 My Style, PR-2 T5).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../plugins/error-handler.js';

const { mockFindMany, mockFindUnique, mockCreate, mockUpdate, mockAudit, mockClear } = vi.hoisted(
  () => ({
    mockFindMany: vi.fn(),
    mockFindUnique: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockAudit: vi.fn(),
    mockClear: vi.fn(),
  }),
);

vi.mock('@kanchuki/db', () => ({
  prisma: {
    // No `delete` on purpose (RC-049): the route must never need one.
    colorFamily: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      create: mockCreate,
      update: mockUpdate,
    },
    auditLog: { create: mockAudit },
  },
}));

vi.mock('../admin-auth.js', () => ({ adminAuthPreHandler: async () => undefined }));
vi.mock('../../lib/color-families.js', () => ({ clearColorFamilyCache: mockClear }));

const { adminColorFamilyRoutes } = await import('./admin-color-families.js');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'cf_yellow',
  name: 'yellow',
  aliases: ['mustard', 'haldi'],
  is_active: true,
  created_at: new Date('2026-10-17T00:00:00Z'),
  updated_at: new Date('2026-10-17T00:00:00Z'),
  ...over,
});
const ALL = [
  row(),
  row({ id: 'cf_pink', name: 'pink', aliases: ['gulabi'] }),
  row({ id: 'cf_teal', name: 'teal', aliases: ['peacock blue'], is_active: false }),
];

async function buildApp(role = 'SUPER_ADMIN') {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  // adminAuthPreHandler is mocked out; stand in for what it sets on a real request.
  app.addHook('onRequest', async (request) => {
    request.adminRole = role;
    request.adminId = 'admin@test';
  });
  await app.register(adminColorFamilyRoutes);
  await app.ready();
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindMany.mockResolvedValue(ALL.map((r) => ({ ...r, aliases: [...r.aliases] })));
  mockAudit.mockResolvedValue({});
  mockCreate.mockImplementation(async ({ data }) => row({ id: 'cf_new', ...data }));
  mockUpdate.mockImplementation(async ({ where, data }) => row({ id: where.id, ...data }));
});

describe('GET /color-families', () => {
  it('lists every family including inactive ones', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/color-families' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toHaveLength(3);
    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    await app.close();
  });
});

describe('POST /color-families', () => {
  const post = async (payload: unknown) => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/color-families',
      payload: payload as object,
    });
    await app.close();
    return res;
  };

  it('creates a family: lowercased + cleaned, audited, cache cleared', async () => {
    const res = await post({ name: '  Lavender  Blue ', aliases: ['Periwinkle', 'periwinkle '] });
    expect(res.statusCode).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith({
      data: { name: 'lavender blue', aliases: ['periwinkle'] },
    });
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('defaults aliases to empty', async () => {
    await post({ name: 'rust' });
    expect(mockCreate.mock.calls[0]?.[0].data.aliases).toEqual([]);
  });

  it.each([
    ['empty name', { name: '' }],
    ['bad characters', { name: 'red<script>' }],
    ['too long', { name: 'x'.repeat(41) }],
    ['bad alias', { name: 'rust', aliases: ['ok', '!!'] }],
    [
      'too many aliases',
      { name: 'rust', aliases: Array.from({ length: 41 }, (_, i) => `rust${i}`) },
    ],
    ['alias under 3 chars', { name: 'rust', aliases: ['re'] }],
    ['stoplisted alias', { name: 'rust', aliases: ['Dark'] }],
  ])('rejects %s with 422', async (_label, payload) => {
    const res = await post(payload);
    expect(res.statusCode).toBe(422);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('409 when the name is already a family', async () => {
    expect((await post({ name: 'Pink' })).statusCode).toBe(409);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("409 when the name is already another family's alias (would shadow it)", async () => {
    expect((await post({ name: 'mustard' })).statusCode).toBe(409);
  });

  it('409 when an alias already belongs to another family (also an inactive one)', async () => {
    const own = await post({ name: 'rust', aliases: ['haldi'] });
    expect(own.statusCode).toBe(409);
    expect(own.json().error.message).toContain('yellow');
    expect((await post({ name: 'rust', aliases: ['peacock blue'] })).statusCode).toBe(409);
    expect((await post({ name: 'rust', aliases: ['pink'] })).statusCode).toBe(409); // another family's NAME
  });

  it("422 when an alias repeats the new family's own name", async () => {
    expect((await post({ name: 'rust', aliases: ['Rust'] })).statusCode).toBe(422);
  });

  it('409 (not 500) when the unique-name constraint fires in a race', async () => {
    mockCreate.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    expect((await post({ name: 'rust' })).statusCode).toBe(409);
  });
});

describe('PATCH /color-families/:id', () => {
  const patch = async (id: string, payload: unknown, role = 'SUPER_ADMIN') => {
    const app = await buildApp(role);
    const res = await app.inject({
      method: 'PATCH',
      url: `/color-families/${id}`,
      payload: payload as object,
    });
    await app.close();
    return res;
  };

  it('replaces the alias list (cleaned, deduped), audited, cache cleared', async () => {
    mockFindUnique.mockResolvedValue(row());
    const res = await patch('cf_yellow', { aliases: ['Mustard', 'lemon  yellow', 'mustard'] });
    expect(res.statusCode).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'cf_yellow' },
      data: { aliases: ['mustard', 'lemon yellow'] },
    });
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it('toggles is_active (the only way to retire a family)', async () => {
    mockFindUnique.mockResolvedValue(row());
    await patch('cf_yellow', { is_active: false });
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'cf_yellow' },
      data: { is_active: false },
    });
  });

  it('audit row records the actor and before/after values', async () => {
    mockFindUnique.mockResolvedValue(row());
    await patch('cf_yellow', { aliases: ['haldi'] });
    expect(mockAudit.mock.calls[0]?.[0].data.metadata).toEqual({
      name: 'yellow',
      admin: 'admin@test',
      before: { aliases: ['mustard', 'haldi'], is_active: true },
      after: { aliases: ['haldi'], is_active: true },
    });
  });

  describe('standard ADMIN role', () => {
    it('may add aliases', async () => {
      mockFindUnique.mockResolvedValue(row());
      const res = await patch('cf_yellow', { aliases: ['mustard', 'haldi', 'canary'] }, 'ADMIN');
      expect(res.statusCode).toBe(200);
    });

    it('403 when removing an alias', async () => {
      mockFindUnique.mockResolvedValue(row());
      expect((await patch('cf_yellow', { aliases: ['haldi'] }, 'ADMIN')).statusCode).toBe(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('403 when toggling is_active', async () => {
      mockFindUnique.mockResolvedValue(row());
      expect((await patch('cf_yellow', { is_active: false }, 'ADMIN')).statusCode).toBe(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  it('keeps an alias the family already owns (no self-conflict)', async () => {
    mockFindUnique.mockResolvedValue(row());
    expect((await patch('cf_yellow', { aliases: ['haldi', 'canary'] })).statusCode).toBe(200);
  });

  it('409 when an alias is owned by another family', async () => {
    mockFindUnique.mockResolvedValue(row());
    const res = await patch('cf_yellow', { aliases: ['gulabi'] });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toContain('pink');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("409 when an alias is another family's name", async () => {
    mockFindUnique.mockResolvedValue(row());
    expect((await patch('cf_yellow', { aliases: ['teal'] })).statusCode).toBe(409);
  });

  it("422 when an alias equals the family's own name", async () => {
    mockFindUnique.mockResolvedValue(row());
    expect((await patch('cf_yellow', { aliases: ['yellow'] })).statusCode).toBe(422);
  });

  it('name is immutable: a rename is rejected (products.color_family + palettes store it)', async () => {
    mockFindUnique.mockResolvedValue(row());
    const res = await patch('cf_yellow', { name: 'gold' });
    expect(res.statusCode).toBe(422);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('422 on an empty body', async () => {
    mockFindUnique.mockResolvedValue(row());
    expect((await patch('cf_yellow', {})).statusCode).toBe(422);
  });

  it('404 for an unknown id', async () => {
    mockFindUnique.mockResolvedValue(null);
    expect((await patch('nope', { is_active: false })).statusCode).toBe(404);
  });
});

describe('no hard delete (RC-049)', () => {
  it('exposes no DELETE route', async () => {
    const app = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/color-families/cf_yellow' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
