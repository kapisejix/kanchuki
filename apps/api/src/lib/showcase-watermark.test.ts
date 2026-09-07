import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocked before the module graph loads (see backgrounds.test.ts for the pattern):
// - @kanchuki/ai is replaced with just downloadBuffer (the only runtime import),
// - @kanchuki/db is replaced with the two prisma accessors showcase-watermark uses
//   (retailer.logo_r2_key lookup + the settings-store auditLog read behind getSetting).
const mockDownloadBuffer = vi.fn();
const mockUploadBuffer = vi.fn();
const mockWatermark = vi.fn();
const mockRetailerFindUnique = vi.fn();
const mockAuditFindFirst = vi.fn();

vi.mock('@kanchuki/ai', () => ({
  downloadBuffer: mockDownloadBuffer,
  uploadBuffer: mockUploadBuffer,
  watermark: mockWatermark,
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    retailer: { findUnique: mockRetailerFindUnique },
    auditLog: { findFirst: mockAuditFindFirst },
  },
}));

const {
  DEFAULT_SHOWCASE_WATERMARK,
  mergeShowcaseWatermark,
  pickWatermarkLogoKey,
  getShowcaseWatermarkConfig,
  resolveWatermark,
  watermarkShowcaseDesign,
} = await import('./showcase-watermark.js');

describe('mergeShowcaseWatermark', () => {
  it('null / garbage saved blob → code defaults', () => {
    expect(mergeShowcaseWatermark(null)).toEqual(DEFAULT_SHOWCASE_WATERMARK);
    expect(mergeShowcaseWatermark('nope')).toEqual(DEFAULT_SHOWCASE_WATERMARK);
    // Non-numeric / unknown values fall back to defaults.
    expect(mergeShowcaseWatermark({ opacity: 'x', gravity: 'nowhere' })).toEqual(
      DEFAULT_SHOWCASE_WATERMARK,
    );
  });

  it('out-of-range numeric values clamp to the safe bounds', () => {
    // scale -3 → 0.02 floor, strip_count 999 → 24 cap (numbers clamp, don't break).
    expect(
      mergeShowcaseWatermark({ opacity: 5, scale: -3, gravity: 'nowhere', strip_count: 999 }),
    ).toEqual({
      ...DEFAULT_SHOWCASE_WATERMARK,
      opacity: 1,
      scale: 0.02,
      strip_count: 24,
    });
  });

  it('partial saved blob merges over defaults, valid values clamp', () => {
    const merged = mergeShowcaseWatermark({
      logo_r2_key: 'brand/wm.png',
      opacity: 0.7,
    });
    expect(merged.logo_r2_key).toBe('brand/wm.png');
    expect(merged.opacity).toBe(0.7);
    expect(merged.scale).toBe(DEFAULT_SHOWCASE_WATERMARK.scale); // untouched
    expect(merged.gravity).toBe('southeast');

    expect(mergeShowcaseWatermark({ opacity: 5 }).opacity).toBe(1);
    expect(mergeShowcaseWatermark({ strip_count: 0 }).strip_count).toBe(1);
  });
});

describe('pickWatermarkLogoKey', () => {
  it('global design → platform key only', () => {
    expect(
      pickWatermarkLogoKey({ retailerLogoKey: 'ret/x', platformLogoKey: 'p/wm', isGlobal: true }),
    ).toBe('p/wm');
    expect(
      pickWatermarkLogoKey({ retailerLogoKey: 'ret/x', platformLogoKey: null, isGlobal: true }),
    ).toBeNull();
  });

  it('retailer-owned → retailer logo, falling back to platform key', () => {
    expect(
      pickWatermarkLogoKey({ retailerLogoKey: 'ret/x', platformLogoKey: 'p/wm', isGlobal: false }),
    ).toBe('ret/x');
    expect(
      pickWatermarkLogoKey({ retailerLogoKey: null, platformLogoKey: 'p/wm', isGlobal: false }),
    ).toBe('p/wm');
    expect(
      pickWatermarkLogoKey({ retailerLogoKey: null, platformLogoKey: null, isGlobal: false }),
    ).toBeNull();
  });
});

describe('getShowcaseWatermarkConfig', () => {
  beforeEach(() => mockAuditFindFirst.mockReset());

  it('no saved setting → defaults', async () => {
    mockAuditFindFirst.mockResolvedValue(null);
    expect(await getShowcaseWatermarkConfig()).toEqual(DEFAULT_SHOWCASE_WATERMARK);
    expect(mockAuditFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { action: 'SETTING_showcase_watermark', resource_type: 'AdminSetting' },
      }),
    );
  });

  it('saved blob is read through the settings store', async () => {
    mockAuditFindFirst.mockResolvedValue({ metadata: { opacity: 0.5, strip_count: 9 } });
    const cfg = await getShowcaseWatermarkConfig();
    expect(cfg.opacity).toBe(0.5);
    expect(cfg.strip_count).toBe(9);
    expect(cfg.gravity).toBe('southeast');
  });
});

describe('resolveWatermark', () => {
  beforeEach(() => {
    mockDownloadBuffer.mockReset();
    mockRetailerFindUnique.mockReset();
    mockAuditFindFirst.mockReset();
    mockDownloadBuffer.mockImplementation(async (key: string) => Buffer.from(`logo:${key}`));
  });

  it('global owner, no platform key → built-in Kanchuki logo', async () => {
    mockAuditFindFirst.mockResolvedValue(null);
    const resolved = await resolveWatermark(null);
    expect(mockRetailerFindUnique).not.toHaveBeenCalled();
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
    expect(resolved.logo_source).toBe('builtin');
    expect(resolved.opacity).toBe(0.35);
    expect(resolved.gravity).toBe('southeast');
    expect(resolved.logoBuf.length).toBeGreaterThan(0); // real repo brand asset read
  });

  it('global owner, platform key configured → platform logo downloaded', async () => {
    mockAuditFindFirst.mockResolvedValue({ metadata: { logo_r2_key: 'global/wm.png' } });
    const resolved = await resolveWatermark(null);
    expect(resolved.logo_source).toBe('platform');
    expect(mockDownloadBuffer).toHaveBeenCalledWith('global/wm.png');
    expect(resolved.logoBuf.toString()).toBe('logo:global/wm.png');
  });

  it('retailer owner with a logo → retailer logo wins', async () => {
    mockAuditFindFirst.mockResolvedValue({ metadata: { logo_r2_key: 'global/wm.png' } });
    mockRetailerFindUnique.mockResolvedValue({ logo_r2_key: 'ret/x.png' });
    const resolved = await resolveWatermark('retailer_1');
    expect(mockRetailerFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'retailer_1' }, select: { logo_r2_key: true } }),
    );
    expect(resolved.logo_source).toBe('retailer');
    expect(mockDownloadBuffer).toHaveBeenCalledWith('ret/x.png');
  });

  it('retailer without a logo → falls through to the platform logo', async () => {
    mockAuditFindFirst.mockResolvedValue({ metadata: { logo_r2_key: 'global/wm.png' } });
    mockRetailerFindUnique.mockResolvedValue({ logo_r2_key: null });
    const resolved = await resolveWatermark('retailer_1');
    expect(resolved.logo_source).toBe('platform');
    expect(mockDownloadBuffer).toHaveBeenCalledWith('global/wm.png');
  });

  it('retailer without a logo and no platform key → built-in logo', async () => {
    mockAuditFindFirst.mockResolvedValue(null);
    mockRetailerFindUnique.mockResolvedValue({ logo_r2_key: null });
    const resolved = await resolveWatermark('retailer_1');
    expect(resolved.logo_source).toBe('builtin');
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
    expect(resolved.logoBuf.length).toBeGreaterThan(0);
  });
});

describe('watermarkShowcaseDesign', () => {
  beforeEach(() => {
    mockUploadBuffer.mockReset();
    mockWatermark.mockReset();
    mockWatermark.mockResolvedValue({ buffer: Buffer.from('wm.jpg'), width: 800, height: 600 });
  });

  it('downloads the raw, composites with resolved config, uploads the final JPEG', async () => {
    mockAuditFindFirst.mockResolvedValue({
      metadata: { enabled: true, logo_r2_key: 'p/wm.png' },
    });
    mockDownloadBuffer.mockResolvedValue(Buffer.from('raw.jpg'));
    mockDownloadBuffer.mockClear();

    const out = await watermarkShowcaseDesign({
      rawR2Key: 'showcase-designs/r1/raw/abc.jpg',
      finalR2Key: 'showcase-designs/r1/def.jpg',
      ownerRetailerId: 'retailer_1',
    });

    expect(mockDownloadBuffer).toHaveBeenCalledWith('showcase-designs/r1/raw/abc.jpg');
    expect(mockWatermark).toHaveBeenCalledWith(
      Buffer.from('raw.jpg'),
      expect.any(Buffer),
      expect.objectContaining({ opacity: 0.35, scale: 0.18, gravity: 'southeast' }),
    );
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      'showcase-designs/r1/def.jpg',
      Buffer.from('wm.jpg'),
      'image/jpeg',
    );
    expect(out).toEqual({ logo_source: 'platform', width: 800, height: 600 });
  });

  it('propagates watermark failures (invalid raw never reaches the DB)', async () => {
    mockAuditFindFirst.mockResolvedValue({ metadata: { enabled: true } });
    mockDownloadBuffer.mockResolvedValue(Buffer.from('not-an-image'));
    const err = new Error('Source is not a decodable image');
    err.name = 'WatermarkInputError';
    mockWatermark.mockRejectedValue(err);

    await expect(
      watermarkShowcaseDesign({
        rawR2Key: 'showcase-designs/global/raw/x.jpg',
        finalR2Key: 'showcase-designs/global/x.jpg',
        ownerRetailerId: null,
      }),
    ).rejects.toThrow('not a decodable image');
    expect(mockUploadBuffer).not.toHaveBeenCalled();
  });

  it('disabled config stores the raw upload as the final (no compositing, no logo fetch)', async () => {
    // No saved blob → defaults, enabled = false.
    mockAuditFindFirst.mockResolvedValue(null);
    mockDownloadBuffer.mockResolvedValue(Buffer.from('raw.jpg'));
    mockWatermark.mockClear();

    const out = await watermarkShowcaseDesign({
      rawR2Key: 'showcase-designs/global/raw/x.jpg',
      finalR2Key: 'showcase-designs/global/x.jpg',
      ownerRetailerId: null,
    });

    expect(mockWatermark).not.toHaveBeenCalled();
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      'showcase-designs/global/x.jpg',
      Buffer.from('raw.jpg'),
      'image/jpeg',
    );
    expect(out).toEqual({ logo_source: 'none', width: 0, height: 0 });
  });
});
