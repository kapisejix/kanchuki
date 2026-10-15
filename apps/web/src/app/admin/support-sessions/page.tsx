'use client';

import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch';
import { Loader2, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

type Session = {
  id: string;
  scope: 'DEMO' | 'GROWTH' | 'MAINTENANCE';
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'REVOKED';
  requested_at: string;
  decided_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  retailer: { id: string; shop_name: string };
  team_member: { id: string; name: string };
};

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

// A session is live only while APPROVED and not past expires_at.
const isLive = (s: Session) =>
  s.status === 'APPROVED' && s.expires_at !== null && new Date(s.expires_at) > new Date();

export default function SupportSessionsPage() {
  const [enabled, setEnabled] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/v1/admin/support-sessions`, adminGetOptions());
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = (await res.json()).data as { enabled: boolean; sessions: Session[] };
      setEnabled(json.enabled);
      setSessions(json.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load support sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (path: string, method: 'PUT' | 'POST', body?: unknown) => {
    setError('');
    try {
      const res = await fetch(`${API_URL}/v1/admin/support-sessions${path}`, {
        ...(await adminMutateOptions()),
        method,
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  };

  const toggle = () => {
    const next = !enabled;
    const msg = next
      ? 'Turn ON Kanchuki-staff support sessions? Managers will be able to request access to retailer accounts (retailer approval still required).'
      : 'Turn OFF support sessions? Every live session ends on its next request.';
    if (confirm(msg)) void send('/enabled', 'PUT', { enabled: next });
  };

  const revoke = (s: Session) => {
    if (confirm(`End ${s.team_member.name}'s session in ${s.retailer.shop_name} now?`)) {
      void send(`/${s.id}/revoke`, 'POST');
    }
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck className="w-6 h-6 text-gray-700" />
        <h1 className="text-2xl font-semibold text-gray-900">Support sessions</h1>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            Feature switch: {enabled ? 'ON' : 'OFF'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Off by default. When off, no new sessions can start and live sessions end on their next
            request (up to ~5 s).
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className={`px-4 py-2 rounded-xl text-sm font-semibold ${
            enabled ? 'bg-gray-100 text-gray-800' : 'bg-gray-900 text-white'
          }`}
        >
          {enabled ? 'Turn off' : 'Turn on'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      ) : sessions.length === 0 ? (
        <p className="text-sm text-gray-500">No support sessions yet.</p>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-3">Retailer</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Expires / ended</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.retailer.shop_name}</td>
                  <td className="px-4 py-3 text-gray-700">{s.team_member.name}</td>
                  <td className="px-4 py-3 text-gray-700">{s.scope}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {isLive(s) ? 'LIVE' : s.status}
                    {s.revoked_by ? ` (${s.revoked_by})` : ''}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmt(s.requested_at)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmt(s.revoked_at ?? s.expires_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {(isLive(s) || s.status === 'PENDING') && (
                      <button
                        type="button"
                        onClick={() => revoke(s)}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        End now
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
