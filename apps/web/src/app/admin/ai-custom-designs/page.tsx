'use client'

import { useEffect, useState } from 'react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Row = {
  id: string
  prompt: string
  status: 'PENDING' | 'READY' | 'FAILED'
  error: string | null
  image_url: string | null
  created_at: string
  retailer: { id: string; shop_name: string; city: string }
  product: { name: string }
}
type Stats = { days: number; ready: number; failed: number; pending: number; total: number }

const STATUSES = ['', 'READY', 'FAILED', 'PENDING'] as const

// Read-only view of what retailers asked the paid AI design tier for (prompts are already
// sanitised server-side). Useful for spotting prompt abuse and failure rates.
export default function AiCustomDesignsPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('')
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setError('')
    const qs = status ? `?status=${status}` : ''
    fetch(`${API_URL}/v1/admin/ai-custom-designs${qs}`, adminGetOptions())
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load (${res.status})`)
        return res.json() as Promise<{ data: Row[]; stats: Stats }>
      })
      .then((j) => {
        if (!live) return
        setRows(j.data)
        setStats(j.stats)
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Failed to load'))
    return () => {
      live = false
    }
  }, [status])

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">AI custom designs</h1>
      <p className="mt-1 text-sm text-gray-500">
        Prompts retailers sent to the paid AI design tier. Read-only.
      </p>

      {stats ? (
        <p className="mt-4 text-sm text-gray-700">
          Last {stats.days} days: {stats.total} total · {stats.ready} ready · {stats.failed} failed ·{' '}
          {stats.pending} pending
        </p>
      ) : null}

      <label className="mt-4 block text-sm">
        Status{' '}
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}
          className="ml-2 rounded border border-gray-300 px-2 py-1"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s || 'All'}
            </option>
          ))}
        </select>
      </label>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      {rows === null && !error ? <p className="mt-4 text-sm text-gray-500">Loading…</p> : null}
      {rows?.length === 0 ? <p className="mt-4 text-sm text-gray-500">Nothing yet.</p> : null}

      {rows && rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs text-gray-500">
              <tr>
                <th className="py-2 pr-4">When</th>
                <th className="py-2 pr-4">Shop</th>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Prompt</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Image</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2 pr-4">
                    {r.retailer.shop_name}
                    <span className="block text-xs text-gray-500">{r.retailer.city}</span>
                  </td>
                  <td className="py-2 pr-4">{r.product.name}</td>
                  <td className="py-2 pr-4 max-w-md">{r.prompt}</td>
                  <td className="py-2 pr-4">
                    {r.status}
                    {r.error ? <span className="block text-xs text-red-600">{r.error}</span> : null}
                  </td>
                  <td className="py-2">
                    {r.image_url ? (
                      <a href={r.image_url} target="_blank" rel="noreferrer" className="underline">
                        View
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
