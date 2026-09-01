'use client';

import { formatPrice } from '@kanchuki/shared';
import {
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  IndianRupee,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  isMsg91WidgetConfigured,
  loadMsg91Widget,
  retryOtpViaWidget,
  sendOtpViaWidget,
  verifyOtpViaWidget,
  widgetErrorMessage,
} from '../../lib/msg91-widget';
import {
  ADDON_GROUP_LABEL,
  ADDON_GROUP_ORDER,
  type BillingPeriod,
  type PlanKey,
  formatDate,
  planLabel,
  planPriceLabel,
  planStatusLabel,
} from './lib';

// Retailer billing lives on the website (Google Play compliance decision —
// the Android app has no purchase UI). Retailers sign in with the same
// phone OTP they use in the app; the API's CORS already allows kanchuki.app
// so these calls go straight from the browser. The Supabase access token is
// kept in sessionStorage (cleared when the tab closes) and sent as a Bearer
// token, exactly like the mobile app does.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const TOKEN_KEY = 'kanchuki_billing_token';
const REFRESH_KEY = 'kanchuki_billing_refresh';
const SUPPORT_EMAIL = 'support@kanchuki.app';

// Module-level session: Supabase access tokens expire (~1h) — the OTP verify
// response also carries a refresh_token, and the API has POST /auth/refresh.
// On a 401 we refresh once and retry, so a retailer who idles on the page
// doesn't get a dead "Request failed (401)" mid-flow.
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

// ─── API types ────────────────────────────────────────────────────

interface PlanInfo {
  plan: string;
  pricing: { monthly: number };
  limits: Record<string, number | null>;
}

interface SubscriptionInfo {
  plan: string;
  plan_status: string;
  trial_ends_at: string | null;
  plan_expires_at: string | null;
  subscription: {
    amount_inr?: number | null;
    current_period_end?: string | null;
  } | null;
}

interface AddonPack {
  label: string;
  unit_label: string;
  pack_size: number;
  price_paise: number;
}

interface MeInfo {
  shop_name?: string | null;
  city?: string | null;
  plan?: string | null;
}

async function apiCall<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
  retried = false,
): Promise<T> {
  const res = await fetch(`${API_URL}/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  // Expired access token → refresh once and retry the same request.
  if (res.status === 401 && !retried && (await refreshAccessToken())) {
    return apiCall<T>(path, accessToken, init, true);
  }

  const json = (await res.json().catch(() => null)) as {
    data?: T;
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    throw new Error(
      json?.error?.message ??
        (res.status === 401 && retried
          ? 'Session expired — please sign in again.'
          : `Request failed (${res.status})`),
    );
  }
  return json?.data as T;
}

// ─── Login card ───────────────────────────────────────────────────

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  is_staff?: boolean;
}

function LoginCard({
  onLogin,
}: {
  onLogin: (access: string, refresh: string) => void;
}) {
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // MSG91 widget session (real OTP flow) — reqId pairs verify/retry with the
  // original send. Empty when the widget is unconfigured/blocked → API fallback.
  const [reqId, setReqId] = useState('');
  const [widgetReady, setWidgetReady] = useState(false);
  // Which channel issued the OTP — verify/resend must follow the SEND channel,
  // not the live widgetReady flag (the widget can finish loading after the API
  // already sent the code; routing verify on widgetReady would then fail a
  // perfectly valid server-issued OTP against a widget session that never saw it).
  const [channel, setChannel] = useState<'widget' | 'api' | null>(null);

  const validPhone = /^[6-9]\d{9}$/.test(phone.trim());

  // Load the MSG91 widget lazily; the login card works without it (the API
  // OTP flow is the fallback), so a blocked third-party CDN never breaks login.
  useEffect(() => {
    let cancelled = false;
    if (isMsg91WidgetConfigured()) {
      void loadMsg91Widget().then((ready) => {
        if (!cancelled) setWidgetReady(ready);
      });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  /** Exchange a widget-verified access token for a session (server-reverified). */
  const completeLoginWithToken = async (token: string) => {
    const data = await apiCall<LoginResponse>('/auth/otp/verify', null, {
      method: 'POST',
      body: JSON.stringify({ phone: phone.trim(), msg91_token: token }),
    });
    if (data.is_staff) {
      throw new Error(
        "This number is registered as staff, not a store owner. Sign in with the store owner's phone number.",
      );
    }
    onLogin(data.access_token, data.refresh_token);
  };

  const sendOtp = async () => {
    if (!validPhone || sending) return;
    setSending(true);
    setError(null);
    try {
      if (widgetReady) {
        // Real OTP flow: the widget sends the SMS itself (identifier needs the
        // country code, no '+'). In invisible mode the send response may already
        // carry the verified token — complete login directly in that case.
        const result = await sendOtpViaWidget(`91${phone.trim()}`);
        if (!result.ok) {
          throw new Error(widgetErrorMessage(result.error, 'Could not send OTP. Try again.'));
        }
        if (result.token) {
          await completeLoginWithToken(result.token);
          return;
        }
        setChannel('widget');
        setReqId(result.reqId ?? '');
        setOtpSent(true);
        if (result.reqId) {
          // Invisible-mode probe: with Mobile Integration, the widget can verify
          // the number carrier-side WITHOUT an SMS. If that happened, an empty
          // code verify returns the token and login completes — otherwise the
          // probe fails fast and the user just types the SMS code they received.
          void attemptInvisibleVerify(result.reqId);
        }
      } else {
        await apiCall<{ ok: boolean }>('/auth/otp/send', null, {
          method: 'POST',
          body: JSON.stringify({ phone: phone.trim() }),
        });
        setChannel('api');
        setOtpSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send OTP. Try again.');
    } finally {
      setSending(false);
    }
  };

  const attemptInvisibleVerify = async (sessionId: string) => {
    try {
      const result = await verifyOtpViaWidget('', sessionId, 6_000);
      if (result.ok && result.token) {
        await completeLoginWithToken(result.token);
      }
    } catch {
      // Widget hung — the OTP box is already visible; the user proceeds normally.
    }
  };

  const verifyOtp = async () => {
    if (otp.trim().length < 6 || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      if (channel === 'widget') {
        // Widget verifies the code client-side and returns the access token;
        // our API re-confirms it with MSG91 before issuing a session.
        const result = await verifyOtpViaWidget(otp.trim(), reqId || undefined);
        if (!result.ok || !result.token) {
          throw new Error(
            widgetErrorMessage(result.error, 'Verification failed. Try again.'),
          );
        }
        await completeLoginWithToken(result.token);
      } else {
        const data = await apiCall<LoginResponse>('/auth/otp/verify', null, {
          method: 'POST',
          body: JSON.stringify({ phone: phone.trim(), otp: otp.trim() }),
        });
        if (data.is_staff) {
          throw new Error(
            "This number is registered as staff, not a store owner. Sign in with the store owner's phone number.",
          );
        }
        onLogin(data.access_token, data.refresh_token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed. Try again.');
    } finally {
      setVerifying(false);
    }
  };

  const resendOtp = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      if (channel === 'widget' && reqId) {
        const result = await retryOtpViaWidget(reqId);
        if (!result.ok) {
          throw new Error(widgetErrorMessage(result.error, 'Failed to resend OTP.'));
        }
      } else {
        await apiCall<{ ok: boolean }>('/auth/otp/send', null, {
          method: 'POST',
          body: JSON.stringify({ phone: phone.trim() }),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend OTP.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-3xl border border-sand-200 bg-white p-8 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rust-500/10">
          <CreditCard className="text-rust-600" size={22} />
        </div>
        <h1 className="mt-4 text-center font-display text-2xl font-semibold text-ink-900">
          Retailer billing
        </h1>
        <p className="mt-2 text-center text-sm text-ink-500">
          Sign in with your store&rsquo;s phone number to manage plans and add-ons.
        </p>

        <div className="mt-6 space-y-3">
          <div>
            <label
              htmlFor="billing-phone"
              className="mb-1.5 block text-xs font-semibold text-ink-700"
            >
              Phone number
            </label>
            <div className="flex items-center overflow-hidden rounded-xl border border-sand-200 focus-within:border-rust-500">
              <span className="border-r border-sand-200 bg-sand-50 px-3 py-2.5 text-sm font-medium text-ink-500">
                +91
              </span>
              <input
                id="billing-phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                disabled={otpSent}
                className="w-full px-3 py-2.5 text-sm text-ink-900 outline-none placeholder:text-sand-400 disabled:bg-sand-50"
              />
            </div>
          </div>

          {otpSent && (
            <div>
              <label
                htmlFor="billing-otp"
                className="mb-1.5 block text-xs font-semibold text-ink-700"
              >
                One-time password
              </label>
              <input
                id="billing-otp"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-xl border border-sand-200 px-3 py-2.5 text-sm text-ink-900 outline-none placeholder:text-sand-400 focus:border-rust-500"
              />
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          {!otpSent ? (
            <button
              type="button"
              onClick={() => void sendOtp()}
              disabled={!validPhone || sending}
              className="w-full rounded-xl bg-rust-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-rust-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send OTP'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void verifyOtp()}
                disabled={otp.trim().length < 6 || verifying}
                className="w-full rounded-xl bg-ink-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {verifying ? 'Verifying…' : 'Verify & continue'}
              </button>
              <button
                type="button"
                onClick={() => void resendOtp()}
                disabled={sending}
                className="w-full text-center text-xs font-medium text-rust-600 hover:underline"
              >
                Resend OTP
              </button>
            </>
          )}
        </div>
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-sand-500">
        <ShieldCheck size={13} />
        Secured by Razorpay · Prices shown are ex-GST; 18% GST added at checkout
      </p>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────

function PlanCard({
  plan,
  pricing,
  current,
  active,
  busy,
  onChoose,
}: {
  plan: string;
  pricing: { monthly: number };
  current: boolean;
  active: boolean;
  busy: boolean;
  onChoose: () => void;
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl border p-5 transition-shadow ${
        current ? 'border-rust-500 bg-rust-500/5 shadow-sm' : 'border-sand-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-ink-900">{planLabel(plan)}</h3>
        {current && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rust-500 px-2.5 py-0.5 text-[11px] font-bold text-white">
            <Check size={11} /> Current
          </span>
        )}
      </div>

      <p className="mt-3 text-2xl font-bold text-ink-900">
        {planPriceLabel(pricing.monthly)}
      </p>
      <p className="mt-0.5 text-xs text-ink-500">billed monthly</p>

      <ul className="mt-4 flex-1 space-y-1.5 text-xs text-ink-600">
        <li>AI auto-tagging on every photo</li>
        <li>Customer catalogs + WhatsApp links</li>
        <li>Indian support, GST invoice</li>
      </ul>

      <button
        type="button"
        onClick={onChoose}
        disabled={current || !active || busy}
        className={`mt-5 rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${
          current
            ? 'bg-rust-500/10 text-rust-700'
            : active
              ? 'bg-ink-600 text-white hover:bg-ink-700 disabled:opacity-50'
              : 'bg-sand-100 text-sand-400'
        }`}
      >
        {current
          ? 'Your plan'
          : busy
            ? 'Opening checkout…'
            : active
              ? 'Choose plan'
              : 'Cancel current plan to switch'}
      </button>
    </div>
  );
}

interface Invoice {
  id: string;
  amount_inr: number;
  amount_excluding_gst: number | null;
  gst_amount: number | null;
  gst_rate: number | null;
  cgst_amount: number | null;
  sgst_amount: number | null;
  igst_amount: number | null;
  gst_invoice_number: string | null;
  invoice_generated_at: string | null;
  paid_at: string | null;
  status: string;
  place_of_supply: string | null;
}

function InvoiceList({ token }: { token: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void apiCall<Invoice[]>('/retailers/me/invoices', token)
      .then((rows) => setInvoices(rows ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  // Invoice PDFs are private — fetch a fresh short-lived signed URL per click.
  const openInvoicePdf = async (id: string) => {
    try {
      const { url } = await apiCall<{ url: string }>(`/retailers/me/invoices/${id}/pdf`, token);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      /* not ready yet — button only shows once invoice_generated_at is set */
    }
  };

  if (loading || !invoices.length) return null;

  return (
    <div className="mt-10">
      <h2 className="font-display text-xl font-semibold text-ink-900">Invoices &amp; GST</h2>
      <p className="mt-0.5 text-xs text-ink-500">
        Download GST-compliant invoices for your subscription payments.
      </p>

      <div className="mt-4 rounded-2xl border border-sand-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-sand-100 bg-sand-50/50">
                <th className="px-4 py-3 text-xs font-semibold text-ink-600">Invoice</th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-600">Date</th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-600 text-right">Base</th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-600 text-right">GST</th>
                <th className="px-4 py-3 text-xs font-semibold text-ink-600 text-right">Total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-sand-50 last:border-0">
                  <td className="px-4 py-3 text-xs font-medium text-ink-900">
                    {inv.gst_invoice_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500">
                    {inv.paid_at ? formatDate(inv.paid_at) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-700 text-right">
                    {formatPriceSafe(inv.amount_excluding_gst ?? inv.amount_inr)}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-500 text-right">
                    {inv.gst_amount ? formatPriceSafe(inv.gst_amount) : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-ink-900 text-right">
                    {formatPriceSafe(inv.amount_inr)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {inv.invoice_generated_at ? (
                      <button
                        type="button"
                        onClick={() => void openInvoicePdf(inv.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-sand-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-ink-700 transition-colors hover:border-sand-300"
                      >
                        PDF ↓
                      </button>
                    ) : (
                      <span className="text-[11px] text-sand-400">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Dashboard({
  token,
  onLogout,
}: {
  token: string;
  onLogout: () => void;
}) {
  const [me, setMe] = useState<MeInfo | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [addons, setAddons] = useState<Record<string, AddonPack[]>>({});

  const [loading, setLoading] = useState(true);
  const [choosingPlan, setChoosingPlan] = useState<string | null>(null);
  const [buyingAddon, setBuyingAddon] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meData, subData, plansData, addonsData] = await Promise.all([
        apiCall<MeInfo | null>('/retailers/me', token).catch(() => null),
        apiCall<SubscriptionInfo>('/billing/subscription', token),
        apiCall<PlanInfo[]>('/billing/plans', token),
        apiCall<Record<string, AddonPack[]>>('/billing/addon-pricing', token),
      ]);
      setMe(meData);
      setSubscription(subData);
      setPlans(plansData);
      setAddons(addonsData ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load billing details.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Same-tab navigation: Razorpay payment-link/subscription URLs are full-page
  // hosted checkouts. window.open after an awaited fetch is popup-blocked, and
  // the addon callback redirects back to /billing/addon-success on this tab.
  const openCheckout = (url: string | undefined) => {
    if (!url) throw new Error('No checkout URL returned — try again or contact support.');
    window.location.assign(url);
  };

  const choosePlan = async (plan: PlanKey) => {
    if (choosingPlan) return;
    setChoosingPlan(plan);
    setError(null);
    try {
      const data = await apiCall<{ checkout_url: string }>('/billing/subscription', token, {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      setNotice(
        `Razorpay checkout opened for the ${planLabel(plan)} plan. Your plan activates when the first payment clears.`,
      );
      openCheckout(data.checkout_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.');
    } finally {
      setChoosingPlan(null);
    }
  };

  const buyAddon = async (resourceType: string, packIndex: number) => {
    const key = `${resourceType}:${packIndex}`;
    if (buyingAddon) return;
    setBuyingAddon(key);
    setError(null);
    try {
      const data = await apiCall<{ checkout_url: string }>('/billing/addon-checkout', token, {
        method: 'POST',
        body: JSON.stringify({ resource_type: resourceType, pack_index: packIndex }),
      });
      setNotice('Payment link opened — units are credited automatically once payment completes.');
      openCheckout(data.checkout_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start addon purchase.');
    } finally {
      setBuyingAddon(null);
    }
  };

  const cancelSubscription = async () => {
    if (
      !window.confirm(
        'Cancel your subscription? You keep access until the end of the current billing period, then your store drops back to the free trial limits.',
      )
    ) {
      return;
    }
    setCancelling(true);
    setError(null);
    try {
      await apiCall<{ plan_status: string }>('/billing/cancel', token, { method: 'POST' });
      setNotice('Subscription cancelled — access continues until the end of the billing period.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel subscription.');
    } finally {
      setCancelling(false);
    }
  };

  const status = subscription?.plan_status ?? 'TRIAL';
  const statusActive = status === 'ACTIVE';
  if (loading && !subscription) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-sand-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rust-500 border-t-transparent" />
        <p className="text-sm">Loading your billing details…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-rust-600" />
            <p className="text-sm font-semibold text-ink-900">
              {me?.shop_name ? `${me.shop_name}'s billing` : 'Billing'}
            </p>
          </div>
          <p className="mt-0.5 text-xs text-ink-500">
            <span className="font-semibold text-ink-700">
              {planLabel(subscription?.plan ?? 'STARTER')}
            </span>{' '}
            plan · {planStatusLabel(status)}
            {status === 'TRIAL' && subscription?.trial_ends_at
              ? ` · trial ends ${formatDate(subscription.trial_ends_at)}`
              : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sand-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition-colors hover:border-sand-300"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-xl border border-sand-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition-colors hover:border-sand-300"
          >
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          {notice}
        </div>
      )}

      {/* Current subscription */}
      <div className="mt-6 rounded-2xl border border-sand-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-600 text-white">
              <CreditCard size={18} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink-900">
                {planLabel(subscription?.plan ?? 'STARTER')} plan ·{' '}
                <span className="text-rust-600">{planStatusLabel(status)}</span>
              </p>
              <p className="mt-0.5 text-xs text-ink-500">
                {status === 'TRIAL'
                  ? `Free trial ends ${formatDate(subscription?.trial_ends_at)}`
                  : statusActive
                    ? `Renews ${formatDate(subscription?.plan_expires_at ?? subscription?.subscription?.current_period_end)}`
                    : 'No active subscription'}
                · monthly billing
              </p>
            </div>
          </div>
          {statusActive && (
            <button
              type="button"
              onClick={() => void cancelSubscription()}
              disabled={cancelling}
              className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              {cancelling ? 'Cancelling…' : 'Cancel subscription'}
            </button>
          )}
        </div>
      </div>

      {/* Plan picker */}
      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-ink-900">Choose your plan</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              {statusActive
                ? 'Cancel your current subscription first to switch plans.'
                : 'The first charge lands when your free trial ends.'}
            </p>
          </div>

        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan.plan}
              plan={plan.plan}
              pricing={plan.pricing}
              current={subscription?.plan === plan.plan && statusActive}
              active={!statusActive}
              busy={choosingPlan === plan.plan}
              onChoose={() => void choosePlan(plan.plan as PlanKey)}
            />
          ))}
        </div>
      </div>

      {/* Invoices */}
      <InvoiceList token={token} />

      {/* Add-ons */}
      <div className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink-900">Top-up add-ons</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Ran out of a limit mid-month? Buy extra units — credited instantly after payment.
        </p>

        <div className="mt-4 space-y-4">
          {ADDON_GROUP_ORDER.map((group) => {
            const packs = addons[group];
            if (!packs?.length) return null;
            return (
              <div key={group} className="rounded-2xl border border-sand-200 bg-white p-5">
                <p className="text-sm font-semibold text-ink-900">
                  {ADDON_GROUP_LABEL[group] ?? group}
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {packs.map((pack, index) => {
                    const key = `${group}:${index}`;
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-3 rounded-xl border border-sand-100 bg-sand-50/50 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-ink-900">{pack.label}</p>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {formatPriceSafe(pack.price_paise)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void buyAddon(group, index)}
                          disabled={buyingAddon === key}
                          className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-rust-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-rust-600 disabled:opacity-50"
                        >
                          <Zap size={12} />
                          {buyingAddon === key ? 'Opening…' : 'Buy'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-10 flex flex-col items-center gap-2 border-t border-sand-100 pt-6 pb-4">
        <p className="flex items-center gap-1.5 text-xs text-sand-500">
          <ShieldCheck size={13} /> Secured by Razorpay · Prices shown are ex-GST; 18% GST added at checkout
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Billing%20help`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-rust-600 hover:underline"
        >
          <Mail size={13} /> Questions? Email {SUPPORT_EMAIL}
        </a>
        <Link href="/" className="mt-1 text-xs text-sand-400 hover:underline">
          &larr; Back to kanchuki.app
        </Link>
      </div>
    </div>
  );
}

function formatPriceSafe(paise: number): string {
  // Full ₹ amount from the shared formatter, minus the /- marker used on
  // product cards (same idiom as planPriceLabel in lib.ts).
  return formatPrice(paise).replace('/-', '');
}

// ─── Page ─────────────────────────────────────────────────────────

export default function BillingPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(TOKEN_KEY);
    const storedRefresh = window.sessionStorage.getItem(REFRESH_KEY);
    if (stored) {
      setSession(stored, storedRefresh);
      setToken(stored);
    }
  }, []);

  const handleLogin = (access: string, refresh: string) => {
    setSession(access, refresh);
    setToken(access);
  };

  const handleLogout = () => {
    clearSession();
    setToken(null);
  };

  return (
    <div className="min-h-screen bg-cotton text-ink-900">
      {/* Top bar */}
      <div className="border-b border-sand-100 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-display text-lg font-semibold tracking-tight text-ink-900">
              Kanchuki
            </span>
            <span className="rounded-full bg-rust-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rust-600">
              Billing
            </span>
          </Link>
          <p className="hidden items-center gap-1.5 text-xs text-sand-500 sm:flex">
            <Sparkles size={13} className="text-rust-500" />
            AI catalog, WhatsApp commerce &amp; more
          </p>
        </div>
      </div>

      <div className="px-6 py-12">
        {token ? (
          <Dashboard token={token} onLogout={handleLogout} />
        ) : (
          <LoginCard onLogin={handleLogin} />
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 pb-8 text-xs text-sand-400">
        <IndianRupee size={12} />
        Razorpay-powered payments
      </p>
    </div>
  );
}
