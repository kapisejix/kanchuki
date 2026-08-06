import { describe, expect, it } from 'vitest';
import { parseCompressionRun, summarizeCompressionRuns } from './admin-storage.js';

// Contract: parse the COMPRESS_R2_IMAGES audit metadata (written by the daily
// cron) into typed runs, and roll those up into a summary — treating
// skipped_unconfigured runs as no-ops that must NOT inflate savings.

const meta = {
  scanned: 345,
  compressed: 273,
  already_fine: 60,
  skipped: 11,
  failed: 0,
  bytes_before: 95_000_000,
  bytes_after: 34_000_000,
  bytes_saved: 61_000_000,
  skipped_unconfigured: false,
  triggered_by: 'schedule',
  duration_seconds: 96.5,
  max_bytes: 81920,
  exclusions: ['measurements/', '/kyc/'],
};

describe('parseCompressionRun', () => {
  it('maps audit metadata onto a typed run with ISO timestamp', () => {
    const run = parseCompressionRun('log-1', new Date('2026-08-06T04:30:00Z'), meta);

    expect(run).toEqual({
      id: 'log-1',
      created_at: '2026-08-06T04:30:00.000Z',
      triggered_by: 'schedule',
      skipped_unconfigured: false,
      scanned: 345,
      compressed: 273,
      already_fine: 60,
      skipped: 11,
      failed: 0,
      bytes_before: 95_000_000,
      bytes_after: 34_000_000,
      bytes_saved: 61_000_000,
      duration_seconds: 96.5,
    });
  });

  it('survives null metadata and missing fields without throwing', () => {
    const run = parseCompressionRun('log-2', new Date('2026-08-07T04:30:00Z'), null);

    expect(run.skipped_unconfigured).toBe(false);
    expect(run.scanned).toBe(0);
    expect(run.bytes_saved).toBe(0);
    expect(run.failed).toBe(0);
    expect(run.triggered_by).toBe('schedule'); // missing field defaults to cron
  });

  it('flags runs triggered manually from the admin UI', () => {
    const run = parseCompressionRun('log-4', new Date('2026-08-08T06:15:00Z'), {
      ...meta,
      triggered_by: 'admin',
    });

    expect(run.triggered_by).toBe('admin');
  });

  it('flags skipped_unconfigured runs (R2 not configured — no bucket scan happened)', () => {
    const run = parseCompressionRun('log-3', new Date(), {
      skipped_unconfigured: true,
      scanned: 0,
    });

    expect(run.skipped_unconfigured).toBe(true);
    expect(run.scanned).toBe(0);
  });
});

describe('summarizeCompressionRuns', () => {
  it('rolls up totals and averages across active runs only', () => {
    const runs = [
      parseCompressionRun('a', new Date('2026-08-06T04:30:00Z'), meta),
      parseCompressionRun('b', new Date('2026-08-05T04:30:00Z'), {
        ...meta,
        bytes_before: 5_000_000,
        bytes_after: 2_000_000,
        bytes_saved: 3_000_000,
        scanned: 50,
        compressed: 40,
      }),
    ];

    const summary = summarizeCompressionRuns(runs);

    expect(summary.total_runs).toBe(2);
    expect(summary.active_runs).toBe(2);
    expect(summary.unconfigured_runs).toBe(0);
    expect(summary.total_scanned).toBe(395);
    expect(summary.total_compressed).toBe(313);
    expect(summary.total_bytes_before).toBe(100_000_000);
    expect(summary.total_bytes_after).toBe(36_000_000);
    expect(summary.total_bytes_saved).toBe(64_000_000);
    expect(summary.avg_bytes_saved_per_run).toBe(32_000_000);
    expect(summary.last_run_at).toBe('2026-08-06T04:30:00.000Z');
    expect(summary.last_run_ok).toBe(true);
  });

  it('excludes skipped_unconfigured runs from savings and scan totals', () => {
    const runs = [
      parseCompressionRun('a', new Date('2026-08-06T04:30:00Z'), meta),
      parseCompressionRun('b', new Date('2026-08-05T04:30:00Z'), {
        skipped_unconfigured: true,
        scanned: 0,
        bytes_saved: 0,
      }),
    ];

    const summary = summarizeCompressionRuns(runs);

    expect(summary.total_runs).toBe(2);
    expect(summary.active_runs).toBe(1);
    expect(summary.unconfigured_runs).toBe(1);
    expect(summary.total_scanned).toBe(345);
    expect(summary.total_bytes_saved).toBe(61_000_000);
    expect(summary.avg_bytes_saved_per_run).toBe(61_000_000);
    expect(summary.last_run_ok).toBe(true);
  });

  it('reports last_run_ok=false when the latest run had failures', () => {
    const runs = [parseCompressionRun('a', new Date(), { ...meta, failed: 2 })];

    expect(summarizeCompressionRuns(runs).last_run_ok).toBe(false);
  });

  it('reports last_run_ok=null when the latest run was an unconfigured no-op (not a failure)', () => {
    const runs = [
      parseCompressionRun('a', new Date('2026-08-07T04:30:00Z'), {
        skipped_unconfigured: true,
        scanned: 0,
      }),
      parseCompressionRun('b', new Date('2026-08-06T04:30:00Z'), meta),
    ];

    const summary = summarizeCompressionRuns(runs);

    expect(summary.last_run_at).toBe('2026-08-07T04:30:00.000Z');
    expect(summary.last_run_ok).toBeNull(); // env gap ≠ failure — no amber alert
    expect(summary.total_bytes_saved).toBe(61_000_000); // older active run still counts
  });

  it('is a no-op summary when there are no runs yet (cron just deployed)', () => {
    const summary = summarizeCompressionRuns([]);

    expect(summary).toEqual({
      total_runs: 0,
      active_runs: 0,
      unconfigured_runs: 0,
      total_scanned: 0,
      total_compressed: 0,
      total_bytes_before: 0,
      total_bytes_after: 0,
      total_bytes_saved: 0,
      avg_bytes_saved_per_run: 0,
      last_run_at: null,
      last_run_ok: null,
    });
  });
});
