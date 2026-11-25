'use client';

import { adminGetOptions } from '@/lib/admin-fetch';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ServerMemoryCard } from './components/ServerMemoryCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Stats = {
  total_retailers: number;
  active_subscriptions: number;
  trial_retailers: number;
  total_products: number;
  total_collections: number;
  views_this_month: number;
  enquiries_this_month: number;
};

type Usage = {
  total_retailers: number;
  trial_retailers: number;
  active_subscriptions: number;
  mrr_inr: number;
};

type CommissionMonth = {
  period: string;
  total_payment_inr: number;
  commission_inr: number;
  spent_inr: number;
  remaining_inr: number;
  expense_count: number;
};

// API money fields are paise despite the `_inr` suffix.
const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const count = (n: number) => n.toLocaleString('en-IN');
const focusRing =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-600';

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [commission, setCommission] = useState<CommissionMonth | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [s, u, c] = await Promise.all([
          fetch(`${API_URL}/v1/admin/stats`, adminGetOptions()).then((r) => r.json()),
          fetch(`${API_URL}/v1/admin/usage`, adminGetOptions()).then((r) => r.json()),
          fetch(`${API_URL}/v1/admin/commission/overview?months=1`, adminGetOptions()).then((r) =>
            r.json(),
          ),
        ]);
        // Guard: a 500 from the API returns { error: {...} } with no .data.
        // Writing undefined into state used to crash the render below on
        // `stats.total_retailers` — instead surface a readable message.
        if (!s?.data || !u?.data) {
          setError(
            'The API returned an error while loading dashboard stats. Check the API service health.',
          );
          return;
        }
        setStats(s.data);
        setUsage(u.data);
        setCommission(c?.data?.[0] ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      }
    }
    load();
  }, []);

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700"
        >
          {error}
        </div>
      </div>
    );
  }

  const month = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const pctOfRetailers = (n: number) =>
    stats && stats.total_retailers > 0 ? Math.round((n / stats.total_retailers) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div>
        <h1 className="text-2xl font-medium text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">{month} across all Kanchuki stores</p>
      </div>

      {stats && usage && (
        <>
          <dl className="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-white lg:grid-cols-4">
            <Metric
              label="Total retailers"
              value={count(stats.total_retailers)}
              sub={`${count(usage.trial_retailers)} on trial`}
            />
            <Metric
              label="Active subscriptions"
              value={count(stats.active_subscriptions)}
              sub={usage.mrr_inr > 0 ? `${rupees(usage.mrr_inr)} MRR` : 'MRR pending'}
            />
            <Metric
              label="Total products"
              value={count(stats.total_products)}
              sub="Across all stores"
            />
            <Metric
              label="Monthly revenue"
              value={rupees(usage.mrr_inr)}
              sub={
                usage.active_subscriptions > 0
                  ? `${count(usage.active_subscriptions)} paying`
                  : 'No active subscriptions'
              }
            />
          </dl>

          <dl className="grid grid-cols-2 gap-4">
            <MiniMetric label="Views this month" value={count(stats.views_this_month)} />
            <MiniMetric label="Enquiries this month" value={count(stats.enquiries_this_month)} />
          </dl>

          <nav aria-label="Quick actions" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <QuickAction
              title="Browse retailers"
              description={`${count(stats.total_retailers)} retailers on the platform`}
              href="/admin/retailers"
            />
            <QuickAction
              title="Trial retailers"
              description={`${count(usage.trial_retailers)} in trial, may need follow-up`}
              href="/admin/retailers?filter=trial"
            />
            <QuickAction
              title="Billing overview"
              description={
                usage.active_subscriptions > 0
                  ? `${count(usage.active_subscriptions)} active, ${rupees(usage.mrr_inr)} MRR`
                  : 'No subscriptions active yet'
              }
              href="/admin/billing"
            />
          </nav>

          <div className="flex flex-col gap-6 lg:flex-row">
            {commission && (
              <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-6 lg:flex-[2]">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 className="text-sm font-medium text-gray-900">
                    3% commission pool <span className="font-normal text-gray-500">this month</span>
                  </h2>
                  <Link
                    href="/admin/commission"
                    className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded text-xs font-medium text-ink-600 transition-colors hover:text-ink-500 ${focusRing}`}
                  >
                    Track expenditure
                    <ArrowRight size={12} strokeWidth={1.5} />
                  </Link>
                </div>
                <dl className="text-sm">
                  <LedgerRow label="Total payments" value={rupees(commission.total_payment_inr)} />
                  <LedgerRow label="3% pool" value={rupees(commission.commission_inr)} />
                  <LedgerRow label="Spent" value={rupees(commission.spent_inr)} />
                  {/* Signature: the bahi-khata double rule closes the account. */}
                  <div className="mt-1 flex items-baseline justify-between border-y-[3px] border-double border-gray-900 py-2">
                    <dt className="font-medium text-gray-900">Remaining</dt>
                    <dd
                      className={`text-base font-medium tabular-nums ${
                        commission.remaining_inr < 0 ? 'text-red-700' : 'text-gray-900'
                      }`}
                    >
                      {rupees(Math.abs(commission.remaining_inr))}
                      {commission.remaining_inr < 0 ? ' over' : ''}
                    </dd>
                  </div>
                </dl>
              </section>
            )}

            {/* API process memory (Super Admin only — hides itself on 403) */}
            <ServerMemoryCard />
          </div>

          {/* Trial and paying counts come from separate queries and can overlap,
              so each is its own length on a shared tape rather than a stacked bar. */}
          <section className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-6 text-sm font-medium text-gray-900">Platform funnel</h2>
            <div className="space-y-4">
              <FunnelRow
                label="Total retailers"
                value={stats.total_retailers}
                pct={stats.total_retailers > 0 ? 100 : 0}
                fill="bg-gray-300"
              />
              <FunnelRow
                label="On trial"
                value={usage.trial_retailers}
                pct={pctOfRetailers(usage.trial_retailers)}
                fill="bg-ink-300"
              />
              <FunnelRow
                label="Active subscriptions"
                value={stats.active_subscriptions}
                pct={pctOfRetailers(stats.active_subscriptions)}
                fill="bg-ink-600"
              />
            </div>
            <div aria-hidden className="mt-2 flex items-start gap-4">
              <span className="hidden w-40 shrink-0 sm:block" />
              <div className="flex flex-1 justify-between border-t border-gray-300 pt-1 font-mono text-[11px] tabular-nums text-gray-500">
                {[0, 25, 50, 75, 100].map((tick) => (
                  <span key={tick}>{tick}</span>
                ))}
              </div>
              <span className="hidden w-24 shrink-0 sm:block" />
            </div>
          </section>
        </>
      )}

      {!stats && !error && (
        // biome-ignore lint/a11y/useSemanticElements: <output> only allows phrasing content; this is a block skeleton grid
        <div
          role="status"
          aria-label="Loading dashboard"
          className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 lg:grid-cols-4"
        >
          {Array.from({ length: 4 }, (_, i) => `sk-${i}`).map((k) => (
            <div key={k} className="bg-white p-6">
              <div className="mb-4 h-3 w-20 rounded bg-gray-100" />
              <div className="mb-2 h-8 w-16 rounded bg-gray-100" />
              <div className="h-3 w-24 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border-b border-r border-gray-200 p-4 even:border-r-0 sm:p-6 lg:border-b-0 lg:even:border-r lg:last:border-r-0 [&:nth-last-child(-n+2)]:border-b-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-2 text-2xl font-medium tabular-nums text-gray-900 sm:text-3xl">{value}</dd>
      <dd className="mt-1 text-xs text-gray-500">{sub}</dd>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-between gap-1 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-baseline">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="text-lg font-medium tabular-nums text-gray-900">{value}</dd>
    </div>
  );
}

function LedgerRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-gray-100 py-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className="tabular-nums text-gray-900">{value}</dd>
    </div>
  );
}

function QuickAction({
  title,
  description,
  href,
}: { title: string; description: string; href: string }) {
  return (
    <Link
      href={href}
      className={`group flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50 ${focusRing}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        <span className="mt-1 block text-xs text-gray-500">{description}</span>
      </span>
      <ArrowRight
        size={16}
        strokeWidth={1.5}
        className="shrink-0 text-gray-400 transition-colors group-hover:text-gray-900"
      />
    </Link>
  );
}

function FunnelRow({
  label,
  value,
  pct,
  fill,
}: { label: string; value: number; pct: number; fill: string }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:flex">
      <span className="text-sm text-gray-600 sm:w-40 sm:shrink-0">{label}</span>
      <div className="order-last col-span-2 h-6 overflow-hidden rounded bg-gray-100 sm:order-none sm:flex-1">
        <div className={`h-full ${fill}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="flex w-24 shrink-0 items-baseline justify-end gap-2 tabular-nums">
        <span className="text-sm font-medium text-gray-900">{count(value)}</span>
        <span className="w-10 text-right text-xs text-gray-500">{pct}%</span>
      </span>
    </div>
  );
}
