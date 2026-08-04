'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Package, Save, Loader2, Plus, Trash2, Gift, CalendarClock } from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Tier = {
  id: string
  min_items: number
  max_items: number | null
  price_inr: number
}

export default function CatalogUploadTiersPage() {
  const [tiers, setTiers] = useState<Tier[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [newTier, setNewTier] = useState({ min_items: '', max_items: '', price_inr: '' })
  // Limited-time free offer (F-019 Task 2): auto-quoted ₹0 by the backend
  // for catalog requests within the free limit while the window is live.
  const [promo, setPromo] = useState({ free_item_limit: '', expires_at: '' })
  const [promoActive, setPromoActive] = useState(false)
  const [promoLoading, setPromoLoading] = useState(true)
  const [promoSaving, setPromoSaving] = useState(false)
  const [promoStatus, setPromoStatus] = useState('')

  const loadPromo = async () => {
    const res = await fetch(`${API_URL}/v1/admin/settings/catalog-upload-promo`, adminGetOptions())
    const json = await res.json()
    const p = json.data
    setPromo({
      free_item_limit: p.free_item_limit != null ? String(p.free_item_limit) : '',
      expires_at: p.expires_at ? p.expires_at.slice(0, 16) : '', // datetime-local format
    })
    setPromoActive(!!p.active)
    setPromoLoading(false)
  }

  const savePromo = async () => {
    setPromoSaving(true)
    setPromoStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/settings/catalog-upload-promo`, {
        ...(await adminMutateOptions()),
        method: 'PUT',
        body: JSON.stringify({
          free_item_limit: promo.free_item_limit ? Number(promo.free_item_limit) : null,
          expires_at: promo.expires_at ? new Date(promo.expires_at).toISOString() : null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      const json = await res.json()
      setPromoActive(!!json.data.active)
      setPromoStatus(`✅ ${json.data.active ? 'Promo is LIVE' : 'Promo saved (not active)'}`)
    } catch (err) {
      setPromoStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setPromoSaving(false)
    }
  }

  const load = async () => {
    const res = await fetch(`${API_URL}/v1/admin/catalog-upload-tiers`, adminGetOptions())
    const json = await res.json()
    setTiers(json.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    loadPromo()
  }, [])

  const updateTier = (id: string, patch: Partial<Tier>) => {
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  const save = async (tier: Tier) => {
    setSaving(tier.id)
    setStatus('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/catalog-upload-tiers/${tier.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify({
          min_items: tier.min_items,
          max_items: tier.max_items,
          price_inr: tier.price_inr,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setStatus(`✅ Tier saved`)
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Save failed'}`)
    } finally {
      setSaving(null)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('Delete this price tier?')) return
    await fetch(`${API_URL}/v1/admin/catalog-upload-tiers/${id}`, {
      ...(await adminMutateOptions()),
      method: 'DELETE',
    })
    setTiers((prev) => prev.filter((t) => t.id !== id))
  }

  const create = async () => {
    if (!newTier.min_items || !newTier.price_inr) {
      setStatus('❌ Min items and price are required')
      return
    }
    setSaving('new')
    try {
      const res = await fetch(`${API_URL}/v1/admin/catalog-upload-tiers`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({
          min_items: Number(newTier.min_items),
          max_items: newTier.max_items ? Number(newTier.max_items) : null,
          price_inr: Number(newTier.price_inr),
        }),
      })
      if (!res.ok) throw new Error('Create failed')
      const json = await res.json()
      setTiers((prev) => [...prev, json.data].sort((a, b) => a.min_items - b.min_items))
      setNewTier({ min_items: '', max_items: '', price_inr: '' })
      setStatus('✅ Tier created')
    } catch (err) {
      setStatus(`❌ ${err instanceof Error ? err.message : 'Create failed'}`)
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-cyan-500" />
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Catalog Upload Price Tiers</h1>
          <Package size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          F-019 — item-count-to-price tiers for the paid on-site catalog upload service. Edited here, no
          deploy needed. Admin still quotes each request manually from Support Tickets — these tiers are
          the reference table for that quote.
        </p>
      </div>

      {status && (
        <div
          className={`text-sm rounded-xl px-4 py-3 border ${
            status.startsWith('✅')
              ? 'bg-green-50/80 border-green-200 text-green-700'
              : 'bg-red-50/80 border-red-200 text-red-600'
          }`}
        >
          {status}
        </div>
      )}

      {/* Limited-time free offer — auto-enforced by the quoting route */}
      <div
        className={`bg-white/80 backdrop-blur-xl rounded-2xl border p-6 ${
          promoActive ? 'border-green-300/80 shadow-lg shadow-green-500/10' : 'border-gray-200/80'
        }`}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                promoActive ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'
              }`}
            >
              <Gift size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Limited-Time Free Offer</h2>
              <p className="text-xs text-gray-500">
                Auto-quoted ₹0 by the system for catalog requests within the free limit — no manual quoting
                needed while the window is live. Expired/over-limit requests fall back to manual pricing.
              </p>
            </div>
          </div>
          {!promoLoading && (
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
                promoActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {promoActive ? '● Live' : 'Inactive'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Free item limit</label>
            <input
              type="number"
              value={promo.free_item_limit}
              onChange={(e) => setPromo((p) => ({ ...p, free_item_limit: e.target.value }))}
              placeholder="e.g. 500"
              className="w-32 px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
            />
            <p className="text-[10px] text-gray-400 mt-1">Empty = offer disabled</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              <CalendarClock size={12} className="inline mr-1 -mt-0.5" />
              Offer ends (local time)
            </label>
            <input
              type="datetime-local"
              value={promo.expires_at}
              onChange={(e) => setPromo((p) => ({ ...p, expires_at: e.target.value }))}
              className="w-56 px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-400 transition-all"
            />
            <p className="text-[10px] text-gray-400 mt-1">Empty = runs until cleared</p>
          </div>
          <button
            onClick={savePromo}
            disabled={promoSaving}
            className={`text-sm font-semibold px-5 py-2.5 rounded-xl transition-all flex items-center gap-2 disabled:opacity-60 ${
              promoActive
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-500/25'
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25'
            }`}
          >
            {promoSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save Offer
          </button>
          {promoStatus && (
            <span
              className={`text-xs font-medium ${
                promoStatus.startsWith('✅') ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {promoStatus}
            </span>
          )}
        </div>
      </div>

      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Min items</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Max items</th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Price (₹)</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <tr key={tier.id} className="border-b border-gray-50">
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={tier.min_items}
                    onChange={(e) => updateTier(tier.id, { min_items: Number(e.target.value) })}
                    className="w-24 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={tier.max_items ?? ''}
                    placeholder="open-ended"
                    onChange={(e) =>
                      updateTier(tier.id, { max_items: e.target.value ? Number(e.target.value) : null })
                    }
                    className="w-28 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    value={tier.price_inr}
                    onChange={(e) => updateTier(tier.id, { price_inr: Number(e.target.value) })}
                    className="w-28 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => save(tier)}
                      disabled={saving === tier.id}
                      className="p-1.5 text-gray-400 hover:text-cyan-600 disabled:opacity-50 transition-colors"
                      aria-label="Save tier"
                    >
                      {saving === tier.id ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    </button>
                    <button
                      onClick={() => remove(tier.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                      aria-label="Delete tier"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            <tr>
              <td className="px-3 py-2">
                <input
                  type="number"
                  value={newTier.min_items}
                  placeholder="min"
                  onChange={(e) => setNewTier((p) => ({ ...p, min_items: e.target.value }))}
                  className="w-24 px-2 py-1.5 text-sm border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  value={newTier.max_items}
                  placeholder="open-ended"
                  onChange={(e) => setNewTier((p) => ({ ...p, max_items: e.target.value }))}
                  className="w-28 px-2 py-1.5 text-sm border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </td>
              <td className="px-3 py-2">
                <input
                  type="number"
                  value={newTier.price_inr}
                  placeholder="price"
                  onChange={(e) => setNewTier((p) => ({ ...p, price_inr: e.target.value }))}
                  className="w-28 px-2 py-1.5 text-sm border border-dashed border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </td>
              <td className="px-3 py-2">
                <button
                  onClick={create}
                  disabled={saving === 'new'}
                  className="p-1.5 text-gray-400 hover:text-cyan-600 disabled:opacity-50 transition-colors"
                  aria-label="Add tier"
                >
                  {saving === 'new' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}
