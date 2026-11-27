// RC-172 follow-up: accounts deleted BEFORE the erasure fix still carry the photo-derived My Style
// profile. The sweep nulls those four columns, only on already-deleted accounts, dry-run first.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ count: vi.fn(), updateMany: vi.fn() }));
vi.mock('@kanchuki/db', () => ({
  prisma: { customerAccount: { count: m.count, updateMany: m.updateMany } },
}));

import { sweepDeletedAccountStyle } from './sweep-deleted-account-style.js';

const WHERE = {
  deleted_at: { not: null },
  OR: [
    { skin_undertone: { not: null } },
    { skin_depth: { not: null } },
    { body_frame: { not: null } },
    { style_profile_at: { not: null } },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  m.count.mockResolvedValue(3);
  m.updateMany.mockResolvedValue({ count: 3 });
});

describe('sweepDeletedAccountStyle', () => {
  it('dry run counts the rows and writes nothing', async () => {
    const r = await sweepDeletedAccountStyle({ apply: false });
    expect(r).toEqual({ apply: false, matched: 3, updated: 0 });
    expect(m.count).toHaveBeenCalledWith({ where: WHERE });
    expect(m.updateMany).not.toHaveBeenCalled();
  });

  it('apply nulls exactly the derived columns (and their source), only where the account is deleted', async () => {
    const r = await sweepDeletedAccountStyle({ apply: true });
    expect(r).toEqual({ apply: true, matched: 3, updated: 3 });
    expect(m.updateMany).toHaveBeenCalledWith({
      where: WHERE,
      data: {
        skin_undertone: null,
        skin_depth: null,
        body_frame: null,
        style_profile_at: null,
        profile_source: null,
      },
    });
  });

  it('is safe to re-run: nothing matched means nothing written', async () => {
    m.count.mockResolvedValue(0);
    const r = await sweepDeletedAccountStyle({ apply: true });
    expect(r).toEqual({ apply: true, matched: 0, updated: 0 });
    expect(m.updateMany).not.toHaveBeenCalled();
  });
});
