'use client';

import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DatabaseBackup,
  FileImage,
  HardDrive,
  Loader2,
  RefreshCw,
  TrendingDown,
  XCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

type CompressionRun = {
  id: string;
  created_at: string;
  triggered_by: 'schedule' | 'admin';
  skipped_unconfigured: boolean;
  scanned: number;
  compressed: number;
  already_fine: number;
  skipped: number;
  failed: number;
  bytes_before: number;
  bytes_after: number;
  bytes_saved: number;
  duration_seconds: number;
};

type CompressionSummary = {
  total_runs: number;
  active_runs: number;
  unconfigured_runs: number;
  total_scanned: number;
  total_compressed: number;
  total_bytes_before: number;
  total_bytes_after: number;
  total_bytes_saved: number;
  avg_bytes_saved_per_run: number;
  last_run_at: string | null;
  last_run_ok: boolean | null;
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function StorageReportPage() {
  const [runs, setRuns] = useState<CompressionRun[]>([]);
  const [summary, setSummary] = useState<CompressionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [polling, setPolling] = useState(false);
  const [queuedMsg, setQueuedMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/v1/admin/storage-report`, adminGetOptions());
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      setSummary(json.data.summary);
      setRuns(json.data.runs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load storage report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  // Manual "Run compression now" — enqueues the same maintenance job the
  // 4:30 AM cron fires, then polls the report until a NEW run row appears
  // (the job writes its audit entry only when the whole pass completes).
  const runNow = async () => {
    if (running || polling) return;
    // A previous poll must never be left running — a second click mid-poll
    // would otherwise enqueue a redundant pass AND orphan the first interval.
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setRunning(true);
    setPolling(false);
    setError('');
    setQueuedMsg('');
    try {
      const res = await fetch(`${API_URL}/v1/admin/storage-report/run`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: '{}',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}: ${res.statusText}`);
      setQueuedMsg(json.data?.message ?? 'Compression pass enqueued — watching for it to finish…');
      setRunning(false);
      setPolling(true);

      // Poll until the pass lands a new COMPRESS_R2_IMAGES audit row (could
      // take minutes on a large bucket); give up after ~1 minute and let the
      // admin refresh manually.
      const before = runs[0]?.id ?? null;
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const res2 = await fetch(`${API_URL}/v1/admin/storage-report`, adminGetOptions());
          if (!res2.ok) throw new Error('reload failed');
          const j = await res2.json();
          const latestId = (j.data.runs?.[0]?.id as string | undefined) ?? null;
          if (latestId !== before) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setPolling(false);
            setRuns(j.data.runs ?? []);
            setSummary(j.data.summary);
            setQueuedMsg('✓ Compression pass finished — results are in the table below.');
            return;
          }
        } catch {
          // keep polling; the report stays stale until the pass completes
        }
        if (attempts >= 12) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setPolling(false);
          setQueuedMsg(
            'The pass may still be running or may have failed — check the API logs, then refresh this page to see any recorded run.',
          );
        }
      }, 5000);
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : 'Failed to enqueue compression run');
    }
  };

  const savingsPct =
    summary && summary.total_bytes_before > 0
      ? (summary.total_bytes_saved / summary.total_bytes_before) * 100
      : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Storage Report</h1>
            <DatabaseBackup size={20} className="text-cyan-500" />
          </div>
          <p className="text-sm text-gray-500">
            Daily R2 compression savings — read from the{' '}
            <code className="text-xs">COMPRESS_R2_IMAGES</code> audit entries written by the
            maintenance cron (4:30 AM UTC) or triggered manually below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={runNow}
            disabled={running || polling}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            title="Enqueue the compression pass immediately (runs in the maintenance worker)"
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl transition-colors disabled:opacity-50"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            Run compression now
          </motion.button>
          <motion.button
            onClick={load}
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </motion.button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
          <XCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {queuedMsg && (
        <div className="flex items-center gap-2 bg-cyan-50 border border-cyan-200 text-cyan-700 text-sm rounded-xl px-4 py-3">
          <Zap size={15} className="shrink-0" />
          <span>{queuedMsg}</span>
        </div>
      )}

      {/* Summary cards */}
      {!loading && summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
              <TrendingDown size={13} className="text-emerald-500" />
              Total saved
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatBytes(summary.total_bytes_saved)}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {summary.total_bytes_before > 0
                ? `${savingsPct.toFixed(1)}% of image bytes (${formatBytes(summary.total_bytes_before)} → ${formatBytes(summary.total_bytes_after)})`
                : 'no active runs yet'}
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
              <FileImage size={13} className="text-cyan-500" />
              Images compressed
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {summary.total_compressed.toLocaleString()}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              of {summary.total_scanned.toLocaleString()} objects scanned
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
              <HardDrive size={13} className="text-amber-500" />
              Runs
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {summary.total_runs.toLocaleString()}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              avg {formatBytes(summary.avg_bytes_saved_per_run)} saved per active run
            </p>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4">
            <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
              <Clock size={13} className="text-blue-500" />
              Last run
            </div>
            {summary.last_run_at ? (
              <>
                <p className="text-lg font-bold text-gray-900 mt-1 leading-tight">
                  {formatDate(summary.last_run_at)}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {summary.last_run_ok === null ? (
                    '—'
                  ) : summary.last_run_ok ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 size={11} /> clean
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <AlertTriangle size={11} /> had failures
                    </span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-400 mt-2">no runs recorded yet</p>
            )}
          </div>
        </div>
      )}

      {/* Runs table */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Daily runs</h2>
          <span className="text-[10px] text-gray-400">Newest first · up to 120 runs</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={24} className="animate-spin text-cyan-500" />
          </div>
        ) : runs.length === 0 ? (
          <div className="p-12 text-center">
            <DatabaseBackup size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">No compression runs recorded yet</p>
            <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">
              The daily R2 compression cron was deployed on 2026-08-06 — its first run lands at 4:30
              AM UTC. Each run writes a <code>COMPRESS_R2_IMAGES</code> audit entry with the savings
              breakdown, which appears here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Run</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Compressed</th>
                  <th className="px-4 py-3 font-medium text-right">≤80KB</th>
                  <th className="px-4 py-3 font-medium text-right">Skipped</th>
                  <th className="px-4 py-3 font-medium text-right">Failed</th>
                  <th className="px-4 py-3 font-medium text-right">Bytes before → after</th>
                  <th className="px-4 py-3 font-medium text-right">Saved</th>
                  <th className="px-4 py-3 font-medium text-right">Duration</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const runPct = r.bytes_before > 0 ? (r.bytes_saved / r.bytes_before) * 100 : 0;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-xs text-gray-500">{formatDate(r.created_at)}</div>
                        {r.triggered_by === 'admin' && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100 mt-0.5">
                            <Zap size={9} /> manual
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {r.skipped_unconfigured ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">
                            <XCircle size={10} /> unconfigured
                          </span>
                        ) : r.failed > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-200">
                            <AlertTriangle size={10} /> {r.failed} failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200">
                            <CheckCircle2 size={10} /> ok
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{r.compressed}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{r.already_fine}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{r.skipped}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{r.failed}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500 whitespace-nowrap">
                        {formatBytes(r.bytes_before)} → {formatBytes(r.bytes_after)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.bytes_saved > 0 ? (
                          <>
                            <span className="font-semibold text-emerald-600 whitespace-nowrap">
                              −{formatBytes(r.bytes_saved)}
                            </span>
                            <span className="text-[10px] text-gray-400 ml-1">
                              ({runPct.toFixed(0)}%)
                            </span>
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400 whitespace-nowrap">
                        {r.duration_seconds > 0 ? `${r.duration_seconds.toFixed(0)}s` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-400 text-center">
        Exclusions by design: <code>measurements/</code> (AI accuracy) · <code>/kyc/</code>{' '}
        (document legibility) · backups · catalog PDFs. Only <code>.jpg</code>/<code>.jpeg</code>{' '}
        objects are compressed — PNG/WebP are never re-encoded to mismatched JPEG.
      </p>
    </motion.div>
  );
}
