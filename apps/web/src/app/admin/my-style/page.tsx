'use client'

// F-045 My Style admin: colour aliases, skin-tone palettes, trend boosts, selfie usage.
// One page, four tabs. Nothing here deletes: rows are retired with the Active toggle.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Palette } from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Family = { id: string; name: string; aliases: string[]; is_active: boolean }
type PaletteRow = {
  id: string
  undertone: string
  depth: string
  good_families: string[]
  avoid_families: string[]
  version: number
  is_active: boolean
}
type Trend = {
  id: string
  label: string
  kind: string
  match_keywords: string[]
  boost: number
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
}
type Usage = {
  days: number
  totals: { analyses: number; cost_paise: number }
  cost_per_analysis_paise: number
  by_day: { day: string; count: number; cost_paise: number }[]
  limit: { limit_per_period: number; period: string } | null
}

const TABS = ['Colours', 'Palettes', 'Trends', 'Usage'] as const
type Tab = (typeof TABS)[number]

async function call<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const options = init
    ? { ...(await adminMutateOptions()), method: init.method, body: JSON.stringify(init.body) }
    : adminGetOptions()
  const res = await fetch(`${API_URL}/v1/admin${path}`, options)
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed (HTTP ${res.status})`)
  return json?.data as T
}

const list = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
const inr = (paise: number) => `Rs ${(paise / 100).toFixed(2)}`
const input = 'rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900'
const btn =
  'rounded-lg bg-gray-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-40'

/** Load once; `reload` after a write. */
function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(() => {
    setError(null)
    call<T>(path)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [path])
  useEffect(reload, [reload])
  return { data, error, reload }
}

export default function MyStyleAdminPage() {
  const [tab, setTab] = useState<Tab>('Colours')
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">My Style</h1>
          <Palette size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Colour names, skin-tone palettes and trend boosts behind the shopper My Style feed.
          Changes apply to the next feed load. Nothing is deleted - switch a row off instead.
        </p>
      </div>
      <div className="flex gap-2 border-b border-gray-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm ${tab === t ? 'border-b-2 border-gray-900 font-semibold text-gray-900' : 'text-gray-500'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Colours' && <Colours />}
      {tab === 'Palettes' && <Palettes />}
      {tab === 'Trends' && <Trends />}
      {tab === 'Usage' && <UsageTab />}
    </div>
  )
}

function Status({ error, ready }: { error: string | null; ready: boolean }) {
  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!ready) return <Loader2 size={20} className="animate-spin text-cyan-500" />
  return null
}

function useSave(reload: () => void) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async (path: string, method: string, body: unknown) => {
    setBusy(true)
    setErr(null)
    try {
      await call(path, { method, body })
      reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }
  return { busy, err, run }
}

// --- Colours ------------------------------------------------------------

function Colours() {
  const { data, error, reload } = useData<Family[]>('/color-families')
  const { busy, err, run } = useSave(reload)
  const [name, setName] = useState('')
  const [aliases, setAliases] = useState('')
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Each family groups the spellings products use (&quot;Mustard&quot;, &quot;Haldi&quot; →
        yellow). A spelling can belong to one family only. Removing an alias or switching a family
        off needs a Super Admin.
      </p>
      <Status error={error ?? err} ready={!!data} />
      {data?.map((f) => (
        <FamilyRow key={f.id} f={f} busy={busy} save={(body) => run(`/color-families/${f.id}`, 'PATCH', body)} />
      ))}
      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-gray-200/80 bg-white/80 p-4">
        <label className="text-xs text-gray-500">
          New family
          <input className={`${input} mt-1 block`} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="text-xs text-gray-500">
          Aliases (comma separated)
          <input className={`${input} mt-1 block w-72`} value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </label>
        <button
          className={btn}
          disabled={busy || !name.trim()}
          onClick={async () => {
            await run('/color-families', 'POST', { name, aliases: list(aliases) })
            setName('')
            setAliases('')
          }}
        >
          Add
        </button>
      </div>
    </div>
  )
}

function FamilyRow({ f, busy, save }: { f: Family; busy: boolean; save: (b: object) => void }) {
  const [text, setText] = useState(f.aliases.join(', '))
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200/80 bg-white/80 p-3">
      <span className={`w-24 text-sm font-semibold ${f.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
        {f.name}
      </span>
      <input aria-label={`${f.name} aliases`} className={`${input} min-w-[16rem] flex-1`} value={text} onChange={(e) => setText(e.target.value)} />
      <button className={btn} disabled={busy} onClick={() => save({ aliases: list(text) })}>
        Save
      </button>
      <label className="flex items-center gap-1 text-xs text-gray-600">
        <input type="checkbox" checked={f.is_active} disabled={busy} onChange={(e) => save({ is_active: e.target.checked })} />
        Active
      </label>
    </div>
  )
}

// --- Palettes -----------------------------------------------------------

function Palettes() {
  const { data, error, reload } = useData<PaletteRow[]>('/my-style/palettes')
  const { busy, err, run } = useSave(reload)
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Which colour families suit or wash out each skin undertone and depth. Use family names
        from the Colours tab, comma separated. A family cannot be on both lists.
      </p>
      <Status error={error ?? err} ready={!!data} />
      {data?.map((p) => (
        <PaletteCell key={p.id} p={p} busy={busy} save={(body) => run(`/my-style/palettes/${p.id}`, 'PATCH', body)} />
      ))}
    </div>
  )
}

function PaletteCell({ p, busy, save }: { p: PaletteRow; busy: boolean; save: (b: object) => void }) {
  const [good, setGood] = useState(p.good_families.join(', '))
  const [avoid, setAvoid] = useState(p.avoid_families.join(', '))
  return (
    <div className="space-y-2 rounded-2xl border border-gray-200/80 bg-white/80 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold capitalize text-gray-900">
          {p.undertone} · {p.depth} <span className="font-normal text-gray-400">v{p.version}</span>
        </h2>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input type="checkbox" checked={p.is_active} disabled={busy} onChange={(e) => save({ is_active: e.target.checked })} />
          Active
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-gray-500">
          Suits
          <input aria-label={`${p.undertone} ${p.depth} suits`} className={`${input} mt-1 w-full`} value={good} onChange={(e) => setGood(e.target.value)} />
        </label>
        <label className="text-xs text-gray-500">
          Avoid
          <input aria-label={`${p.undertone} ${p.depth} avoid`} className={`${input} mt-1 w-full`} value={avoid} onChange={(e) => setAvoid(e.target.value)} />
        </label>
      </div>
      <button className={btn} disabled={busy} onClick={() => save({ good_families: list(good), avoid_families: list(avoid) })}>
        Save palette
      </button>
    </div>
  )
}

// --- Trends -------------------------------------------------------------

const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const toIso = (d: string) => (d ? `${d}T00:00:00.000Z` : null)

function Trends() {
  const { data, error, reload } = useData<Trend[]>('/my-style/trends')
  const { busy, err, run } = useSave(reload)
  const [f, setF] = useState({ label: '', kind: 'festival', keywords: '', boost: '0.3', start: '', end: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        A trend lifts products whose tags match its keywords, between its dates. Boost is 0 to 1
        (0.3 is a gentle nudge). Trending trends build the shopper Trending tab (hidden while there
        are none) and nudge every feed. Festival trends add keywords to the Festival tab, which
        appears only while a festival from the festival calendar is running or within 30 days.
      </p>
      <Status error={error ?? err} ready={!!data} />
      {data?.length === 0 && <p className="text-sm text-gray-400">No trends yet.</p>}
      {data?.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200/80 bg-white/80 p-3 text-sm">
          <span className={`font-semibold ${t.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>{t.label}</span>
          <span className="text-gray-500">{t.kind}</span>
          <span className="text-gray-500">{t.match_keywords.join(', ')}</span>
          <span className="text-gray-500">boost {t.boost}</span>
          <span className="text-gray-400">
            {dateOnly(t.starts_at) || 'any time'} → {dateOnly(t.ends_at) || 'open'}
          </span>
          <label className="ml-auto flex items-center gap-1 text-xs text-gray-600">
            <input type="checkbox" checked={t.is_active} disabled={busy} onChange={(e) => run(`/my-style/trends/${t.id}`, 'PATCH', { is_active: e.target.checked })} />
            Active
          </label>
        </div>
      ))}
      <div className="grid gap-2 rounded-2xl border border-gray-200/80 bg-white/80 p-4 sm:grid-cols-3">
        <label className="text-xs text-gray-500">Label<input className={`${input} mt-1 w-full`} value={f.label} onChange={set('label')} /></label>
        <label className="text-xs text-gray-500">Kind
          <select className={`${input} mt-1 w-full`} value={f.kind} onChange={set('kind')}>
            <option value="trending">Trending tab</option>
            <option value="festival">Festival tab</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">Boost (0-1)<input type="number" min="0" max="1" step="0.05" className={`${input} mt-1 w-full`} value={f.boost} onChange={set('boost')} /></label>
        <label className="text-xs text-gray-500 sm:col-span-3">Keywords (comma separated)<input className={`${input} mt-1 w-full`} value={f.keywords} onChange={set('keywords')} /></label>
        <label className="text-xs text-gray-500">Starts<input type="date" className={`${input} mt-1 w-full`} value={f.start} onChange={set('start')} /></label>
        <label className="text-xs text-gray-500">Ends<input type="date" className={`${input} mt-1 w-full`} value={f.end} onChange={set('end')} /></label>
        <div className="flex items-end">
          <button
            className={btn}
            disabled={busy || f.label.trim().length < 2}
            onClick={() =>
              run('/my-style/trends', 'POST', {
                label: f.label,
                kind: f.kind,
                match_keywords: list(f.keywords),
                boost: Number(f.boost),
                starts_at: toIso(f.start),
                ends_at: toIso(f.end),
              })
            }
          >
            Add trend
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Usage --------------------------------------------------------------

function UsageTab() {
  const [days, setDays] = useState(30)
  const { data, error } = useData<Usage>(`/my-style/usage?days=${days}`)
  const max = Math.max(1, ...(data?.by_day.map((d) => d.count) ?? [1]))
  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Selfie analyses completed per day (UTC). Cost is an estimate at{' '}
        {data ? inr(data.cost_per_analysis_paise) : 'about Rs 0.33'} per analysis, not a bill. No
        shopper is identified here.
      </p>
      <label className="text-xs text-gray-500">
        Window (days)
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${input} ml-2`}>
          {[7, 30, 90, 365].map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </label>
      <Status error={error} ready={!!data} />
      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Tile label="Analyses" value={data.totals.analyses.toLocaleString()} />
            <Tile label="Est. cost" value={inr(data.totals.cost_paise)} />
            <Tile
              label="Per-shopper limit"
              value={data.limit ? `${data.limit.limit_per_period} / ${data.limit.period.toLowerCase()}` : 'Unlimited'}
            />
          </div>
          <p className="text-xs text-gray-500">
            Change the per-shopper limit under{' '}
            <a className="underline" href="/admin/plan-limits">Plan Limits → shopper caps</a>.
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white/80 p-4">
            <div
              role="img"
              aria-label={`Analyses per day over the last ${data.days} days, ${data.totals.analyses} in total`}
              className="flex h-40 items-end gap-px"
              style={{ minWidth: `${data.by_day.length * 6}px` }}
            >
              {data.by_day.map((d) => (
                <div
                  key={d.day}
                  title={`${d.day}: ${d.count} (${inr(d.cost_paise)})`}
                  className="flex-1 rounded-t bg-cyan-500"
                  style={{ height: `${d.count === 0 ? 1 : Math.max(4, (d.count / max) * 100)}%`, opacity: d.count === 0 ? 0.25 : 1 }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-gray-400">
              <span>{data.by_day[0]?.day}</span>
              <span>peak {data.totals.analyses === 0 ? 0 : max}/day</span>
              <span>{data.by_day.at(-1)?.day}</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white/80 p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
