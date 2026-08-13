'use client';

// F-031: Connect a retailer's Facebook Page for social publishing.
//
// Flow: the mobile app opens this page → retailer logs in with the same phone
// OTP they use in the app → "Connect Facebook" calls the API's
// GET /v1/retailers/me/social/connect, which returns a Meta OAuth dialog URL
// → this page redirects the browser there → Meta redirects back to
// /social/connect/callback with ?code=&state=.
//
// Session handling mirrors the billing page (phone-OTP → Supabase session in
// sessionStorage → Bearer token on API calls).
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'kanchuki_social_token';
const REFRESH_KEY = 'kanchuki_social_refresh';

let accessToken: string | null = null;
let refreshToken: string | null = null;

function setSession(access: string, refresh?: string | null): void {
  accessToken = access;
  refreshToken = refresh ?? null;
  window.sessionStorage.setItem(TOKEN_KEY, access);
  if (refresh) window.sessionStorage.setItem(REFRESH_KEY, refresh);
}

function clearSession(): void {
  accessToken = null;
  refreshToken = null;
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(REFRESH_KEY);
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const doFetch = async (token: string | null) =>
    fetch(`${API_URL}${path}`, {
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
    setSession(json.data.access_token, json.data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export default function SocialConnectPage() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp' | 'connected' | 'error'>('phone');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a session already exists (returning from a failed Meta attempt), show
  // the connect button directly.
  useEffect(() => {
    const stored = window.sessionStorage.getItem(TOKEN_KEY);
    if (stored) {
      accessToken = stored;
      refreshToken = window.sessionStorage.getItem(REFRESH_KEY);
      setStep('connected');
    }
  }, []);

  const sendOtp = async () => {
    if (!/^\d{10}$/.test(phone)) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/v1/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message?: string } };
        throw new Error(json?.error?.message ?? 'Could not send OTP');
      }
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send OTP');
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit OTP');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/v1/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { access_token?: string; refresh_token?: string };
        error?: { message?: string };
      };
      if (!res.ok || !json?.data?.access_token) {
        throw new Error(json?.error?.message ?? 'Invalid OTP');
      }
      setSession(json.data.access_token, json.data.refresh_token);
      setStep('connected');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setSending(false);
    }
  };

  const connectFacebook = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: { auth_url: string; state: string } }>(
        '/v1/retailers/me/social/connect',
      );
      // Keep the state in sessionStorage so the callback page can verify it
      // matches what the API expects (defense in depth — the API re-checks).
      window.sessionStorage.setItem('kanchuki_social_state', res.data.state);
      window.location.href = res.data.auth_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Facebook connect');
      setSending(false);
    }
  };

  const logout = () => {
    clearSession();
    setPhone('');
    setOtp('');
    setStep('phone');
  };

  return (
    <main className="min-h-screen bg-cream flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <h1 className="text-3xl font-bold text-carbon mb-2">Connect your Facebook Page</h1>
        <p className="text-carbon/70 mb-8 text-sm leading-relaxed">
          Kanchuki can post your products and collection links to your Facebook Page. Sign in with
          your shop phone number to continue.
        </p>

        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-sm text-rose-700 mb-4">
            {error}
          </div>
        )}

        {step === 'phone' && (
          <div className="bg-white rounded-xl p-5 shadow-sm border border-carbon/10">
            <label className="block text-xs font-semibold text-carbon/60 uppercase tracking-wide mb-1.5">
              Mobile Number
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="9876543210"
              inputMode="numeric"
              className="w-full border border-carbon/15 rounded-lg px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-volt"
            />
            <button
              onClick={() => void sendOtp()}
              disabled={sending || phone.length !== 10}
              className="w-full bg-carbon text-cream rounded-lg py-3 text-sm font-semibold disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send OTP'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="bg-white rounded-xl p-5 shadow-sm border border-carbon/10">
            <label className="block text-xs font-semibold text-carbon/60 uppercase tracking-wide mb-1.5">
              6-digit OTP
            </label>
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              className="w-full border border-carbon/15 rounded-lg px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-volt"
            />
            <button
              onClick={() => void verifyOtp()}
              disabled={sending || otp.length !== 6}
              className="w-full bg-carbon text-cream rounded-lg py-3 text-sm font-semibold disabled:opacity-40"
            >
              {sending ? 'Verifying…' : 'Verify & Continue'}
            </button>
            <button
              onClick={() => setStep('phone')}
              className="w-full text-carbon/50 text-xs mt-3 hover:text-carbon"
            >
              ← Change number
            </button>
          </div>
        )}

        {step === 'connected' && (
          <div className="bg-white rounded-xl p-5 shadow-sm border border-carbon/10">
            <p className="text-sm text-carbon/70 mb-4">
              Signed in. Connect your Facebook Page — you&apos;ll be taken to Facebook to approve
              posting access for Kanchuki.
            </p>
            <button
              onClick={() => void connectFacebook()}
              disabled={sending}
              className="w-full bg-[#1877F2] text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-60"
            >
              {sending ? 'Opening Facebook…' : 'Connect Facebook Page'}
            </button>
            <button
              onClick={logout}
              className="w-full text-carbon/50 text-xs mt-3 hover:text-carbon"
            >
              Not you? Sign out
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
