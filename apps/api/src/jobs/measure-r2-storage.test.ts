import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleMeasureR2Storage } from './measure-r2-storage.js';

// Contract: measure live R2 storage (listObjects rollup via @kanchuki/ai) and
// write an R2_STORAGE_MEASURE audit entry with the totals + duration so the
// admin Storage Report page can surface it next to the savings report.

const mockMeasure = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@kanchuki/ai', () => ({
  measureR2Storage: (...args: unknown[]) => mockMeasure(...args),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    auditLog: {
      create: (...args: unknown[]) => mockAuditCreate(...args),
    },
  },
}));

const MEASUREMENT = {
  bucket: 'kanchuki-prod',
  total_objects: 12_345,
  total_bytes: 1_500_000_000,
  image_objects: 10_000,
  image_bytes: 900_000_000,
  image_pct: 60,
  by_prefix: [
    { prefix: 'retailers', count: 11_000, bytes: 1_300_000_000, image_bytes: 850_000_000 },
    { prefix: 'backups', count: 200, bytes: 200_000_000, image_bytes: 0 },
  ],
};

describe('handleMeasureR2Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes an R2_STORAGE_MEASURE audit entry with the measurement + duration', async () => {
    mockMeasure.mockResolvedValue(MEASUREMENT);

    await handleMeasureR2Storage();

    const audit = mockAuditCreate.mock.calls[0]?.[0] as {
      data: {
        actor_type: string;
        action: string;
        resource_type: string;
        metadata: Record<string, unknown>;
      };
    };
    expect(audit.data.actor_type).toBe('system');
    expect(audit.data.action).toBe('R2_STORAGE_MEASURE');
    expect(audit.data.resource_type).toBe('R2Storage');
    expect(audit.data.metadata.total_objects).toBe(12_345);
    expect(audit.data.metadata.total_bytes).toBe(1_500_000_000);
    expect(audit.data.metadata.image_bytes).toBe(900_000_000);
    expect(audit.data.metadata.by_prefix).toHaveLength(2);
    expect(typeof audit.data.metadata.duration_seconds).toBe('number');
  });

  it('propagates a measureR2Storage failure (R2 unconfigured) so the worker logs it', async () => {
    mockMeasure.mockRejectedValue(new Error('R2 not configured on this environment'));

    await expect(handleMeasureR2Storage()).rejects.toThrow('R2 not configured');
    expect(mockAuditCreate).not.toHaveBeenCalled();
  });
});
