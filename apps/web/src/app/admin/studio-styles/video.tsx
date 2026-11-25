'use client';

import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch';
import { BENCH_USD_TO_INR } from '@kanchuki/shared';
import { Film, Loader2 } from 'lucide-react';
// F-034 T6: VIDEO style fields + the promo video models card for /admin/studio-styles.
import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const ASPECTS = ['9:16', '4:5', '1:1'] as const;
export type VideoFieldValues = { default_aspect: string; duration_sec: number; no_person: boolean };
export const VIDEO_DEFAULTS: VideoFieldValues = {
  default_aspect: '9:16',
  duration_sec: 5,
  no_person: false,
};

const LABEL = 'text-[10px] font-semibold text-gray-500 uppercase tracking-wider';
const INPUT = 'w-full text-[10px] border border-gray-200 rounded-lg px-2 py-2 mt-1 bg-white';

/** Aspect / duration / no-person inputs shared by the new-style form and the row editor. */
export function VideoFields({
  value,
  onChange,
}: {
  value: VideoFieldValues;
  onChange: (v: VideoFieldValues) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <label className="block">
        <span className={LABEL}>Aspect</span>
        <select
          value={value.default_aspect}
          onChange={(e) => onChange({ ...value, default_aspect: e.target.value })}
          className={INPUT}
        >
          {ASPECTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={LABEL}>Duration (s, 1–8)</span>
        <input
          type="number"
          min={1}
          max={8}
          value={value.duration_sec}
          onChange={(e) =>
            onChange({
              ...value,
              duration_sec: Math.min(8, Math.max(1, Number(e.target.value) || 1)),
            })
          }
          className={`${INPUT} text-center`}
        />
      </label>
      <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer mt-5">
        <input
          type="checkbox"
          checked={value.no_person}
          onChange={(e) => onChange({ ...value, no_person: e.target.checked })}
          className="w-3.5 h-3.5 rounded border-gray-300"
        />
        No person (safe for kids products)
      </label>
    </div>
  );
}

type VideoModel = {
  model_key: string;
  label: string;
  notes: string | null;
  enabled: boolean;
  removal_date: string | null;
  price_usd_per_second: number | null;
  price_usd_per_million_tokens: number | null;
};
type ModelsData = { models: VideoModel[]; plans: Record<string, string | null> };

const PLANS = ['STARTER', 'GROWTH', 'PRO'] as const;
const CLIP_SEC = 5;

function priceCell(m: VideoModel) {
  if (m.price_usd_per_second != null) {
    const inr = Math.round(m.price_usd_per_second * CLIP_SEC * BENCH_USD_TO_INR);
    return {
      usd: `$${m.price_usd_per_second}/s`,
      inr: `≈ ₹${inr} per ${CLIP_SEC} s clip (estimate)`,
    };
  }
  if (m.price_usd_per_million_tokens != null) {
    return { usd: `$${m.price_usd_per_million_tokens}/M tokens`, inr: 'token-priced, no estimate' };
  }
  return { usd: 'price unknown', inr: '' };
}

/** Promo video models (Super Admin only): enable/disable + one model per plan. No delete. */
export function VideoModelsCard({ setStatus }: { setStatus: (s: string) => void }) {
  const [data, setData] = useState<ModelsData | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/v1/admin/video-models`, adminGetOptions())
      .then(async (res) => {
        if (res.status === 403) {
          setDenied(true);
          return;
        }
        if (!res.ok) throw new Error(`Video models failed to load (${res.status})`);
        setData((await res.json()).data);
      })
      .catch((err: unknown) =>
        setStatus(`❌ ${err instanceof Error ? err.message : 'Video models failed to load'}`),
      );
  }, [setStatus]);

  const send = async (key: string, url: string, method: string, body: unknown) => {
    setBusy(key);
    setStatus('');
    try {
      const res = await fetch(url, {
        ...(await adminMutateOptions()),
        method,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status})`);
      return true;
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`);
      return false;
    } finally {
      setBusy('');
    }
  };

  const toggle = async (m: VideoModel) => {
    const verb = m.enabled ? 'Disable' : 'Enable';
    if (
      !confirm(
        `${verb} ${m.label}? ${m.enabled ? 'Plans using it lose promo video.' : 'Plans that pick it can generate paid clips.'}`,
      )
    )
      return;
    if (
      await send(
        m.model_key,
        `${API_URL}/v1/admin/video-models/${encodeURIComponent(m.model_key)}`,
        'PATCH',
        { enabled: !m.enabled },
      )
    ) {
      setData(
        (d) =>
          d && {
            ...d,
            models: d.models.map((x) =>
              x.model_key === m.model_key ? { ...x, enabled: !m.enabled } : x,
            ),
          },
      );
      setStatus(`✅ ${m.label} ${m.enabled ? 'disabled' : 'enabled'}`);
    }
  };

  const pick = async (plan: string, model_key: string) => {
    if (!model_key || !confirm(`Use ${model_key} for ${plan}?`)) return;
    if (await send(plan, `${API_URL}/v1/admin/video-models/plans/${plan}`, 'PUT', { model_key })) {
      setData((d) => d && { ...d, plans: { ...d.plans, [plan]: model_key } });
      setStatus(`✅ ${plan} uses ${model_key}`);
    }
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
        <Film size={16} className="text-gray-500" />
        <h2 className="text-sm font-bold text-gray-800">Promo video models</h2>
        <span className="text-[10px] text-gray-400">
          ₹ at {BENCH_USD_TO_INR}/USD planning rate; Fal bills in USD
        </span>
      </div>
      {denied ? (
        <p className="text-sm text-gray-400 py-6 text-center">Super Admin only.</p>
      ) : !data ? (
        <div className="flex justify-center py-6">
          <Loader2 size={18} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="p-5 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-left text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="py-2 pr-3">Model</th>
                  <th className="py-2 pr-3">Price</th>
                  <th className="py-2 pr-3">Removal date</th>
                  <th className="py-2">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.models.map((m) => {
                  const p = priceCell(m);
                  return (
                    <tr key={m.model_key}>
                      <td className="py-2 pr-3">
                        <div className="font-semibold text-gray-800">{m.label}</div>
                        <div className="font-mono text-[10px] text-gray-400">{m.model_key}</div>
                        {m.notes && <div className="text-[10px] text-gray-500">{m.notes}</div>}
                      </td>
                      <td className="py-2 pr-3 text-gray-700">
                        {p.usd}
                        <div className="text-[10px] text-gray-400">{p.inr}</div>
                      </td>
                      <td
                        className={`py-2 pr-3 ${m.removal_date ? 'text-red-600 font-semibold' : 'text-gray-400'}`}
                      >
                        {m.removal_date ? m.removal_date.slice(0, 10) : '—'}
                      </td>
                      <td className="py-2">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            role="switch"
                            aria-checked={m.enabled}
                            checked={m.enabled}
                            disabled={busy === m.model_key}
                            onChange={() => toggle(m)}
                            aria-label={`Enable ${m.label}`}
                            className="w-3.5 h-3.5 rounded border-gray-300"
                          />
                          <span className={m.enabled ? 'text-green-700' : 'text-gray-400'}>
                            {m.enabled ? 'On' : 'Off'}
                          </span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PLANS.map((plan) => {
              const chosen = data.models.find((m) => m.model_key === data.plans[plan]);
              return (
                <label key={plan} className="block">
                  <span className={LABEL}>{plan}</span>
                  <select
                    value={data.plans[plan] ?? ''}
                    disabled={busy === plan}
                    onChange={(e) => pick(plan, e.target.value)}
                    className={INPUT}
                  >
                    <option value="" disabled>
                      — none (no promo video) —
                    </option>
                    {data.models.map((m) => (
                      <option key={m.model_key} value={m.model_key}>
                        {m.label}
                        {m.enabled ? '' : ' (disabled)'}
                      </option>
                    ))}
                  </select>
                  {chosen && !chosen.enabled && (
                    <span className="text-[10px] text-red-600">
                      Model is disabled: this plan has no promo video.
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400">
            Disable a model to turn it off; models are never deleted. A plan also needs the AI Promo
            Video feature (Plan Features) and an AI_VIDEO limit row (Plan Limits).
          </p>
        </div>
      )}
    </div>
  );
}
