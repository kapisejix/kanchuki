// H5-2 follow-up / RC-152 — hourly backstop that deletes staged uploads nobody confirmed.
// Presign routes hand out `uploads/pending/...` keys and verifyUpload promotes them; anything
// older than the TTL was abandoned (or is a planted payload) and must not stay on the public CDN.
// The assertions that carry the weight: it only ever touches the staging prefix, and only objects
// whose age is known and past the TTL.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockList, mockDelete } = vi.hoisted(() => ({ mockList: vi.fn(), mockDelete: vi.fn() }));

vi.mock('@kanchuki/ai', () => ({
  listObjectsByPrefix: mockList,
  deleteObject: mockDelete,
}));

import { STAGING_PREFIX } from '../lib/upload-guard.js';
import {
  STAGED_UPLOAD_BATCH,
  STAGED_UPLOAD_TTL_HOURS,
  handleStagedUploadSweep,
} from './staged-upload-sweep.js';

const HOUR = 3600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR);
const obj = (key: string, modified: Date | null) => ({ key, size: 1, modified });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.R2_ACCOUNT_ID = 'acct';
  mockList.mockResolvedValue([]);
  mockDelete.mockResolvedValue(undefined);
});

describe('handleStagedUploadSweep', () => {
  it('lists only the staging prefix', async () => {
    await handleStagedUploadSweep();
    expect(mockList).toHaveBeenCalledWith(STAGING_PREFIX, expect.any(Number));
  });

  it('deletes staged objects past the TTL and keeps younger ones', async () => {
    mockList.mockResolvedValue([
      obj(`${STAGING_PREFIX}catalog-source/r1/old.jpg`, ago(STAGED_UPLOAD_TTL_HOURS + 1)),
      obj(`${STAGING_PREFIX}catalog-source/r1/young.jpg`, ago(STAGED_UPLOAD_TTL_HOURS - 1)),
    ]);
    const res = await handleStagedUploadSweep();
    expect(mockDelete).toHaveBeenCalledExactlyOnceWith(
      `${STAGING_PREFIX}catalog-source/r1/old.jpg`,
    );
    expect(res).toMatchObject({ scanned: 2, deleted: 1, failed: 0 });
  });

  it('never deletes a key outside the staging prefix, however old', async () => {
    mockList.mockResolvedValue([
      obj('retailers/r1/products/live.jpg', ago(500)),
      obj('catalog-import/r1/abc.jpg', ago(500)),
    ]);
    await handleStagedUploadSweep();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('keeps an object whose age is unknown', async () => {
    mockList.mockResolvedValue([obj(`${STAGING_PREFIX}x/unknown.jpg`, null)]);
    await handleStagedUploadSweep();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('one failing delete does not stop the rest and is counted', async () => {
    mockList.mockResolvedValue([
      obj(`${STAGING_PREFIX}a.jpg`, ago(100)),
      obj(`${STAGING_PREFIX}b.jpg`, ago(100)),
      obj(`${STAGING_PREFIX}c.jpg`, ago(100)),
    ]);
    mockDelete.mockRejectedValueOnce(new Error('R2 down'));
    const res = await handleStagedUploadSweep();
    expect(mockDelete).toHaveBeenCalledTimes(3);
    expect(res).toMatchObject({ deleted: 2, failed: 1 });
  });

  it('deletes at most one batch per run', async () => {
    mockList.mockResolvedValue(
      Array.from({ length: STAGED_UPLOAD_BATCH + 50 }, (_, i) =>
        obj(`${STAGING_PREFIX}k${i}.jpg`, ago(100)),
      ),
    );
    const res = await handleStagedUploadSweep();
    expect(mockDelete).toHaveBeenCalledTimes(STAGED_UPLOAD_BATCH);
    expect(res.deleted).toBe(STAGED_UPLOAD_BATCH);
  });

  it('does nothing where R2 is not configured', async () => {
    process.env.R2_ACCOUNT_ID = '';
    const res = await handleStagedUploadSweep();
    expect(mockList).not.toHaveBeenCalled();
    expect(res.skipped_unconfigured).toBe(true);
  });
});

describe('cron registration', () => {
  const idx = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
  it('is routed and scheduled hourly without a repeat limit (RC-062)', () => {
    expect(idx).toMatch(/case 'staged-upload-sweep':\s*return handleStagedUploadSweep\(\)/);
    const at = idx.indexOf("'staged-upload-sweep',\n    {},");
    expect(at).toBeGreaterThan(0);
    const block = idx.slice(at, at + 200);
    expect(block).toMatch(/pattern: '50 \* \* \* \*'/);
    expect(block).not.toMatch(/limit:/);
  });
});
