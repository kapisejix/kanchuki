'use client';

// Admin → Referral Monitor (T9 of docs/tasks/referral-program-retailer-affiliate.md).
//
// Everything this screen shows comes from /v1/admin/referral/* — there are no
// fallback constants to drift out of sync with the database. The unsettled
// figures use the T7 ledger identity, so a row showing ₹0.00 exactly means the
// next payout run has nothing to claim for that referrer.
//
// House rules this screen follows:
//  1. The real API error is shown — never a constant (RC-003/RC-009/RC-025).
//  2. Money renders in ₹ from paise via one formatter, en-IN.
//  3. The clawback and the payout trigger are CONFIRM dialogs, not buttons
//     that fire on click — one is irreversible, the other moves money.
//  4. The payout-account form masks what it sends; the API echoes only the
//     masked display, so the raw details never round-trip back to any client.

import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Download,
  Gift,
  Landmark,
  Loader2,
  Play,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

type Overview = {
  conversions_total: number;
  pending: number;
  qualified: number;
  paid: number;
  clawed_back: number;
  commission_accrued_paise: number;
  paid_out_paise: number;
  unsettled_paise: number;
  payout_batches_in_flight: number;
};

type LeaderRow = {
  referrer_id: string;
  shop_name: string;
  code: string | null;
  conversions_total: number;
  pending: number;
  qualified: number;
  paid: number;
  clawed_back: number;
  commission_accrued_paise: number;
  paid_out_paise: number;
  unsettled_paise: number;
};

type ConversionRow = {
  id: string;
  status: 'PENDING' | 'QUALIFIED' | 'PAID' | 'CLAWED_BACK';
  referred_shop: string;
  created_at: string;
  commission_accrued_paise: number;
};

type PayoutAccount = {
  account_type: 'BANK_ACCOUNT' | 'VPA';
  masked_display: string;
  is_active: boolean;
  updated_at: string;
} | null;

type PayoutSummary = {
  ran_at: string;
  mode: string;
  batches_claimed: number;
  batches_submitted: number;
  skipped_no_account: number;
  skipped_below_min: number;
  errors: number;
};

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

async function apiError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  const message = (body as { error?: { message?: string } } | null)?.error?.message;
  return message ?? `${fallback} (HTTP ${res.status})`;
}

// ── Payout-account form ───────────────────────────────────────────

type AccountDraft = {
  account_type: 'BANK_ACCOUNT' | 'VPA';
  account_name: string;
  ifsc: string;
  account_number: string;
  vpa_address: string;
};

function AccountForm({
  referrerId,
  onSaved,
}: {
  referrerId: string;
  onSaved: (masked: string) => void;
}) {
  const [existing, setExisting] = useState<PayoutAccount>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<AccountDraft>({
    account_type: 'BANK_ACCOUNT',
    account_name: '',
    ifsc: '',
    account_number: '',
    vpa_address: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/v1/admin/referral/retailers/${referrerId}/payout-account`,
          adminGetOptions(),
        );
        if (res.status === 404) {
          if (!cancelled) setExisting(null);
          return;
        }
        if (!res.ok) throw new Error(await apiError(res, 'Could not load payout account'));
        const json = await res.json();
        if (!cancelled) setExisting(json.data as PayoutAccount);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load payout account');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [referrerId]);

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const body =
        draft.account_type === 'VPA'
          ? { account_type: 'VPA', vpa_address: draft.vpa_address.trim() }
          : {
              account_type: 'BANK_ACCOUNT',
              account_name: draft.account_name.trim(),
              ifsc: draft.ifsc.trim().toUpperCase(),
              account_number: draft.account_number.trim(),
            };
      const res = await fetch(
        `${API_URL}/v1/admin/referral/retailers/${referrerId}/payout-account`,
        {
          ...(await adminMutateOptions()),
          method: 'PUT',
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(await apiError(res, 'Save failed'));
      const json = await res.json();
      const row = json.data as { masked_display: string; is_active: boolean };
      setExisting({
        account_type: draft.account_type,
        masked_display: row.masked_display,
        is_active: row.is_active,
        updated_at: new Date().toISOString(),
      });
      setNotice('Payout account saved.');
      onSaved(row.masked_display);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50';

  return (
    <div className="space-y-3">
      {loading ? (
        <Loader2 size={16} className="animate-spin text-cyan-500" />
      ) : (
        <>
          {existing && (
            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              <Wallet size={14} className={existing.is_active ? 'text-green-600' : 'text-gray-400'} />
              <span>
                {existing.is_active ? 'Active' : 'Inactive'} · {existing.account_type === 'VPA' ? 'UPI' : 'Bank'} ·{' '}
                <span className="font-mono">{existing.masked_display || '—'}</span>
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-500 mb-1">Account type</span>
              <select
                value={draft.account_type}
                onChange={(e) =>
                  setDraft({ ...draft, account_type: e.target.value as AccountDraft['account_type'] })
                }
                className={inputCls}
              >
                <option value="BANK_ACCOUNT">Bank account</option>
                <option value="VPA">UPI (VPA)</option>
              </select>
            </label>
            {draft.account_type === 'BANK_ACCOUNT' ? (
              <>
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Holder name</span>
                  <input
                    value={draft.account_name}
                    onChange={(e) => setDraft({ ...draft, account_name: e.target.value })}
                    className={inputCls}
                    maxLength={100}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-500 mb-1">IFSC</span>
                  <input
                    value={draft.ifsc}
                    onChange={(e) => setDraft({ ...draft, ifsc: e.target.value })}
                    placeholder="HDFC0001234"
                    className={`${inputCls} font-mono`}
                    maxLength={11}
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-500 mb-1">Account number</span>
                  <input
                    value={draft.account_number}
                    onChange={(e) => setDraft({ ...draft, account_number: e.target.value })}
                    className={`${inputCls} font-mono`}
                    inputMode="numeric"
                    maxLength={35}
                  />
                </label>
              </>
            ) : (
              <label className="block">
                <span className="block text-xs font-semibold text-gray-500 mb-1">UPI ID (VPA)</span>
                <input
                  value={draft.vpa_address}
                  onChange={(e) => setDraft({ ...draft, vpa_address: e.target.value })}
                  placeholder="name@ybl"
                  className={`${inputCls} font-mono`}
                  maxLength={50}
                />
              </label>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Landmark size={14} />}
            Save payout account
          </button>
        </>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {notice && !error && <p className="text-xs text-green-700">{notice}</p>}
    </div>
  );
}

// ── Detail drawer content ─────────────────────────────────────────

function ReferrerDetail({ row, onDone }: { row: LeaderRow; onDone: () => void }) {
  const [conversions, setConversions] = useState<ConversionRow[] | null>(null);
  const [convError, setConvError] = useState('');
  const [clawingId, setClawingId] = useState<string | null>(null);
  const [clawReason, setClawReason] = useState('');
  const [clawError, setClawError] = useState('');
  const [clawDone, setClawDone] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/v1/admin/referral/retailers/${row.referrer_id}/conversions`,
          adminGetOptions(),
        );
        if (!res.ok) throw new Error(await apiError(res, 'Could not load conversions'));
        const json = await res.json();
        if (!cancelled) setConversions(json.data as ConversionRow[]);
      } catch (e) {
        if (!cancelled) setConvError(e instanceof Error ? e.message : 'Could not load conversions');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [row.referrer_id]);

  const clawback = async (conversionId: string) => {
    setClawError('');
    try {
      const res = await fetch(
        `${API_URL}/v1/admin/referral/conversions/${conversionId}/clawback`,
        {
          ...(await adminMutateOptions()),
          method: 'POST',
          body: JSON.stringify({ reason: clawReason.trim() || 'Admin clawback (no reason given)' }),
        },
      );
      if (!res.ok) throw new Error(await apiError(res, 'Clawback failed'));
      setClawDone(conversionId);
      setClawingId(null);
      setClawReason('');
      onDone();
    } catch (e) {
      setClawError(e instanceof Error ? e.message : 'Clawback failed');
    }
  };

  const statusChip = (status: ConversionRow['status']) => {
    const cls: Record<ConversionRow['status'], string> = {
      PENDING: 'bg-gray-100 text-gray-600',
      QUALIFIED: 'bg-amber-100 text-amber-700',
      PAID: 'bg-green-100 text-green-700',
      CLAWED_BACK: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cls[status]}`}>
        {status === 'CLAWED_BACK' ? 'CLAWED BACK' : status}
      </span>
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-50 rounded-xl py-3">
          <p className="text-[11px] text-gray-500">Accrued</p>
          <p className="text-sm font-bold text-gray-900">{inr(row.commission_accrued_paise)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl py-3">
          <p className="text-[11px] text-gray-500">Paid out</p>
          <p className="text-sm font-bold text-gray-900">{inr(row.paid_out_paise)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl py-3">
          <p className="text-[11px] text-gray-500">Unsettled</p>
          <p className="text-sm font-bold text-cyan-700">{inr(row.unsettled_paise)}</p>
        </div>
      </div>

      <section>
        <h3 className="text-xs font-semibold text-gray-900 mb-2">Conversions</h3>
        {convError && (
          <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 border bg-red-50/80 border-red-200 text-red-600">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{convError}</span>
          </div>
        )}
        {!convError && conversions === null && <Loader2 size={16} className="animate-spin text-cyan-500" />}
        {conversions !== null && conversions.length === 0 && (
          <p className="text-xs text-gray-400">No conversions recorded.</p>
        )}
        {conversions !== null && conversions.length > 0 && (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl">
            {conversions.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{c.referred_shop}</p>
                  <p className="text-[11px] text-gray-400">
                    {new Date(c.created_at).toLocaleDateString('en-IN')} ·{' '}
                    {inr(c.commission_accrued_paise)} accrued
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusChip(c.status)}
                  {(c.status === 'PENDING' || c.status === 'QUALIFIED') && clawDone !== c.id && (
                    <button
                      type="button"
                      onClick={() => setClawingId(clawingId === c.id ? null : c.id)}
                      className="text-[11px] text-red-600 hover:text-red-700 font-medium inline-flex items-center gap-1"
                    >
                      <Ban size={12} /> Clawback
                    </button>
                  )}
                  {clawDone === c.id && (
                    <span className="text-[11px] text-green-700 font-medium inline-flex items-center gap-1">
                      <CheckCircle2 size={12} /> Clawed back
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {clawingId && (
          <div className="mt-2 border border-red-200 bg-red-50/60 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-red-700">
              Clawback is IRREVERSIBLE. Only claw back a referral you are certain never paid and
              never will.
            </p>
            <input
              value={clawReason}
              onChange={(e) => setClawReason(e.target.value)}
              placeholder="Reason (recorded in the audit log)"
              className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/40"
              maxLength={500}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void clawback(clawingId)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Confirm clawback
              </button>
              <button
                type="button"
                onClick={() => setClawingId(null)}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
            </div>
            {clawError && <p className="text-xs text-red-600">{clawError}</p>}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-xs font-semibold text-gray-900 mb-2">
          Payout account <span className="font-normal text-gray-400">(interim admin entry)</span>
        </h3>
        <AccountForm referrerId={row.referrer_id} onSaved={onDone} />
      </section>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export default function ReferralMonitorPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [confirmTrigger, setConfirmTrigger] = useState(false);
  const [triggerResult, setTriggerResult] = useState<PayoutSummary | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [ovRes, lbRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/referral/overview`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/referral/leaderboard`, adminGetOptions()),
      ]);
      if (!ovRes.ok) throw new Error(await apiError(ovRes, 'Could not load overview'));
      if (!lbRes.ok) throw new Error(await apiError(lbRes, 'Could not load leaderboard'));
      const ov = await ovRes.json();
      const lb = await lbRes.json();
      setOverview(ov.data as Overview);
      setLeaderboard(lb.data as LeaderRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load referral monitoring');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const triggerPayouts = async () => {
    setTriggering(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/v1/admin/referral/payouts/trigger`, {
        ...(await adminMutateOptions()),
        method: 'POST',
      });
      if (!res.ok) throw new Error(await apiError(res, 'Payout run failed'));
      const json = await res.json();
      setTriggerResult(json.data as PayoutSummary);
      setConfirmTrigger(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payout run failed');
    } finally {
      setTriggering(false);
    }
  };

  const detailRow = leaderboard?.find((r) => r.referrer_id === detailId) ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">Referral Monitor</h1>
            <Gift size={20} className="text-cyan-500" />
          </div>
          <p className="text-sm text-gray-500">
            Earnings, unsettled balances and payouts for the retailer affiliate program. Unsettled
            uses the same ledger identity as the payout job.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <a
            href={`${API_URL}/v1/admin/referral/export`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download size={14} /> Export CSV
          </a>
          <button
            type="button"
            onClick={() => setConfirmTrigger(true)}
            disabled={triggering}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {triggering ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Run payouts now
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 border bg-red-50/80 border-red-200 text-red-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {confirmTrigger && (
        <div className="border border-amber-200 bg-amber-50/70 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-800">Run the payout cycle now?</p>
          <p className="text-xs text-amber-700">
            This runs the exact handler the monthly cron runs (reconcile → claim → submit to
            RazorpayX) in manual mode, so it works even with MANUAL cadence. Money moves for every
            referrer above the payout minimum with a live payout account.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void triggerPayouts()}
              disabled={triggering}
              className="px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg"
            >
              {triggering ? 'Running…' : 'Confirm run'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmTrigger(false)}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {triggerResult && (
        <div className="border border-green-200 bg-green-50/70 rounded-xl p-4 text-xs text-green-800 space-y-1">
          <p className="font-semibold">Payout run finished</p>
          <p>
            Batches claimed: {triggerResult.batches_claimed} · submitted:{' '}
            {triggerResult.batches_submitted} · skipped (no account):{' '}
            {triggerResult.skipped_no_account} · skipped (below minimum):{' '}
            {triggerResult.skipped_below_min} · errors: {triggerResult.errors}
          </p>
        </div>
      )}

      {/* ── Totals ─────────────────────────────────────────────── */}
      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Conversions', value: String(overview.conversions_total), sub: `${overview.pending} pending · ${overview.qualified} qualified · ${overview.paid} paid` },
            { label: 'Commission accrued', value: inr(overview.commission_accrued_paise), sub: 'lifetime, all referrers' },
            { label: 'Committed to payouts', value: inr(overview.paid_out_paise), sub: `${overview.payout_batches_in_flight} live batches` },
            { label: 'Unsettled', value: inr(overview.unsettled_paise), sub: 'available for the next run' },
          ].map((card) => (
            <div key={card.label} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-4">
              <p className="text-xs text-gray-500 mb-1">{card.label}</p>
              <p className="text-lg font-bold text-gray-900">{card.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Leaderboard ────────────────────────────────────────── */}
      <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Leaderboard</h2>
          <p className="text-[11px] text-gray-400">
            {leaderboard?.length ?? 0} referrer{(leaderboard?.length ?? 0) === 1 ? '' : 's'} with conversions
          </p>
        </div>
        {!leaderboard || leaderboard.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">
            No referral conversions recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                  <th className="px-5 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Shop</th>
                  <th className="px-3 py-2.5 font-medium">Code</th>
                  <th className="px-3 py-2.5 font-medium text-right">Conv.</th>
                  <th className="px-3 py-2.5 font-medium text-right">Accrued</th>
                  <th className="px-3 py-2.5 font-medium text-right">Paid out</th>
                  <th className="px-3 py-2.5 font-medium text-right">Unsettled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((r, i) => (
                  <tr
                    key={r.referrer_id}
                    onClick={() => setDetailId(r.referrer_id)}
                    className={`cursor-pointer hover:bg-cyan-50/40 transition-colors ${detailId === r.referrer_id ? 'bg-cyan-50/60' : ''}`}
                  >
                    <td className="px-5 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-3 text-gray-900 font-medium max-w-[220px] truncate">{r.shop_name}</td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-500">{r.code ?? '—'}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{r.conversions_total}</td>
                    <td className="px-3 py-3 text-right text-gray-900">{inr(r.commission_accrued_paise)}</td>
                    <td className="px-3 py-3 text-right text-gray-600">{inr(r.paid_out_paise)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-cyan-700">{inr(r.unsettled_paise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Detail drawer ──────────────────────────────────────── */}
      {detailRow && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900">{detailRow.shop_name}</h2>
              <p className="text-[11px] text-gray-400 font-mono">{detailRow.code ?? 'no code minted'}</p>
            </div>
            <button
              type="button"
              onClick={() => setDetailId(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>
          <ReferrerDetail row={detailRow} onDone={() => void load()} />
        </motion.section>
      )}
    </motion.div>
  );
}
