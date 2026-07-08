'use client'

import { useState, useEffect, useCallback } from 'react'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Stats = {
  total_retailers: number
  active_subscriptions: number
  trial_retailers: number
  total_products: number
  total_collections: number
  views_this_month: number
  enquiries_this_month: number
}

type Retailer = {
  id: string
  shop_name: string
  city: string
  phone: string
  plan: string
  plan_status: string
  trial_ends_at: string | null
  created_at: string
  onboarding_completed: boolean
  product_count: number
  customer_count: number
  collection_count: number
}

async function adminFetch<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: { 'x-admin-key': key } })
  if (!res.ok) throw new Error(res.status === 403 ? 'Invalid admin key' : `Error ${res.status}`)
  return res.json() as Promise<T>
}

export default function AdminPage() {
  const [key, setKey] = useState('')
  const [authed, setAuthed] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [retailers, setRetailers] = useState<Retailer[]>([])
  const [search, setSearch] = useState('')

  const load = useCallback(async (adminKey: string, searchTerm = '') => {
    const qs = searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''
    const [s, r] = await Promise.all([
      adminFetch<{ data: Stats }>('/v1/admin/stats', adminKey),
      adminFetch<{ data: Retailer[] }>(`/v1/admin/retailers${qs}`, adminKey),
    ])
    setStats(s.data)
    setRetailers(r.data)
  }, [])

  useEffect(() => {
    const saved = sessionStorage.getItem('admin_key')
    if (saved) {
      setKey(saved)
      load(saved)
        .then(() => setAuthed(true))
        .catch(() => sessionStorage.removeItem('admin_key'))
    }
  }, [load])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await load(key)
      sessionStorage.setItem('admin_key', key)
      setAuthed(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    }
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    await load(key, search)
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <form onSubmit={handleLogin} className="bg-white rounded-2xl p-8 border border-gray-200 w-full max-w-sm">
          <h1 className="text-lg font-bold text-gray-900 mb-4">Kanchuki Admin</h1>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Admin key"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3"
          />
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <button
            type="submit"
            className="w-full bg-violet-600 text-white font-semibold py-2.5 rounded-xl hover:bg-violet-700"
          >
            Sign in
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Kanchuki Admin</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <StatCard label="Retailers" value={stats.total_retailers} />
          <StatCard label="Active subs" value={stats.active_subscriptions} />
          <StatCard label="On trial" value={stats.trial_retailers} />
          <StatCard label="Products" value={stats.total_products} />
          <StatCard label="Collections" value={stats.total_collections} />
          <StatCard label="Views (month)" value={stats.views_this_month} />
          <StatCard label="Enquiries (month)" value={stats.enquiries_this_month} />
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search shop, city, phone…"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
        />
        <button type="submit" className="bg-violet-600 text-white text-sm font-semibold px-4 rounded-xl">
          Search
        </button>
      </form>

      {/* Retailer table */}
      <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Shop</th>
              <th className="px-4 py-3 font-medium">City</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Products</th>
              <th className="px-4 py-3 font-medium text-right">Customers</th>
              <th className="px-4 py-3 font-medium text-right">Collections</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {retailers.map((r) => (
              <tr key={r.id} className="border-b border-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">
                  {r.shop_name}
                  {!r.onboarding_completed && (
                    <span className="ml-2 text-xs text-amber-600">(onboarding)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{r.city}</td>
                <td className="px-4 py-3 text-gray-600">{r.plan}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      r.plan_status === 'ACTIVE'
                        ? 'bg-green-100 text-green-700'
                        : r.plan_status === 'TRIAL'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {r.plan_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-600">{r.product_count}</td>
                <td className="px-4 py-3 text-right text-gray-600">{r.customer_count}</td>
                <td className="px-4 py-3 text-right text-gray-600">{r.collection_count}</td>
                <td className="px-4 py-3 text-gray-400">
                  {new Date(r.created_at).toLocaleDateString('en-IN')}
                </td>
              </tr>
            ))}
            {retailers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No retailers found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200">
      <div className="text-2xl font-bold text-gray-900">{value.toLocaleString('en-IN')}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
