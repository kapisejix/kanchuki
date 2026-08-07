import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAdminTryOn } from './admin-tryon.js';

// Contract: run the self-hosted Fashion V-Tone pipeline (triggerTryOn) with a
// model photo + cleaned product photo and persist the result under the admin
// photo-cleanup R2 path, writing an ADMIN_TRYON audit entry on success AND on
// failure so the admin page's poll resolves either way.

const mockTriggerTryOn = vi.fn();
const mockSsrfSafeFetch = vi.fn();
const mockReadCappedBuffer = vi.fn();
const mockCompressImageToTarget = vi.fn();
const mockUploadBuffer = vi.fn();
const mockPublicUrl = vi.fn();
const mockAuditCreate = vi.fn();

vi.mock('@kanchuki/ai', () => ({
  triggerTryOn: (...args: unknown[]) => mockTriggerTryOn(...args),
  ssrfSafeFetch: (...args: unknown[]) => mockSsrfSafeFetch(...args),
  readCappedBuffer: (...args: unknown[]) => mockReadCappedBuffer(...args),
  compressImageToTarget: (...args: unknown[]) => mockCompressImageToTarget(...args),
  uploadBuffer: (...args: unknown[]) => mockUploadBuffer(...args),
  publicUrl: (...args: unknown[]) => mockPublicUrl(...args),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: {
    auditLog: {
      // Must return a thenable — the job's failure path chains .catch() on
      // the create call itself.
      create: (...args: unknown[]) => Promise.resolve(mockAuditCreate(...args)),
    },
  },
}));

const JOB = {
  job_id: 'abc-123',
  model_url: 'https://r2.example/models/m1.jpg',
  product_url: 'https://r2.example/products/p1.jpg',
  category: 'one-pieces',
} as const;

describe('handleAdminTryOn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes a completed ADMIN_TRYON audit entry with the R2 result URL', async () => {
    mockTriggerTryOn.mockResolvedValue({
      jobId: 'vton-1',
      status: 'completed',
      outputUrls: ['https://vtone.internal/result.png'],
      errorMessage: null,
      engine: 'vton',
    });
    mockSsrfSafeFetch.mockResolvedValue({ ok: true, status: 200 });
    mockReadCappedBuffer.mockResolvedValue(Buffer.from('png-bytes'));
    mockCompressImageToTarget.mockResolvedValue({
      buffer: Buffer.from('jpg-bytes'),
      unchanged: false,
    });
    mockUploadBuffer.mockResolvedValue(undefined);
    mockPublicUrl.mockReturnValue(
      'https://r2.example/admin/photo-cleanup-tests/abc-123-onmodel.jpg',
    );

    await handleAdminTryOn(JOB);

    // Passed through with the explicit vtoneCategory override (admin picker)
    expect(mockTriggerTryOn).toHaveBeenCalledWith({
      customerPhotoUrl: JOB.model_url,
      productPhotoUrl: JOB.product_url,
      vtoneCategory: 'one-pieces',
    });
    // Result fetched via the SSRF-safe bounded downloader (the engine returns
    // a public URL, not an R2 key) and persisted under the admin path.
    expect(mockSsrfSafeFetch).toHaveBeenCalledWith('https://vtone.internal/result.png');
    expect(mockCompressImageToTarget).toHaveBeenCalledWith(expect.any(Buffer));
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      'admin/photo-cleanup-tests/abc-123-onmodel.jpg',
      expect.any(Buffer),
      'image/jpeg',
    );

    const audit = mockAuditCreate.mock.calls[0]?.[0] as {
      data: { action: string; metadata: Record<string, unknown> };
    };
    expect(audit.data.action).toBe('ADMIN_TRYON');
    expect(audit.data.metadata.job_id).toBe('abc-123');
    expect(audit.data.metadata.status).toBe('completed');
    expect(audit.data.metadata.result_url).toBe(
      'https://r2.example/admin/photo-cleanup-tests/abc-123-onmodel.jpg',
    );
    expect(audit.data.metadata.category).toBe('one-pieces');
    expect(typeof audit.data.metadata.duration_ms).toBe('number');
  });

  it('writes a failed audit entry and re-throws when the engine fails', async () => {
    mockTriggerTryOn.mockRejectedValue(new Error('V-Tone service is cold-starting'));

    await expect(handleAdminTryOn(JOB)).rejects.toThrow('cold-starting');

    const audit = mockAuditCreate.mock.calls[0]?.[0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(audit.data.metadata.status).toBe('failed');
    expect(audit.data.metadata.error).toContain('cold-starting');
  });

  it('writes a failed audit entry when the engine returns no output URL', async () => {
    mockTriggerTryOn.mockResolvedValue({
      jobId: 'vton-2',
      status: 'completed',
      outputUrls: [],
      errorMessage: null,
      engine: 'vton',
    });

    await expect(handleAdminTryOn(JOB)).rejects.toThrow('no result');
    const audit = mockAuditCreate.mock.calls[0]?.[0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(audit.data.metadata.status).toBe('failed');
  });

  it('writes a failed audit entry when the result fetch fails after a completed run', async () => {
    mockTriggerTryOn.mockResolvedValue({
      jobId: 'vton-3',
      status: 'completed',
      outputUrls: ['https://vtone.internal/result.png'],
      errorMessage: null,
      engine: 'vton',
    });
    mockSsrfSafeFetch.mockResolvedValue({ ok: false, status: 500 });

    await expect(handleAdminTryOn(JOB)).rejects.toThrow('Failed to fetch try-on result');
    const audit = mockAuditCreate.mock.calls[0]?.[0] as {
      data: { metadata: Record<string, unknown> };
    };
    expect(audit.data.metadata.status).toBe('failed');
    expect(audit.data.metadata.error).toContain('Failed to fetch try-on result');
  });
});
