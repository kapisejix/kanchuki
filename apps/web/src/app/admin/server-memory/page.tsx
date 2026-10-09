'use client';

import { adminGetOptions } from '@/lib/admin-fetch';
import { Activity, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

type Sample = {
  at: string;
  rss_mb: number;
  heap_used_mb: number;
  heap_total_mb: number;
  external_mb: number;
  array_buffers_mb: number;
  native_other_mb: number;
};

type Report = {
  now: Sample;
  history: Sample[];
  heap_limit_mb: number;
  uptime_s: number;
  node: string;
  sample_interval_s: number;
};

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <p className="text-xs text-gray-400">Collecting samples…</p>;
  const max = Math.max(...values, 1);
  const w = 600;
  const h = 80;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" role="img" aria-label="Memory trend">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
      <p className="text-[11px] text-gray-400 mt-1">{hint}</p>
    </div>
  );
}

function verdict(s: Sample): string {
  if (s.native_other_mb > s.heap_total_mb && s.native_other_mb > 300)
    return 'Mostly NATIVE memory (Prisma engine, image libraries, allocator). A JavaScript heap snapshot will not find it — look at sharp/Prisma/MALLOC_ARENA_MAX.';
  if (s.heap_used_mb > 0.6 * s.rss_mb)
    return 'Mostly live JavaScript objects. A heap snapshot (--heapsnapshot-signal) will show what holds them.';
  if (s.heap_total_mb - s.heap_used_mb > 200)
    return 'Large committed-but-unused JS heap (uncollected garbage). Lowering --max-old-space-size should shrink it.';
  return 'Memory is spread across heap and native parts — compare against the trend below.';
}

export default function ServerMemoryPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/v1/admin/server-memory`, adminGetOptions());
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      setReport((await res.json()).data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load server memory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const now = report?.now;
  const hist = report?.history ?? [];
  const recent = hist.slice(-12).reverse();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Activity size={20} className="text-gray-400" /> Server Memory
        </h1>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {now && report && (
        <>
          <p className="text-sm text-gray-600">{verdict(now)}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="RSS (billed)" value={`${now.rss_mb} MB`} hint="What Railway charges for" />
            <Stat
              label="JS heap used"
              value={`${now.heap_used_mb} MB`}
              hint={`of ${now.heap_total_mb} MB committed · limit ${report.heap_limit_mb} MB`}
            />
            <Stat
              label="External"
              value={`${now.external_mb} MB`}
              hint={`incl. ${now.array_buffers_mb} MB ArrayBuffers/Buffers`}
            />
            <Stat
              label="Native / other"
              value={`${now.native_other_mb} MB`}
              hint="Prisma engine, libvips, allocator"
            />
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm font-medium text-gray-900">
              Last {hist.length} samples ({report.sample_interval_s / 60} min apart) — RSS
            </p>
            <Spark values={hist.map((s) => s.rss_mb)} color="#BB3F95" />
            <p className="text-sm font-medium text-gray-900">JS heap used</p>
            <Spark values={hist.map((s) => s.heap_used_mb)} color="#231F48" />
            <p className="text-[11px] text-gray-400">
              History is kept in the server process only — it restarts empty after every deploy,
              restart or wake from sleep. Uptime {Math.round(report.uptime_s / 60)} min · Node{' '}
              {report.node}.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">RSS</th>
                  <th className="p-3">Heap used</th>
                  <th className="p-3">External</th>
                  <th className="p-3">Native/other</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.at} className="border-t border-gray-100">
                    <td className="p-3">{new Date(s.at).toLocaleTimeString()}</td>
                    <td className="p-3">{s.rss_mb}</td>
                    <td className="p-3">{s.heap_used_mb}</td>
                    <td className="p-3">{s.external_mb}</td>
                    <td className="p-3">{s.native_other_mb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
