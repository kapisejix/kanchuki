import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRewatermarkShowcaseDesigns } from './rewatermark-showcase-designs.js';

// Contract: on an admin watermark-config change, walk every showcase design
// that kept a raw upload (original_r2_key), re-composite the final under a
// NEW key with the current config + per-row live logo resolution, update the
// row, best-effort delete the OLD final (never the raw), never fail the whole
// pass on one bad row, write one audit entry, and no-op cleanly when R2 is
// unconfigured.

// Mocks must be vi.hoisted: vi.mock factories are hoisted above these const
// declarations, so a direct reference in a factory throws a TDZ error. Wrapped
// mocks (@kanchuki/db + @kanchuki/ai) are delegated lazily via arrows.
const {
  mockFindMany,
  mockUpdate,
  mockAuditCreate,
  mockWatermark,
  mockDeleteObject,
  mockPublicUrl,
} = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
  mockUpdate: vi.fn(),
  mockAuditCreate: vi.fn(),
  mockWatermark: vi.fn(),
  mockDeleteObject: vi.fn(),
  mockPublicUrl: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    showcaseDesign: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) },
  },
}));

vi.mock('../lib/showcase-watermark.js', () => ({
  watermarkShowcaseDesign: (...args: unknown[]) => mockWatermark(...args),
}));

vi.mock('@kanchuki/ai', () => ({
  deleteObject: (...args: unknown[]) => mockDeleteObject(...args),
  publicUrl: (...args: unknown[]) => mockPublicUrl(...args),
}));

const ROW = {
  id: 'design_1',
  retailer_id: 'retailer_1',
  r2_key: 'showcase-designs/retailer_1/old-final.jpg',
  original_r2_key: 'showcase-designs/retailer_1/raw/raw1.jpg',
};

const GLOBAL_ROW = {
  id: 'design_2',
  retailer_id: null,
  r2_key: 'showcase-designs/global/old-global.jpg',
  original_r2_key: 'showcase-designs/global/raw/raw2.jpg',
};

const NO_RAW_ROW = {
  id: 'design_3',
  retailer_id: null,
  r2_key: 'showcase-designs/global/old3.jpg',
  original_r2_key: null,
};

type UpdateArgs = {
  where?: { id?: string };
  data?: { r2_key?: string; image_url?: string };
};

describe('handleRewatermarkShowcaseDesigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Must be `delete`, not `= undefined` — Node coerces the latter to the
    // truthy STRING 'undefined' (compress-r2-images test note).
    // biome-ignore lint/performance/noDelete: env var must be removed, not set undefined
    delete process.env.R2_ACCOUNT_ID;
    mockUpdate.mockImplementation(async (args: UpdateArgs) => ({
      id: args.where?.id,
      ...args.data,
    }));
    mockDeleteObject.mockResolvedValue(undefined);
    mockPublicUrl.mockImplementation((key: string) => `https://cdn.example.com/${key}`);
  });

  it('skips the whole pass without touching the DB when R2_ACCOUNT_ID is unset', async () => {
    const result = await handleRewatermarkShowcaseDesigns();

    expect(result.skipped_unconfigured).toBe(true);
    expect(result.scanned).toBe(0);
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });

  it('re-watermarks retailer + global rows: new final key, DB row updated, old final deleted, raw kept', async () => {
    process.env.R2_ACCOUNT_ID = 'acct';
    mockFindMany.mockResolvedValue([ROW, GLOBAL_ROW]);
    mockWatermark.mockResolvedValue({ logo_source: 'platform' });

    const result = await handleRewatermarkShowcaseDesigns();

    expect(result.scanned).toBe(2);
    expect(result.rewatermarked).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skipped_no_original).toBe(0);

    // Two watermark calls, one per row, each fed the row's RAW + current owner.
    expect(mockWatermark).toHaveBeenCalledTimes(2);
    expect(mockWatermark).toHaveBeenNthCalledWith(1, {
      rawR2Key: ROW.original_r2_key,
      finalR2Key: expect.stringMatching(/^showcase-designs\/retailer_1\/[a-z0-9]+\.jpg$/),
      ownerRetailerId: 'retailer_1',
    });
    expect(mockWatermark).toHaveBeenNthCalledWith(2, {
      rawR2Key: GLOBAL_ROW.original_r2_key,
      finalR2Key: expect.stringMatching(/^showcase-designs\/global\/[a-z0-9]+\.jpg$/),
      ownerRetailerId: null, // global → platform logo
    });

    // Both rows updated to their new key; old finals deleted; raw never touched.
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    const [firstUpdate, secondUpdate] = mockUpdate.mock.calls.map((c) => c[0] as UpdateArgs);
    expect(firstUpdate?.where?.id).toBe('design_1');
    expect(firstUpdate?.data?.r2_key).not.toBe(ROW.r2_key);
    expect(firstUpdate?.data?.image_url).toBe(
      `https://cdn.example.com/${firstUpdate?.data?.r2_key}`,
    );
    expect(secondUpdate?.where?.id).toBe('design_2');
    expect(mockDeleteObject).toHaveBeenCalledTimes(2);
    expect(mockDeleteObject).toHaveBeenCalledWith(ROW.r2_key);
    expect(mockDeleteObject).toHaveBeenCalledWith(GLOBAL_ROW.r2_key);
    expect(mockDeleteObject).not.toHaveBeenCalledWith(expect.stringContaining('/raw/'));
  });

  it('skips rows without an original raw and counts them', async () => {
    process.env.R2_ACCOUNT_ID = 'acct';
    mockFindMany.mockResolvedValue([ROW, NO_RAW_ROW]);
    mockWatermark.mockResolvedValue({ logo_source: 'builtin' });

    const result = await handleRewatermarkShowcaseDesigns();

    expect(result.scanned).toBe(2);
    expect(result.rewatermarked).toBe(1);
    expect(result.skipped_no_original).toBe(1);
    expect(mockWatermark).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('continues past a failing row and writes the audit entry with counts + trigger', async () => {
    process.env.R2_ACCOUNT_ID = 'acct';
    mockFindMany.mockResolvedValue([ROW, GLOBAL_ROW]);
    mockWatermark
      .mockRejectedValueOnce(new Error('corrupt raw'))
      .mockResolvedValueOnce({ logo_source: 'platform' });

    const result = await handleRewatermarkShowcaseDesigns({ triggered_by: 'admin-config-change' });

    expect(result.failed).toBe(1);
    expect(result.rewatermarked).toBe(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1); // only the successful row

    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
    const audit = mockAuditCreate.mock.calls[0]?.[0] as {
      data: {
        actor_type: string;
        action: string;
        resource_type: string;
        metadata: Record<string, unknown>;
      };
    };
    expect(audit.data.actor_type).toBe('system');
    expect(audit.data.action).toBe('REWATERMARK_SHOWCASE_DESIGNS');
    expect(audit.data.resource_type).toBe('ShowcaseDesign');
    expect(audit.data.metadata.scanned).toBe(2);
    expect(audit.data.metadata.failed).toBe(1);
    expect(audit.data.metadata.rewatermarked).toBe(1);
    expect(audit.data.metadata.triggered_by).toBe('admin-config-change');
    expect(typeof audit.data.metadata.duration_seconds).toBe('number');
  });

  it('defaults the audit trigger to admin-config-change when called by the worker', async () => {
    process.env.R2_ACCOUNT_ID = 'acct';
    mockFindMany.mockResolvedValue([]);

    await handleRewatermarkShowcaseDesigns();

    const audit = mockAuditCreate.mock.calls[0]?.[0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(audit.data.metadata.triggered_by).toBe('admin-config-change');
  });
});
