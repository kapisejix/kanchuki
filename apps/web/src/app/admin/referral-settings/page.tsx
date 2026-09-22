'use client';

// Admin → Referral Program settings (T2 of
// docs/tasks/referral-program-retailer-affiliate.md).
//
// NOTHING HERE IS A TERM. Every number this screen shows came from
// /v1/admin/referral-settings, which reads the singleton referral_settings row
// (seeded by migration 109). There are no fallback constants to drift out of
// sync with the database — which is why the loading state is a spinner and not
// a form prefilled with guesses.
//
// Three behaviours worth naming:
//  1. Only CHANGED fields are sent. The API diffs against the stored row and
//     treats an unchanged value as a no-op, so resubmitting a form must never
//     trip validation or write an audit entry (RC-010).
//  2. The real API error is shown. `fetch` does not throw on a non-2xx, so the
//     handler reads `error.message` off the response body rather than
//     replacing it with a constant — the failure mode RC-003/RC-009/RC-025 all
//     share.
//  3. Money is entered in ₹ and converted to paise at the API boundary
//     (`payout_min_amount`, `referred_bonus_value` for a flat discount).

import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch';
import { motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Handshake, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

type BonusType = 'FREE_MONTH' | 'FLAT_DISCOUNT' | 'NONE';
type Cadence = 'MONTHLY' | 'MANUAL';

type Settings = {
  commission_pct: number;
  duration_months: number;
  qualify_days: number;
  referred_bonus_type: BonusType;
  referred_bonus_value: number;
  second_tier_enabled: boolean;
  second_tier_pct: number | null;
  payout_min_amount: number;
  payout_cadence: Cadence;
};

/** Everything editing-side as a string, so a half-typed number is representable. */
type Draft = {
  commission_pct: string;
  duration_months: string;
  qualify_days: string;
  referred_bonus_type: BonusType;
  referred_bonus_value: string;
  second_tier_enabled: boolean;
  second_tier_pct: string;
  payout_min_amount: string; // ₹
  payout_cadence: Cadence;
};

const BONUS_TYPES: { value: BonusType; label: string }[] = [
  { value: 'FREE_MONTH', label: 'Free months of subscription' },
  { value: 'FLAT_DISCOUNT', label: 'Flat discount off first payment' },
  { value: 'NONE', label: 'No referred-side bonus' },
];

const CADENCES: { value: Cadence; label: string; hint: string }[] = [
  {
    value: 'MONTHLY',
    label: 'Monthly',
    hint: 'The payout cron settles qualifying balances once a month',
  },
  {
    value: 'MANUAL',
    label: 'Manual',
    hint: 'Nothing is sent automatically — payouts are triggered by hand',
  },
];

const paiseToRupees = (paise: number) => String(paise / 100);
const rupeesToPaise = (rupees: string) => Math.round(Number(rupees) * 100);
const formatINR = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

/** Unit of `referred_bonus_value` — it means months for one type and paise for the other. */
function bonusUnit(type: BonusType): { label: string; placeholder: string } {
  if (type === 'FREE_MONTH') return { label: 'Free months', placeholder: '1' };
  if (type === 'FLAT_DISCOUNT') return { label: 'Discount (₹)', placeholder: '500' };
  return { label: 'Bonus value', placeholder: '0' };
}

function toDraft(s: Settings): Draft {
  return {
    commission_pct: String(s.commission_pct),
    duration_months: String(s.duration_months),
    qualify_days: String(s.qualify_days),
    referred_bonus_type: s.referred_bonus_type,
    referred_bonus_value: String(s.referred_bonus_value),
    second_tier_enabled: s.second_tier_enabled,
    second_tier_pct: s.second_tier_pct == null ? '' : String(s.second_tier_pct),
    payout_min_amount: paiseToRupees(s.payout_min_amount),
    payout_cadence: s.payout_cadence,
  };
}

/** Draft → the same shape the API stores, with paise conversion applied. */
function toSettings(d: Draft): Settings {
  const isDiscount = d.referred_bonus_type === 'FLAT_DISCOUNT';
  return {
    commission_pct: Number(d.commission_pct),
    duration_months: Number(d.duration_months),
    qualify_days: Number(d.qualify_days),
    referred_bonus_type: d.referred_bonus_type,
    // A NONE bonus must carry 0 — the API's cross-field check (and the DB
    // CHECK behind it) reject any other pairing.
    referred_bonus_value:
      d.referred_bonus_type === 'NONE'
        ? 0
        : isDiscount
          ? rupeesToPaise(d.referred_bonus_value)
          : Number(d.referred_bonus_value),
    second_tier_enabled: d.second_tier_enabled,
    second_tier_pct: d.second_tier_enabled ? Number(d.second_tier_pct) : null,
    payout_min_amount: rupeesToPaise(d.payout_min_amount),
    payout_cadence: d.payout_cadence,
  };
}

/**
 * The patch to send: only keys whose value actually moved. `typeChanged`
 * forces the bonus value into the patch even when the numeral is identical —
 * 1 month and 1 paise are the same number but a very different payout, so
 * switching the type without resending the value would silently reinterpret
 * the stored figure in the new unit.
 */
export function buildPatch(
  stored: Settings,
  next: Settings,
  typeChanged: boolean,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof Settings)[]) {
    if (next[key] !== stored[key]) patch[key] = next[key];
  }
  if (typeChanged) patch.referred_bonus_value = next.referred_bonus_value;
  return patch;
}

/** Read the API's own message off a failed response. Never a constant. */
async function apiError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  const message = (body as { error?: { message?: string } } | null)?.error?.message;
  return message ?? `${fallback} (HTTP ${res.status})`;
}

export default function ReferralSettingsPage() {
  const [stored, setStored] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/referral-settings`, adminGetOptions());
      if (!res.ok) throw new Error(await apiError(res, 'Could not load referral settings'));
      const json = await res.json();
      const s = json.data as Settings;
      setStored(s);
      setDraft(toDraft(s));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load referral settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const patch = (p: Partial<Draft>) => setDraft((prev) => (prev ? { ...prev, ...p } : prev));

  const save = async () => {
    if (!stored || !draft) return;

    const next = toSettings(draft);
    if (Number.isNaN(next.payout_min_amount) || draft.payout_min_amount.trim() === '') {
      setError('Enter a minimum payout amount in ₹');
      return;
    }

    const typeChanged = next.referred_bonus_type !== stored.referred_bonus_type;
    const body = buildPatch(stored, next, typeChanged);

    if (Object.keys(body).length === 0) {
      setError('');
      setNotice('Nothing to save — no settings changed.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${API_URL}/v1/admin/referral-settings`, {
        ...(await adminMutateOptions()),
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await apiError(res, 'Save failed'));

      const json = await res.json();
      const changed = (json.changed as string[] | undefined) ?? [];
      const updated = json.data as Settings;
      setStored(updated);
      setDraft(toDraft(updated));
      setNotice(
        changed.length === 1
          ? `Saved — updated ${changed[0]}.`
          : `Saved — updated ${changed.length} settings.`,
      );
    } catch (e) {
      // The server's 422 names the setting to fix; show that, not a guess.
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-cyan-500" />
      </div>
    );
  }

  if (!stored || !draft) {
    return (
      <div className="max-w-4xl">
        <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 border bg-red-50/80 border-red-200 text-red-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error || 'Referral settings are unavailable.'}</span>
        </div>
      </div>
    );
  }

  const unit = bonusUnit(draft.referred_bonus_type);
  const bonusOff = draft.referred_bonus_type === 'NONE';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 max-w-4xl"
    >
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Referral Program</h1>
          <Handshake size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Terms for the retailer → retailer affiliate program. These values are the single source of
          truth — commission, qualifying period, the referred store&apos;s bonus, and payout rules
          are read from here at qualify and payout time, never from code.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 border bg-red-50/80 border-red-200 text-red-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && !error && (
        <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3 border bg-green-50/80 border-green-200 text-green-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* ── Commission & qualifying ──────────────────────────────── */}
      <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Commission</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">
              Share of payment (%)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={draft.commission_pct}
              onChange={(e) => patch({ commission_pct: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <span className="block text-[11px] text-gray-400 mt-1">
              Per paid invoice, for the duration below.
            </span>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">Earning duration</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={120}
                value={draft.duration_months}
                onChange={(e) => patch({ duration_months: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
              <span className="text-xs text-gray-500 whitespace-nowrap">months</span>
            </div>
            <span className="block text-[11px] text-gray-400 mt-1">
              How long after signup the referrer keeps earning — 12 means months 1-12 only.
            </span>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">Qualify window</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={365}
                value={draft.qualify_days}
                onChange={(e) => patch({ qualify_days: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
              <span className="text-xs text-gray-500 whitespace-nowrap">days</span>
            </div>
            <span className="block text-[11px] text-gray-400 mt-1">
              Days from signup to the referred store&apos;s first payment for the referral to count.
              0 records rewards immediately on signup.
            </span>
          </label>
        </div>
      </section>

      {/* ── Referred store bonus ─────────────────────────────────── */}
      <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Referred store bonus</h2>
        <p className="text-xs text-gray-500 -mt-2">
          What the new retailer gets for signing up via someone&apos;s code.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">Bonus type</span>
            <select
              value={draft.referred_bonus_type}
              onChange={(e) => {
                const nextType = e.target.value as BonusType;
                // Units change with the type, so carry the value across rather
                // than letting "1 month" silently become "₹0.01".
                patch({
                  referred_bonus_type: nextType,
                  referred_bonus_value:
                    nextType === 'NONE'
                      ? '0'
                      : nextType === stored.referred_bonus_type
                        ? draft.referred_bonus_value
                        : '',
                });
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              {BONUS_TYPES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">{unit.label}</span>
            <input
              type="number"
              min={0}
              disabled={bonusOff}
              value={draft.referred_bonus_value}
              onChange={(e) => patch({ referred_bonus_value: e.target.value })}
              placeholder={unit.placeholder}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <span className="block text-[11px] text-gray-400 mt-1">
              {bonusOff
                ? 'No bonus — the store pays full price.'
                : draft.referred_bonus_type === 'FLAT_DISCOUNT'
                  ? 'Entered in ₹; stored as paise.'
                  : 'Whole months of free subscription.'}
            </span>
          </label>
        </div>
      </section>

      {/* ── Payouts & second tier ────────────────────────────────── */}
      <section className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">Payouts</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">
              Minimum payout (₹)
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={draft.payout_min_amount}
              onChange={(e) => patch({ payout_min_amount: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
            <span className="block text-[11px] text-gray-400 mt-1">
              Balances below this carry over to the next cycle. Currently{' '}
              {formatINR(rupeesToPaise(draft.payout_min_amount) || 0)}.
            </span>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-500 mb-1">Cadence</span>
            <select
              value={draft.payout_cadence}
              onChange={(e) => patch({ payout_cadence: e.target.value as Cadence })}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              {CADENCES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <span className="block text-[11px] text-gray-400 mt-1">
              {CADENCES.find((c) => c.value === draft.payout_cadence)?.hint}
            </span>
          </label>
        </div>

        <div className="pt-2 border-t border-gray-100">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.second_tier_enabled}
              onChange={(e) =>
                patch({
                  second_tier_enabled: e.target.checked,
                  second_tier_pct: e.target.checked ? draft.second_tier_pct : '',
                })
              }
              className="accent-cyan-600"
            />
            Pay a second tier (sub-referrals)
          </label>
          {draft.second_tier_enabled && (
            <label className="block mt-3 max-w-xs">
              <span className="block text-xs font-semibold text-gray-500 mb-1">
                Second-tier share (%)
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={draft.second_tier_pct}
                onChange={(e) => patch({ second_tier_pct: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              />
              <span className="block text-[11px] text-gray-400 mt-1">
                Required while this is on — the save is rejected without it.
              </span>
            </label>
          )}
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Discard changes
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save changes
        </button>
      </div>
    </motion.div>
  );
}
