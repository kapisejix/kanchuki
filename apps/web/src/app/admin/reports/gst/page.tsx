'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Receipt,
  FileText,
  IndianRupee,
  TrendingUp,
  Users,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type Summary = {
  total_orders: number
  invoiced_orders: number
  pending_invoices: number
  total_taxable: number
  total_gst: number
  total_sales: number
  cgst: number
  sgst: number
  igst: number
}

type MonthlyData = {
  month: number
  month_name: string
  taxable: number
  gst: number
  sales: number
  orders: number
}

type RetailerBreakdown = {
  retailer_id: string
  shop_name: string
  city: string
  gstin: string | null
  orders: number
  taxable: number
  gst: number
  sales: number
}

type Transaction = {
  id: string
  customer: string
  taxable: number
  gst: number
  total: number
  invoice_number: string | null
  has_invoice: boolean
  date: string
  retailer: string
  gstin: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 24 } },
}

// ─── Helpers ──────────────────────────────────────────────────────

// ponytail: guard the shared sink — undefined/NaN from a partial API payload renders ₹0, not a crash
const fmtINR = (n: number) => `₹${(Number.isFinite(n) ? n : 0).toLocaleString('en-IN')}`
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

// ─── Stats Card ───────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color, sub }: { icon: LucideIcon; label: string; value: string; color: string; sub?: string }) {
  return (
    <motion.div variants={itemVariants} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </motion.div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────

export default function GstReportPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(0) // 0 = all months
  const [summary, setSummary] = useState<Summary | null>(null)
  const [monthly, setMonthly] = useState<MonthlyData[]>([])
  const [retailers, setRetailers] = useState<RetailerBreakdown[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ year: String(year) })
      if (month > 0) params.set('month', String(month))

      const [sumRes, monthRes, retRes, txRes] = await Promise.all([
        fetch(`${API_URL}/v1/admin/gst/summary?${params}`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/gst/monthly?year=${year}`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/gst/by-retailer?${params}`, adminGetOptions()),
        fetch(`${API_URL}/v1/admin/gst/transactions?${params}&page=${page}&limit=20`, adminGetOptions()),
      ])

      if (sumRes.ok) {
        const j = await sumRes.json()
        setSummary(j.data)
      }
      if (monthRes.ok) {
        const j = await monthRes.json()
        setMonthly(j.data?.months ?? [])
      }
      if (retRes.ok) {
        const j = await retRes.json()
        setRetailers(j.data ?? [])
      }
      if (txRes.ok) {
        const j = await txRes.json()
        setTransactions(j.data?.transactions ?? [])
        setTotalPages(j.data?.pagination?.pages ?? 1)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [year, month, page])

  const maxGst = Math.max(...monthly.map((m) => m.gst), 1)

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="text-emerald-500" size={28} />
              GST Report Dashboard
            </h1>
            <p className="text-sm text-gray-500 mt-1">Tax summary, monthly trends, and transaction history</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={month}
              onChange={(e) => { setMonth(Number(e.target.value)); setPage(1) }}
              className="px-3 py-2 rounded-lg text-sm border border-gray-200 bg-white"
            >
              <option value={0}>All Months</option>
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <button onClick={() => setYear(y => y - 1)} className="p-2 rounded-lg hover:bg-gray-100"><ChevronLeft size={16} /></button>
              <span className="text-sm font-medium px-2">{year}</span>
              <button onClick={() => setYear(y => y + 1)} className="p-2 rounded-lg hover:bg-gray-100"><ChevronRight size={16} /></button>
            </div>
          </div>
        </div>

        {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : (
          <>
            {/* Summary Cards */}
            {summary && (
              <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard icon={IndianRupee} label="Total Sales" value={fmtINR(summary.total_sales)} color="bg-emerald-50 text-emerald-600" sub={`${fmtINR(summary.total_taxable)} taxable`} />
                <StatCard icon={Receipt} label="Total GST" value={fmtINR(summary.total_gst)} color="bg-blue-50 text-blue-600" sub={`CGST ${fmtINR(summary.cgst)} + SGST ${fmtINR(summary.sgst)}`} />
                <StatCard icon={FileText} label="Orders" value={String(summary.total_orders)} color="bg-purple-50 text-purple-600" sub={`${summary.invoiced_orders} invoiced`} />
                <StatCard icon={AlertCircle} label="Pending Invoices" value={String(summary.pending_invoices)} color={summary.pending_invoices > 0 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'} />
              </motion.div>
            )}

            {/* Monthly Chart */}
            {monthly.length > 0 && (
              <motion.div variants={itemVariants} initial="hidden" animate="visible" className="bg-white rounded-xl border border-gray-100 p-6 mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly GST Collection — {year}</h2>
                <div className="flex items-end gap-2 h-48">
                  {monthly.map((m) => {
                    const height = maxGst > 0 ? (m.gst / maxGst) * 100 : 0
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-500">{m.gst > 0 ? fmtINR(m.gst) : ''}</span>
                        <div
                          className={`w-full rounded-t transition-all ${m.gst > 0 ? 'bg-emerald-400 hover:bg-emerald-500' : 'bg-gray-100'}`}
                          style={{ height: `${Math.max(height, 2)}%` }}
                          title={`${m.month_name}: ${fmtINR(m.gst)} GST`}
                        />
                        <span className="text-xs text-gray-400">{m.month_name}</span>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}

            {/* Per-Retailer Breakdown */}
            {retailers.length > 0 && (
              <motion.div variants={itemVariants} initial="hidden" animate="visible" className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Users size={18} /> Top Retailers by GST
                  </h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-6 py-3 font-medium text-gray-500">Retailer</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-500">GSTIN</th>
                      <th className="text-right px-6 py-3 font-medium text-gray-500">Orders</th>
                      <th className="text-right px-6 py-3 font-medium text-gray-500">Taxable</th>
                      <th className="text-right px-6 py-3 font-medium text-gray-500">GST</th>
                      <th className="text-right px-6 py-3 font-medium text-gray-500">Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retailers.map((r) => (
                      <tr key={r.retailer_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-6 py-3">
                          <p className="font-medium text-gray-900">{r.shop_name}</p>
                          <p className="text-xs text-gray-400">{r.city}</p>
                        </td>
                        <td className="px-6 py-3 text-gray-500 font-mono text-xs">{r.gstin ?? '—'}</td>
                        <td className="px-6 py-3 text-right text-gray-500">{r.orders}</td>
                        <td className="px-6 py-3 text-right text-gray-500">{fmtINR(r.taxable)}</td>
                        <td className="px-6 py-3 text-right font-medium text-emerald-600">{fmtINR(r.gst)}</td>
                        <td className="px-6 py-3 text-right font-medium text-gray-900">{fmtINR(r.sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            )}

            {/* Transaction List */}
            {transactions.length > 0 && (
              <motion.div variants={itemVariants} initial="hidden" animate="visible" className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="text-left px-6 py-3 font-medium text-gray-500">Date</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-500">Customer</th>
                      <th className="text-left px-6 py-3 font-medium text-gray-500">Retailer</th>
                      <th className="text-right px-6 py-3 font-medium text-gray-500">Taxable</th>
                      <th className="text-right px-6 py-3 font-medium text-gray-500">GST</th>
                      <th className="text-right px-6 py-3 font-medium text-gray-500">Total</th>
                      <th className="text-center px-6 py-3 font-medium text-gray-500">Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="px-6 py-3 text-gray-500">{fmtDate(t.date)}</td>
                        <td className="px-6 py-3 text-gray-900">{t.customer}</td>
                        <td className="px-6 py-3 text-gray-500">{t.retailer}</td>
                        <td className="px-6 py-3 text-right text-gray-500">{fmtINR(t.taxable)}</td>
                        <td className="px-6 py-3 text-right text-emerald-600">{fmtINR(t.gst)}</td>
                        <td className="px-6 py-3 text-right font-medium text-gray-900">{fmtINR(t.total)}</td>
                        <td className="px-6 py-3 text-center">
                          {t.has_invoice ? (
                            <CheckCircle size={16} className="text-green-500 mx-auto" />
                          ) : (
                            <AlertCircle size={16} className="text-amber-400 mx-auto" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
                    <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1 rounded-lg text-sm border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-1 rounded-lg text-sm border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {summary && summary.total_orders === 0 && (
              <div className="text-center py-12 text-gray-400">
                <Receipt size={48} className="mx-auto mb-3 opacity-30" />
                <p>No GST data for this period.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
