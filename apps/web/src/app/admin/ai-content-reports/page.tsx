'use client';

import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch';
import { CheckCircle2, Flag, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Shopper "Report this AI content" queue (Google Play AI-Generated Content policy). Reports are
// text only; the AI output itself is never stored. Retailer reports from the mobile app are in
// Bug Reports, tagged "[AI content report: …]".

type Status = 'NEW' | 'REVIEWED';
type Report = {
  id: string;
  feature: string;
  content_ref: string | null;
  description: string;
  status: Status;
  created_at: string;
  reporter: { name: string | null; phone: string } | null;
};
type Stats = { new: number; reviewed: number; total: number };

const FEATURES = [
  'My Style selfie analysis',
  'My Style find similar',
  'My Style complete the look',
  'AI Stylist',
  'Virtual try-on',
];

export default function AiContentReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'' | Status>('NEW');
  const [feature, setFeature] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: '100' });
      if (status) qs.set('status', status);
      if (feature) qs.set('feature', feature);
      const [list, st] = await Promise.all([
        fetch(`${API_URL}/v1/admin/ai-content-reports?${qs}`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/ai-content-reports/stats`, adminGetOptions()),
      ]);
      if (!list.ok || !st.ok) throw new Error('load failed');
      setReports(((await list.json()) as { data: Report[] }).data);
      setStats(((await st.json()) as { data: Stats }).data);
    } catch {
      setError('Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, [status, feature]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mark(r: Report, next: Status) {
    setBusyId(r.id);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/v1/admin/ai-content-reports/${r.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) throw new Error('update failed');
      await load();
    } catch {
      setError('Could not update that report.');
    } finally {
      setBusyId(null);
    }
  }

  const selectClass =
    'border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ink-500/40';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">AI Content Reports</h1>
            <Flag size={18} className="text-red-500" />
          </div>
          <p className="text-sm text-gray-500">
            Shoppers flagging AI-generated content on the customer site. Required by Google Play.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-2.5 text-gray-400 hover:text-ink-600 hover:bg-ink-50 rounded-xl"
          title="Refresh"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {(
            [
              ['New', stats.new],
              ['Reviewed', stats.reviewed],
              ['Total', stats.total],
            ] as const
          ).map(([label, n]) => (
            <div key={label} className="bg-white border border-gray-100 rounded-2xl p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-xl font-bold text-gray-900">{n}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | Status)}
          className={selectClass}
        >
          <option value="">All statuses</option>
          <option value="NEW">New</option>
          <option value="REVIEWED">Reviewed</option>
        </select>
        <select
          aria-label="Feature"
          value={feature}
          onChange={(e) => setFeature(e.target.value)}
          className={selectClass}
        >
          <option value="">All features</option>
          {FEATURES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-gray-400">
          <Loader2 className="animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No reports match.</p>
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => (
            <li key={r.id} className="bg-white border border-gray-100 rounded-2xl p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-gray-900">{r.feature}</span>
                {r.content_ref && <span className="text-gray-500">· {r.content_ref}</span>}
                <span className="text-gray-400">
                  · {new Date(r.created_at).toLocaleString('en-IN')}
                </span>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 font-semibold ${
                    r.status === 'NEW' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                  }`}
                >
                  {r.status === 'NEW' ? 'New' : 'Reviewed'}
                </span>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.description}</p>
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">
                  {r.reporter
                    ? `${r.reporter.name ?? 'Shopper'} · ${r.reporter.phone}`
                    : 'Anonymous visitor'}
                </p>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => void mark(r, r.status === 'NEW' ? 'REVIEWED' : 'NEW')}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} />
                  {r.status === 'NEW' ? 'Mark reviewed' : 'Reopen'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
