'use client';

import { adminGetOptions } from '@/lib/admin-fetch';
import { AlertTriangle, Eye, Heart, MessageSquare, Search, TrendingUp } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

type TopEntry = { value: string; count: number };

type StoreView = {
  retailer: { id: string; shop_name: string };
  range_days: number;
  dwell_trend: { date: string; total_dwell_ms: string; view_count: number }[];
  totals: {
    total_dwell_ms: string;
    view_count: number;
    search_count: number;
    favorite_count: number;
    enquiry_count: number;
    zero_result_count: number;
  };
  top_products: TopEntry[];
  top_favorited_products: TopEntry[];
  top_searches: TopEntry[];
  zero_result_terms: TopEntry[];
  funnel: {
    view_count: number;
    favorite_count: number;
    enquiry_count: number;
    view_to_favorite_pct: number;
    view_to_enquiry_pct: number;
  };
};

type DrillDown = {
  summary: {
    total_dwell_ms: string;
    view_count: number;
    favorite_count: number;
    enquiry_count: number;
    last_active_at: string | null;
  };
  history: { id: string; type: string; product_id: string | null; created_at: string }[];
};

// Store-level view + audited per-customer drill-down (F-037 Phase 3).
// No chart library — repo convention (mobile growth/analytics.tsx) is plain
// CSS width/height bars, matched here for the web admin equivalent.
export default function EngagementPage() {
  const searchParams = useSearchParams();
  const [retailerId, setRetailerId] = useState(searchParams.get('retailer_id') ?? '');
  const [retailerInput, setRetailerInput] = useState(retailerId);
  const [days, setDays] = useState(30);
  const [store, setStore] = useState<StoreView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [drillDown, setDrillDown] = useState<DrillDown | null>(null);
  const [drillDownError, setDrillDownError] = useState<string | null>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  useEffect(() => {
    if (!retailerId) return;
    setLoading(true);
    setError(null);
    fetch(`${API_URL}/v1/admin/engagement/retailers/${retailerId}?days=${days}`, adminGetOptions())
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Retailer not found' : 'Failed to load');
        return res.json();
      })
      .then((json) => setStore(json.data))
      .catch((e) => {
        setStore(null);
        setError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => setLoading(false));
  }, [retailerId, days]);

  const zeroResultValues = useMemo(
    () => new Set(store?.zero_result_terms.map((t) => t.value) ?? []),
    [store],
  );
  const maxDwell = useMemo(
    () => Math.max(1, ...(store?.dwell_trend.map((d) => Number(d.total_dwell_ms)) ?? [1])),
    [store],
  );

  function lookupCustomer() {
    if (!retailerId || !customerId) return;
    setDrillDownLoading(true);
    setDrillDownError(null);
    fetch(
      `${API_URL}/v1/admin/engagement/customers/${customerId}?retailer_id=${retailerId}`,
      adminGetOptions(),
    )
      .then((res) => {
        if (!res.ok)
          throw new Error(
            res.status === 404 ? 'No engagement history for this customer' : 'Lookup failed',
          );
        return res.json();
      })
      .then((json) => setDrillDown(json.data))
      .catch((e) => {
        setDrillDown(null);
        setDrillDownError(e instanceof Error ? e.message : 'Lookup failed');
      })
      .finally(() => setDrillDownLoading(false));
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Customer Engagement</h1>
        <p className="text-sm text-gray-500 mt-1">
          Aggregate behavior data, precomputed nightly. Never a live query over raw events.
        </p>
      </div>

      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={retailerInput}
          onChange={(e) => setRetailerInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setRetailerId(retailerInput.trim())}
          placeholder="Retailer ID"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64"
        />
        <button
          type="button"
          onClick={() => setRetailerId(retailerInput.trim())}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium"
        >
          View
        </button>
        {store && (
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        )}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {store && (
        <>
          <h2 className="text-lg font-medium text-gray-900">{store.retailer.shop_name}</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<Eye size={16} />} label="Views" value={store.totals.view_count} />
            <StatCard
              icon={<Search size={16} />}
              label="Searches"
              value={store.totals.search_count}
            />
            <StatCard
              icon={<Heart size={16} />}
              label="Favorites"
              value={store.totals.favorite_count}
            />
            <StatCard
              icon={<MessageSquare size={16} />}
              label="Enquiries"
              value={store.totals.enquiry_count}
            />
          </div>

          <Section title="Dwell time trend" icon={<TrendingUp size={16} />}>
            <div className="flex items-end gap-1 h-32">
              {store.dwell_trend.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 flex flex-col items-center gap-1"
                  title={`${d.date}: ${Math.round(Number(d.total_dwell_ms) / 1000)}s`}
                >
                  <div
                    className="w-full bg-gray-900 rounded-t"
                    style={{
                      height: `${Math.max(4, (Number(d.total_dwell_ms) / maxDwell) * 100)}%`,
                    }}
                  />
                </div>
              ))}
              {store.dwell_trend.length === 0 && (
                <p className="text-sm text-gray-400">No data in range</p>
              )}
            </div>
          </Section>

          <Section title="Conversion funnel">
            <div className="flex gap-6 text-sm">
              <span>{store.funnel.view_count} viewed</span>
              <span>→ {store.funnel.view_to_favorite_pct}% favorited</span>
              <span>→ {store.funnel.view_to_enquiry_pct}% enquired</span>
            </div>
          </Section>

          <div className="grid sm:grid-cols-3 gap-4">
            <TopList title="Top viewed products" entries={store.top_products} />
            <TopList title="Top favorited products" entries={store.top_favorited_products} />
            <TopList
              title="Top searches"
              entries={store.top_searches}
              flagged={zeroResultValues}
              flagIcon={<AlertTriangle size={12} className="text-amber-600" />}
            />
          </div>

          <Section title="Customer drill-down" icon={<Search size={16} />}>
            <p className="text-xs text-gray-500 mb-2">
              Viewing a named customer's raw history is logged to the audit trail.
            </p>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && lookupCustomer()}
                placeholder="Customer account ID"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64"
              />
              <button
                type="button"
                onClick={lookupCustomer}
                className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg text-sm font-medium"
              >
                Look up
              </button>
            </div>
            {drillDownLoading && <p className="text-sm text-gray-500">Loading...</p>}
            {drillDownError && <p className="text-sm text-red-600">{drillDownError}</p>}
            {drillDown && (
              <div className="space-y-2">
                <div className="flex gap-4 text-sm text-gray-700">
                  <span>{drillDown.summary.view_count} views</span>
                  <span>{drillDown.summary.favorite_count} favorites</span>
                  <span>{drillDown.summary.enquiry_count} enquiries</span>
                  <span>
                    {Math.round(Number(drillDown.summary.total_dwell_ms) / 1000)}s total dwell
                  </span>
                </div>
                <ul className="text-xs text-gray-600 divide-y divide-gray-100 border border-gray-100 rounded-lg">
                  {drillDown.history.map((h) => (
                    <li key={h.id} className="px-3 py-2 flex justify-between">
                      <span>
                        {h.type}
                        {h.product_id ? ` · ${h.product_id}` : ''}
                      </span>
                      <span className="text-gray-400">
                        {new Date(h.created_at).toLocaleString('en-IN')}
                      </span>
                    </li>
                  ))}
                  {drillDown.history.length === 0 && (
                    <li className="px-3 py-2 text-gray-400">No raw events on record</li>
                  )}
                </ul>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-gray-500 text-xs">
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold text-gray-900 mt-1">
        {value.toLocaleString('en-IN')}
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-900 flex items-center gap-1.5 mb-3">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function TopList({
  title,
  entries,
  flagged,
  flagIcon,
}: {
  title: string;
  entries: TopEntry[];
  flagged?: Set<string>;
  flagIcon?: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-2">{title}</h3>
      <ul className="text-sm space-y-1">
        {entries.map((e) => (
          <li key={e.value} className="flex justify-between items-center text-gray-700">
            <span className="truncate flex items-center gap-1">
              {flagged?.has(e.value) ? flagIcon : null}
              {e.value}
            </span>
            <span className="text-gray-400 tabular-nums">{e.count}</span>
          </li>
        ))}
        {entries.length === 0 && <li className="text-gray-400">No data in range</li>}
      </ul>
    </div>
  );
}
