'use client';

// F-031: Meta OAuth callback target.
//
// Meta redirects the browser here with ?code=&state= after the retailer
// approves posting access. This page:
//   1. POSTs { code, state } to the API's /v1/retailers/me/social/callback
//      (server-side token exchange + Pages list) — the API verifies `state`
//      belongs to this retailer's session.
//   2. Renders the returned Pages as a picker.
//   3. POSTs the chosen Page to /v1/retailers/me/social/accounts, which stores
//      the encrypted token and creates the SocialAccount row.
//   4. Shows a success screen — the retailer closes this tab and sees the
//      connected account in the mobile app.
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'kanchuki_social_token';
const REFRESH_KEY = 'kanchuki_social_refresh';

let accessToken: string | null = null;
let refreshToken: string | null = null;

function loadSession(): boolean {
  const stored = typeof window === 'undefined' ? null : window.sessionStorage.getItem(TOKEN_KEY);
  if (stored) {
    accessToken = stored;
    refreshToken = window.sessionStorage.getItem(REFRESH_KEY);
    return true;
  }
  return false;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const doFetch = async (token: string | null) =>
    fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
  let res = await doFetch(accessToken);
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await doFetch(accessToken);
  }
  const json = (await res.json().catch(() => null)) as { data?: unknown; error?: { message?: string } };
  if (!res.ok || json === null) {
    throw new Error(json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json as T;
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    const json = (await res.json().catch(() => null)) as {
      data?: { access_token: string; refresh_token: string };
    } | null;
    if (!res.ok || !json?.data?.access_token) return false;
    accessToken = json.data.access_token;
    refreshToken = json.data.refresh_token;
    window.sessionStorage.setItem(TOKEN_KEY, accessToken);
    window.sessionStorage.setItem(REFRESH_KEY, refreshToken ?? '');
    return true;
  } catch {
    return false;
  }
}

interface PageOption {
  id: string;
  name: string;
}

function CallbackInner() {
  const search = useSearchParams();
  const code = search.get('code');
  const state = search.get('state');

  const [pages, setPages] = useState<PageOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!code || !state) {
      setError('Missing Facebook response — please try connecting again from the app.');
      return;
    }
    if (!loadSession()) {
      setError('Session expired — please go back and sign in again.');
      return;
    }
    void (async () => {
      try {
        const res = await apiFetch<{ data: { pages: PageOption[]; state: string } }>(
          `${API_URL}/v1/retailers/me/social/callback`,
          { method: 'POST', body: JSON.stringify({ code, state }) },
        );
        setPages(res.data.pages);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not complete Facebook sign-in');
      }
    })();
  }, [code, state]);

  const choosePage = async (pageId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: { id: string; account_name: string } }>(
        `${API_URL}/v1/retailers/me/social/accounts`,
        { method: 'POST', body: JSON.stringify({ platform_account_id: pageId, state }) },
      );
      setDone(`Connected to ${res.data.account_name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect this Page');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-carbon/10 text-center">
        <div className="text-4xl mb-3">✅</div>
        <h2 className="text-lg font-bold text-carbon mb-1">{done}</h2>
        <p className="text-sm text-carbon/60 mb-5">
          Your Facebook Page is connected. You can close this tab and continue in the Kanchuki app
          — open Settings → Social Media to post products.
        </p>
        <button
          onClick={() => window.close()}
          className="bg-carbon text-cream rounded-lg px-6 py-2.5 text-sm font-semibold"
        >
          Close this tab
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-carbon/10">
      <h2 className="text-lg font-bold text-carbon mb-2">
        {pages ? 'Choose a Facebook Page' : 'Completing sign-in…'}
      </h2>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm text-rose-700 mb-4">
          {error}
        </div>
      )}

      {!pages && !error && (
        <p className="text-sm text-carbon/60">
          Confirming your Facebook account with the server…
        </p>
      )}

      {pages && (
        <div className="flex flex-col gap-2.5 mt-2">
          <p className="text-sm text-carbon/60">
            Which Page should Kanchuki post your products to?
          </p>
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => void choosePage(p.id)}
              disabled={busy}
              className="flex items-center justify-between border border-carbon/15 rounded-lg px-4 py-3 text-left hover:border-carbon disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-carbon">{p.name}</span>
              <span className="text-xs text-[#1877F2] font-medium">{busy ? '…' : 'Connect →'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SocialConnectCallbackPage() {
  return (
    <main className="min-h-screen bg-cream flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-carbon mb-2">Connect Facebook</h1>
        <Suspense fallback={<p className="text-sm text-carbon/60">Loading…</p>}>
          <CallbackInner />
        </Suspense>
      </div>
    </main>
  );
}
