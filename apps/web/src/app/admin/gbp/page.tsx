'use client';

import { Sheet } from '@/components/Sheet';
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch';
import { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Status = {
  connected: boolean;
  connected_email: string | null;
  api_approved: boolean;
  counts: Record<string, number>;
};
type LinkRow = {
  id: string;
  status: 'REQUESTED' | 'LINKED' | 'NEEDS_ACCESS' | 'UNLINKED';
  location_title: string | null;
  consented_at: string | null;
  linked_at: string | null;
  last_synced_at: string | null;
  last_error_code: string | null;
  review_count: number | null;
  retailer: { id: string; shop_name: string; city: string | null };
};
type Loc = { account: string; location: string; title: string; address: string };

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

// The server enforces Super Admin on connect/callback/approval; this only hides the buttons.
const isSuperAdmin = () =>
  typeof window !== 'undefined' &&
  (sessionStorage.getItem('admin_role') ?? 'SUPER_ADMIN') === 'SUPER_ADMIN';

async function api<T>(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  const opts =
    method === 'GET'
      ? adminGetOptions()
      : { ...(await adminMutateOptions()), method, body: JSON.stringify(body ?? {}) };
  const res = await fetch(`${API_URL}/v1/admin/gbp${path}`, opts);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (HTTP ${res.status})`);
  return json.data as T;
}

export default function AdminGbpPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<LinkRow | null>(null);
  const [locations, setLocations] = useState<Loc[] | null>(null);
  const superAdmin = isSuperAdmin();

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([api<Status>('/status'), api<LinkRow[]>('/links')]);
      setStatus(s);
      setLinks(l);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  // Google redirects back here with ?code&state; exchange once, then clean the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const code = p.get('code');
    const state = p.get('state');
    void (async () => {
      if (code && state) {
        window.history.replaceState(null, '', window.location.pathname);
        try {
          await api('/callback', 'POST', { code, state });
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not finish connecting Google');
        }
      } else if (p.get('error')) {
        window.history.replaceState(null, '', window.location.pathname);
        setError('Google sign-in was cancelled or refused.');
      }
      await load();
    })();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      const { url } = await api<{ url: string }>('/connect');
      window.location.href = url;
    });

  const toggleApproval = () =>
    run(() => api('/approval', 'POST', { approved: !status?.api_approved }));

  const openPicker = (row: LinkRow) => {
    setPicking(row);
    setLocations(null);
    api<Loc[]>('/locations')
      .then(setLocations)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not list Google locations');
        setPicking(null);
      });
  };

  const link = (loc: Loc) =>
    picking &&
    run(async () => {
      await api(`/links/${picking.id}/link`, 'POST', {
        account: loc.account,
        location: loc.location,
      });
      setPicking(null);
    });

  const unlink = (row: LinkRow) => {
    if (!confirm(`Unlink ${row.retailer.shop_name}? Their Google reviews stop syncing.`)) return;
    void run(() => api(`/links/${row.id}/unlink`, 'POST'));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Google Business Profile</h1>
        <p className="text-sm text-gray-500">
          One shared Google account is added as Manager by each retailer; link each request to its
          location here.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-6 py-4"
        >
          {error}
        </div>
      )}

      <section className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-gray-900">Connection</h2>
        {!status ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : (
          <>
            <p className="text-sm text-gray-700">
              {status.connected
                ? `Connected as ${status.connected_email ?? 'unknown account'}`
                : 'Not connected'}
              {' · '}
              Google API access{' '}
              {status.api_approved
                ? 'approved (live for retailers)'
                : 'not approved (retailers see "Coming soon")'}
            </p>
            <p className="text-xs text-gray-500">
              {Object.entries(status.counts)
                .map(([k, v]) => `${v} ${k.toLowerCase().replace('_', ' ')}`)
                .join(' · ') || 'No requests yet'}
            </p>
            {superAdmin ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={busy}
                  className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
                >
                  {status.connected ? 'Reconnect Google' : 'Connect Google'}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleApproval()}
                  disabled={busy || (!status.api_approved && !status.connected)}
                  className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
                >
                  {status.api_approved ? 'Turn off (mark not approved)' : 'Mark API approved'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-gray-400">
                Only a Super Admin can connect Google or change approval.
              </p>
            )}
          </>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <h2 className="px-6 py-4 text-sm font-semibold text-gray-900 border-b border-gray-100">
          Retailer links
        </h2>
        {links.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">No retailer has asked to connect yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50 text-left text-xs font-semibold text-gray-500">
                  <th className="px-6 py-3">Retailer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Google location</th>
                  <th className="px-4 py-3 text-right">Reviews</th>
                  <th className="px-4 py-3">Asked / synced</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {links.map((r) => (
                  <tr key={r.id} className="border-t border-gray-50">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-gray-900">{r.retailer.shop_name}</p>
                      <p className="text-xs text-gray-400">{r.retailer.city ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-semibold bg-gray-100 rounded-md px-2 py-1">
                        {r.status}
                      </span>
                      {r.last_error_code && (
                        <p className="text-[11px] text-red-500 mt-1">{r.last_error_code}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.location_title ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.review_count ?? 0}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {fmt(r.consented_at)} / {fmt(r.last_synced_at)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {r.status === 'LINKED' ? (
                        <button
                          type="button"
                          onClick={() => unlink(r)}
                          disabled={busy}
                          className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-40"
                        >
                          Unlink
                        </button>
                      ) : r.status === 'UNLINKED' ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openPicker(r)}
                          disabled={busy || !status?.connected}
                          title={
                            status?.connected ? 'Pick the Google location' : 'Connect Google first'
                          }
                          className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"
                        >
                          Link
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Sheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        ariaLabel="Pick Google location"
        overlayClassName="z-50 bg-black/60 flex items-center justify-center p-4"
        panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
      >
        {picking && (
          <>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900">
                Link {picking.retailer.shop_name} to…
              </h3>
              <button
                type="button"
                onClick={() => setPicking(null)}
                aria-label="Close"
                className="text-gray-400"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {locations === null ? (
                <p className="p-6 text-center text-sm text-gray-400">Loading Google locations…</p>
              ) : locations.length === 0 ? (
                <p className="p-6 text-center text-sm text-gray-500">
                  No unlinked locations. Ask the retailer to add the Kanchuki Google account as
                  Manager first.
                </p>
              ) : (
                locations.map((l) => (
                  <button
                    type="button"
                    key={`${l.account}/${l.location}`}
                    onClick={() => void link(l)}
                    disabled={busy}
                    className="w-full text-left rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <p className="text-sm font-semibold text-gray-900">{l.title}</p>
                    <p className="text-xs text-gray-500">{l.address}</p>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}
