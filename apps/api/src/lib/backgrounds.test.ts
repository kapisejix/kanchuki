import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFindFirst = vi.fn();

vi.mock('@kanchuki/db', () => ({
  prisma: {
    backgroundImage: { findFirst: mockFindFirst },
  },
}));

const { pickContrastBackground } = await import('./backgrounds.js');

describe('pickContrastBackground', () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it('dark garment → newest active LIGHT backdrop', async () => {
    mockFindFirst.mockResolvedValue({ image_url: 'https://cdn/x/light.jpg' });
    const url = await pickContrastBackground('dark');
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { is_active: true, tone: 'LIGHT' },
      orderBy: { created_at: 'desc' },
    });
    expect(url).toBe('https://cdn/x/light.jpg');
  });

  it('light garment → newest active DARK backdrop', async () => {
    mockFindFirst.mockResolvedValue({ image_url: 'https://cdn/x/dark.jpg' });
    const url = await pickContrastBackground('light');
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { is_active: true, tone: 'DARK' },
      orderBy: { created_at: 'desc' },
    });
    expect(url).toBe('https://cdn/x/dark.jpg');
  });

  it('no matching backdrop → null (caller falls back to white default)', async () => {
    mockFindFirst.mockResolvedValue(null);
    expect(await pickContrastBackground('dark')).toBeNull();
  });
});
