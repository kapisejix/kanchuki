// Bug-hunt 2026-11-28 #3/#4: vault writes must be a plain INSERT (createMany, the role has
// no SELECT for RETURNING) and concurrent first callers must all get the client.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMany, create, ctor } = vi.hoisted(() => ({
  createMany: vi.fn().mockResolvedValue({ count: 1 }),
  create: vi.fn(),
  ctor: vi.fn(),
}));

vi.mock('./generated/vault/index.js', () => ({
  PrismaClient: class {
    deletedRecord = { createMany, create };
    constructor() {
      ctor();
    }
  },
}));

describe('vaultDelete', () => {
  beforeEach(() => {
    vi.resetModules();
    createMany.mockClear();
    create.mockClear();
    ctor.mockClear();
    process.env.VAULT_DATABASE_URL = 'postgresql://ci:ci@localhost:5432/ci_db_unused';
  });

  it('concurrent first calls during cold init all write, via createMany (no RETURNING)', async () => {
    const { vaultDelete } = await import('./vault.js');
    await Promise.all(
      ['a', 'b', 'c'].map((id) =>
        vaultDelete({ source_table: 'products', source_id: id, payload: { id } }),
      ),
    );
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(3);
    expect(create).not.toHaveBeenCalled();
    expect(createMany.mock.calls.map((c) => c[0].data.source_id)).toEqual(['a', 'b', 'c']);
  });
});
