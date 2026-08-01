'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ShoppingCart, IndianRupee, TrendingUp, Users, Package, Loader2 } from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

type Purchase = {
  id: string
  retailer_id: string
  retailer: { id: string; shop_name: string; city: string; phone: string; plan: string } | null
  resource_type: string
  quantity: number
  amount_inr: number
  completed_at: string | null
  created_at: string
}

type TopBuyer = {
  retailer_id: string
  retailer: { id: string; shop_name: string; city: string; phone: string; plan: string } | null
  total_spent_inr: number
  total_quantity: number
  purchase_count: number
}

type ResourceBreakdown = {
  resource_type: string
  total_revenue_inr: number
  total_quantity: number
  purchase_count: number
}

type AddonData = {
  recent_purchases: Purchase[]
  summary: { total_revenue_inr: number; total_purchases: number }
  top_buyers: TopBuyer[]
  resource_breakdown: ResourceBreakdown[]
}

const RESOURCE_LABELS: Record<string, string> = {
  PRODUCT_UPLOAD: 'Product Uploads',
  AI_TAGGING_CALL: 'AI Tagging',
  TRY_ON: 'Try-Ons',
  IMAGE_CROP: 'Image Crops',
  BG_REMOVAL: 'Background Removals',
  API_REQUEST: 'API Requests',
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={18} className="text-white" />
        </div>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </motion.div>
  )
}

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}

export default function AddonPurchasesPage() {
  const [data, setData] = useState<AddonData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/v1/admin/addon-purchases`, adminGetOptions())
        const json = await res.json()
        setData(json.data)
      } catch {
        // generic loading fallback below handles this; no raw error to the browser console
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-cyan-500" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-gray-400">
        Failed to load addon purchase data
      </div>
    )
  }

  const { summary, recent_purchases, top_buyers, resource_breakdown } = data

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Addon Purchases</h1>
          <ShoppingCart size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          Self-serve overage purchases from retailers (F-010 Phase 3). Last 90 days shown.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={IndianRupee}
          label="Total Revenue"
          value={formatInr(summary.total_revenue_inr)}
          sub="All-time addon purchases"
          color="bg-gradient-to-br from-emerald-500 to-green-600"
        />
        <StatCard
          icon={ShoppingCart}
          label="Total Purchases"
          value={summary.total_purchases.toLocaleString('en-IN')}
          sub="Completed transactions"
          color="bg-gradient-to-br from-cyan-500 to-blue-600"
        />
        <StatCard
          icon={TrendingUp}
          label="Top Resource"
          value={resource_breakdown[0]?.resource_type?.replace(/_/g, ' ') ?? 'N/A'}
          sub={resource_breakdown[0] ? formatInr(resource_breakdown[0].total_revenue_inr) : ''}
          color="bg-gradient-to-br from-violet-500 to-purple-600"
        />
        <StatCard
          icon={Users}
          label="Buying Retailers"
          value={top_buyers.length.toLocaleString('en-IN')}
          sub="Unique retailers who purchased addons"
          color="bg-gradient-to-br from-amber-500 to-orange-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Resource breakdown */}
        <div className="lg:col-span-1">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
              <Package size={16} className="text-cyan-500" />
              By Resource Type
            </h2>
            <div className="space-y-3">
              {resource_breakdown.map((r) => (
                <div key={r.resource_type}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-gray-600">
                      {RESOURCE_LABELS[r.resource_type] ?? r.resource_type}
                    </span>
                    <span className="text-xs font-bold text-gray-900">{formatInr(r.total_revenue_inr)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(r.total_revenue_inr / Math.max(...resource_breakdown.map((x) => x.total_revenue_inr))) * 100}%` }}
                        className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full"
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 w-12 text-right">{r.purchase_count}×</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top buyers */}
        <div className="lg:col-span-2">
          <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
              <Users size={16} className="text-cyan-500" />
              Top Buyers
            </h2>
            {top_buyers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No addon purchases yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-2 py-2 text-xs font-semibold text-gray-500">Shop</th>
                      <th className="text-left px-2 py-2 text-xs font-semibold text-gray-500">City</th>
                      <th className="text-left px-2 py-2 text-xs font-semibold text-gray-500">Plan</th>
                      <th className="text-right px-2 py-2 text-xs font-semibold text-gray-500">Purchases</th>
                      <th className="text-right px-2 py-2 text-xs font-semibold text-gray-500">Units</th>
                      <th className="text-right px-2 py-2 text-xs font-semibold text-gray-500">Total Spent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top_buyers.map((buyer, i) => (
                      <tr key={buyer.retailer_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                        <td className="px-2 py-2.5">
                          <span className="font-medium text-gray-800">{buyer.retailer?.shop_name ?? 'Unknown'}</span>
                        </td>
                        <td className="px-2 py-2.5 text-gray-500">{buyer.retailer?.city ?? '-'}</td>
                        <td className="px-2 py-2.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                            buyer.retailer?.plan === 'PRO' ? 'bg-purple-100 text-purple-700' :
                            buyer.retailer?.plan === 'GROWTH' ? 'bg-cyan-100 text-cyan-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {buyer.retailer?.plan ?? '-'}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 text-right text-gray-700">{buyer.purchase_count}</td>
                        <td className="px-2 py-2.5 text-right text-gray-700">{buyer.total_quantity.toLocaleString('en-IN')}</td>
                        <td className="px-2 py-2.5 text-right font-semibold text-gray-900">
                          {formatInr(buyer.total_spent_inr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent purchases */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-4">Recent Purchases</h2>
        {recent_purchases.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No purchases in the last 90 days</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-2 py-2 text-xs font-semibold text-gray-500">Date</th>
                  <th className="text-left px-2 py-2 text-xs font-semibold text-gray-500">Retailer</th>
                  <th className="text-left px-2 py-2 text-xs font-semibold text-gray-500">Resource</th>
                  <th className="text-right px-2 py-2 text-xs font-semibold text-gray-500">Units</th>
                  <th className="text-right px-2 py-2 text-xs font-semibold text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recent_purchases.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-2 py-2.5 text-gray-500">
                      {new Date(p.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-2 py-2.5 font-medium text-gray-800">
                      {p.retailer?.shop_name ?? 'Unknown'}
                      <span className="text-xs text-gray-400 ml-1">{p.retailer?.city ?? ''}</span>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="text-xs font-medium text-gray-600">
                        {RESOURCE_LABELS[p.resource_type] ?? p.resource_type}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right text-gray-700">{p.quantity.toLocaleString('en-IN')}</td>
                    <td className="px-2 py-2.5 text-right font-semibold text-gray-900">
                      {formatInr(p.amount_inr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  )
}
