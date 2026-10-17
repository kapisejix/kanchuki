'use client'

import { useState, useEffect } from 'react'
import { Cpu, Loader2 } from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Usage = {
  totals: { jobs: number; completed: number; failed: number; gpu_ms_sum: number; gpu_ms_avg: number | null }
  by_day: { day: string; jobs: number; gpu_ms_sum: number }[]
  by_retailer: { retailer_id: string; shop_name: string; jobs: number; gpu_ms_sum: number }[]
}

// Spec 10.2: Rs 3 / 45.9 s. Estimate only - set your real RunPod rate.
const DEFAULT_RATE_PER_SEC = 0.066

export default function TryOnUsagePage() {
  const [days, setDays] = useState(30)
  const [rate, setRate] = useState(DEFAULT_RATE_PER_SEC)
  const [data, setData] = useState<Usage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`${API_URL}/v1/admin/try-on-usage?days=${days}`, adminGetOptions())
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`)
        return res.json()
      })
      .then((json) => {
        if (!cancelled) setData(json.data ?? null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])

  const secs = (ms: number) => ms / 1000
  const inr = (ms: number) => `Rs ${(secs(ms) * rate).toFixed(2)}`

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Try-On GPU Usage</h1>
          <Cpu size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          GPU time per finished try-on. Failed jobs are counted but add 0 ms. Try-ons includes pending and discarded jobs; the average is over rows with a recorded GPU time. Days are UTC.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="text-xs text-gray-500">
          Window (days)
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="block mt-1 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900"
          >
            {[7, 30, 90, 365].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Rate per GPU second (Rs) - estimate, set your RunPod rate
          <input
            type="number"
            step="0.001"
            min="0"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value) || 0)}
            className="block mt-1 w-32 rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-900"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-cyan-500" />
        </div>
      ) : error || !data ? (
        <p className="text-sm text-red-600">{error ?? 'No data'}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Tile label="Try-ons" value={data.totals.jobs.toLocaleString()} />
            <Tile label="Failed" value={data.totals.failed.toLocaleString()} />
            <Tile label="GPU hours" value={(data.totals.gpu_ms_sum / 3_600_000).toFixed(2)} />
            <Tile
              label="Avg seconds / try-on"
              value={data.totals.gpu_ms_avg == null ? '-' : secs(data.totals.gpu_ms_avg).toFixed(1)}
            />
          </div>

          <Table
            title="Per day"
            head={['Day (UTC)', 'Try-ons', 'GPU seconds', 'Est. cost']}
            rows={data.by_day.map((d) => [
              d.day,
              d.jobs,
              secs(d.gpu_ms_sum).toFixed(0),
              inr(d.gpu_ms_sum),
            ])}
          />
          <Table
            title="Top retailers"
            head={['Retailer', 'Try-ons', 'GPU seconds', 'Est. cost']}
            rows={data.by_retailer.map((r) => [
              r.shop_name,
              r.jobs,
              secs(r.gpu_ms_sum).toFixed(0),
              inr(r.gpu_ms_sum),
            ])}
          />
        </>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/80 rounded-2xl border border-gray-200/80 p-4">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  )
}

function Table({
  title,
  head,
  rows,
}: {
  title: string
  head: string[]
  rows: (string | number)[][]
}) {
  return (
    <div className="bg-white/80 rounded-2xl border border-gray-200/80 p-4 overflow-x-auto">
      <h2 className="text-sm font-semibold text-gray-900 mb-2">{title}</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            {head.map((h) => (
              <th key={h} className="py-1 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="py-2 text-gray-400">
                No data in this window.
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i} className="border-t border-gray-100 text-gray-900">
                {r.map((c, j) => (
                  <td key={j} className="py-1 pr-4">
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
