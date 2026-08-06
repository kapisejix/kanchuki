import { describe, expect, it } from 'vitest';
import { parseTryOnResult } from './admin-photo-cleanup.js';

// Contract: parse ADMIN_TRYON audit metadata (written by the admin-tryon job)
// into typed feed rows for the Photo Cleanup Test page. Completed rows carry
// the R2 result URL; anything without one renders as failed so the page never
// shows a broken image tile.

describe('parseTryOnResult', () => {
  it('maps a completed run onto a typed row with ISO timestamp', () => {
    const row = parseTryOnResult('log-1', new Date('2026-08-08T09:15:00Z'), {
      job_id: 'abc-123',
      status: 'completed',
      result_url: 'https://r2.example/admin/photo-cleanup-tests/abc-123-onmodel.jpg',
      model_url: 'https://r2.example/models/m1.jpg',
      product_url: 'https://r2.example/products/p1.jpg',
      category: 'one-pieces',
      duration_ms: 42_500,
    });

    expect(row).toEqual({
      id: 'log-1',
      job_id: 'abc-123',
      status: 'completed',
      result_url: 'https://r2.example/admin/photo-cleanup-tests/abc-123-onmodel.jpg',
      error: null,
      model_url: 'https://r2.example/models/m1.jpg',
      product_url: 'https://r2.example/products/p1.jpg',
      category: 'one-pieces',
      duration_ms: 42_500,
      ran_at: '2026-08-08T09:15:00.000Z',
    });
  });

  it('maps a failed run with the error message', () => {
    const row = parseTryOnResult('log-2', new Date(), {
      job_id: 'abc-124',
      status: 'failed',
      error: 'V-Tone service is cold-starting',
      category: 'tops',
    });

    expect(row.status).toBe('failed');
    expect(row.result_url).toBeNull();
    expect(row.error).toBe('V-Tone service is cold-starting');
    expect(row.category).toBe('tops');
  });

  it('treats a completed status with no result_url as failed (never a broken tile)', () => {
    const row = parseTryOnResult('log-3', new Date(), {
      job_id: 'abc-125',
      status: 'completed',
    });

    expect(row.status).toBe('failed');
    expect(row.result_url).toBeNull();
  });

  it('survives null metadata without throwing', () => {
    const row = parseTryOnResult('log-4', new Date(), null);

    expect(row.job_id).toBe('');
    expect(row.status).toBe('failed');
    expect(row.result_url).toBeNull();
    expect(row.category).toBe('tops'); // default
    expect(row.duration_ms).toBeNull();
  });
});
