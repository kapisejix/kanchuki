import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock('@kanchuki/ai', () => ({ downloadBuffer: vi.fn(), renderDesign: vi.fn() }));
vi.mock('@kanchuki/db', () => ({ prisma: { designTemplate: { findFirst: m.findFirst } } }));

const { findPublishedDesign, findPublishedAiPoster } = await import('./design-post-render.js');

beforeEach(() => vi.clearAllMocks());

describe('findPublishedDesign', () => {
  it('excludes AI styles (ai_prompt must be null)', async () => {
    m.findFirst.mockResolvedValue(null);
    await findPublishedDesign('d1', 'STARTER');
    expect(m.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'd1',
      status: 'PUBLISHED',
      plans: { has: 'STARTER' },
      ai_prompt: null,
    });
  });
});

describe('findPublishedAiPoster', () => {
  it('only matches a PUBLISHED, plan-allowed row whose ai_prompt is set', async () => {
    m.findFirst.mockResolvedValue({ id: 'd1' });
    await findPublishedAiPoster('d1', 'GROWTH');
    expect(m.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'd1',
      status: 'PUBLISHED',
      plans: { has: 'GROWTH' },
      ai_prompt: { not: null },
    });
  });
});
