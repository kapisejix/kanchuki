'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  IndianRupee,
  Percent,
  ReceiptText,
  PiggyBank,
  Wallet,
  TrendingUp,
  Plus,
  X,
  Trash2,
  Pencil,
  CalendarDays,
  NotebookPen,
  Tag,
  AlertTriangle,
  Download,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { adminGetOptions, adminMutateOptions } from '@/lib/admin-fetch'

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'

// ─── Types ─────────────────────────────────────────────────────────

type MonthSummary = {
  period: string
  total_payment_inr: number
  commission_inr: number
  spent_inr: number
  remaining_inr: number
  expense_count: number
}

type Expense = {
  id: string
  period: string
  amount_inr: number
  category: string
  expense_date: string
  notes: string | null
  created_at: string
}

type MonthExpenses = {
  month: string
  summary: MonthSummary
  expenses: Expense[]
}

// ─── Helpers ──────────────────────────────────────────────────────

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`

const fmtMonth = (period: string) => {
  const [y, m] = period.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

// Dates are entered/displayed in IST (the admin's business calendar) but
// stored as UTC ISO. toISOString() would shift an IST date a day early, so
// these two helpers convert explicitly — same IST convention as the API's
// periodKey()/monthRange() (admin-commission.ts).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

/** ISO date string (YYYY-MM-DD) for an instant, in IST. */
const istDate = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** YYYY-MM-DD (IST) → UTC ISO instant (IST midnight). */
const isoFromIst = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS).toISOString()
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 22 } },
}

// ─── Main Page ────────────────────────────────────────────────────

export default function CommissionPage() {
  const [overview, setOverview] = useState<MonthSummary[] | null>(null)
  const [tab, setTab] = useState<'summary' | 'expenses'>('summary')
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [monthData, setMonthData] = useState<MonthExpenses | null>(null)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null)

  // Load the monthly overview once.
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_URL}/v1/admin/commission/overview?months=24`, adminGetOptions())
        const json = await res.json()
        if (!json?.data) {
          setError('The API returned an error while loading commission data.')
          return
        }
        setOverview(json.data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load commission data')
      }
    }
    load()
  }, [])

  // Load the selected month's expenses when the month or tab changes.
  useEffect(() => {
    if (tab !== 'expenses') return
    async function load() {
      const res = await fetch(
        `${API_URL}/v1/admin/commission/expenses?month=${selectedMonth}`,
        adminGetOptions(),
      )
      const json = await res.json()
      if (json?.data) setMonthData(json.data)
    }
    load()
  }, [tab, selectedMonth])

  const currentMonth = overview?.[0]
  const monthOptions = useMemo(
    () => (overview ?? []).map((r) => r.period),
    [overview],
  )

  const openMonth = (period: string) => {
    setSelectedMonth(period)
    setTab('expenses')
  }

  const refreshMonth = async () => {
    const res = await fetch(
      `${API_URL}/v1/admin/commission/expenses?month=${selectedMonth}`,
      adminGetOptions(),
    )
    const json = await res.json()
    if (json?.data) setMonthData(json.data)
  }

  const refreshOverview = async () => {
    const res = await fetch(`${API_URL}/v1/admin/commission/overview?months=24`, adminGetOptions())
    const json = await res.json()
    if (json?.data) setOverview(json.data)
  }

  // CSV export of expenditure for the last N months (1/3/6/12).
  const exportCsv = async (months: number) => {
    try {
      const res = await fetch(`${API_URL}/v1/admin/commission/export?months=${months}`, adminGetOptions())
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const cd = res.headers.get('content-disposition') ?? ''
      const name = cd.match(/filename="([^"]+)"/)?.[1] ?? `kanchuki-commission-${months}m.csv`
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    }
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-8">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Commission</h1>
          <Percent size={20} className="text-cyan-500" />
        </div>
        <p className="text-sm text-gray-500">
          3% of each month&apos;s total payments — track the pool and what you spend from it.
        </p>
      </motion.div>

      {error && (
        <motion.div
          variants={itemVariants}
          className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-6 py-4"
        >
          {error}
        </motion.div>
      )}

      {overview && (
        <>
          {/* Current-month cards */}
          <motion.div variants={containerVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={TrendingUp}
              label={`Total Payments · ${fmtMonth(currentMonth?.period ?? selectedMonth)}`}
              value={inr(currentMonth?.total_payment_inr ?? 0)}
              subtext="Successful subscription payments"
              color="blue"
            />
            <SummaryCard
              icon={PiggyBank}
              label="3% Commission Pool"
              value={inr(currentMonth?.commission_inr ?? 0)}
              subtext="Set aside from this month's payments"
              color="green"
            />
            <SummaryCard
              icon={Wallet}
              label="Spent"
              value={inr(currentMonth?.spent_inr ?? 0)}
              subtext={`${currentMonth?.expense_count ?? 0} expense entries`}
              color="amber"
            />
            <SummaryCard
              icon={IndianRupee}
              label="Remaining"
              value={inr(currentMonth?.remaining_inr ?? 0)}
              subtext={(currentMonth?.remaining_inr ?? 0) < 0 ? 'Pool overspent — over the 3%' : 'Still available to spend'}
              color={(currentMonth?.remaining_inr ?? 0) < 0 ? 'red' : 'purple'}
            />
          </motion.div>

          {/* Tabs */}
          <motion.div variants={itemVariants} className="flex items-center gap-2">
            <TabButton
              active={tab === 'summary'}
              onClick={() => setTab('summary')}
              icon={ReceiptText}
              label="Monthly Summary"
            />
            <TabButton
              active={tab === 'expenses'}
              onClick={() => setTab('expenses')}
              icon={NotebookPen}
              label="Expenditure"
            />
          </motion.div>

          {tab === 'summary' ? (
            <MonthlySummaryTab
              rows={overview}
              onOpenMonth={openMonth}
            />
          ) : (
            <ExpenditureTab
              month={selectedMonth}
              monthOptions={monthOptions}
              data={monthData}
              onMonthChange={setSelectedMonth}
              onAdd={() => setFormOpen(true)}
              onExport={(months) => void exportCsv(months)}
              onRowClick={setDetailExpense}
              onRefresh={refreshMonth}
            />
          )}
        </>
      )}

      {/* Loading skeleton */}
      {!overview && !error && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white/80 rounded-2xl border border-gray-200/80 p-5 animate-pulse">
              <div className="h-3 bg-gray-200/80 rounded w-20 mb-3" />
              <div className="h-8 bg-gray-200/80 rounded w-24" />
            </div>
          ))}
        </div>
      )}

      {/* Add-expense form modal */}
      <AnimatePresence>
        {formOpen && (
          <AddExpenseModal
            defaultMonth={selectedMonth}
            monthOptions={monthOptions}
            onClose={() => setFormOpen(false)}
            onSaved={async () => {
              setFormOpen(false)
              await Promise.all([refreshMonth(), refreshOverview()])
            }}
          />
        )}
      </AnimatePresence>

      {/* Expense detail popup */}
      <AnimatePresence>
        {detailExpense && (
          <ExpenseDetailModal
            expense={detailExpense}
            monthOptions={monthOptions}
            onClose={() => setDetailExpense(null)}
            onChanged={async () => {
              await Promise.all([refreshMonth(), refreshOverview()])
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ── Summary tab ───────────────────────────────────────────────────

function MonthlySummaryTab({
  rows,
  onOpenMonth,
}: {
  rows: MonthSummary[]
  onOpenMonth: (period: string) => void
}) {
  return (
    <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <ReceiptText size={16} className="text-gray-400" />
          Month-wise Commission
        </h2>
        <span className="text-xs text-gray-400">Click a month to see its expenditure</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500">Month</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Total Payments</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">3% Commission</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Spent</th>
              <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <motion.tr
                key={row.period}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => onOpenMonth(row.period)}
                className="border-b border-gray-50 hover:bg-cyan-50/40 cursor-pointer transition-colors group"
              >
                <td className="px-6 py-3.5 font-semibold text-gray-900 group-hover:text-cyan-700">
                  {fmtMonth(row.period)}
                  {row.expense_count > 0 && (
                    <span className="ml-2 text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                      {row.expense_count} {row.expense_count === 1 ? 'entry' : 'entries'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5 text-right text-gray-600 tabular-nums">{inr(row.total_payment_inr)}</td>
                <td className="px-4 py-3.5 text-right font-semibold text-green-600 tabular-nums">{inr(row.commission_inr)}</td>
                <td className="px-4 py-3.5 text-right text-amber-600 tabular-nums">{inr(row.spent_inr)}</td>
                <td className={`px-6 py-3.5 text-right font-semibold tabular-nums ${row.remaining_inr < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {row.remaining_inr < 0 ? `−${inr(-row.remaining_inr)}` : inr(row.remaining_inr)}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  )
}

// ── Expenditure tab ───────────────────────────────────────────────

function ExpenditureTab({
  month,
  monthOptions,
  data,
  onMonthChange,
  onAdd,
  onExport,
  onRowClick,
  onRefresh,
}: {
  month: string
  monthOptions: string[]
  data: MonthExpenses | null
  onMonthChange: (month: string) => void
  onAdd: () => void
  onExport: (months: number) => void
  onRowClick: (expense: Expense) => void
  onRefresh: () => void
}) {
  const summary = data?.summary

  return (
    <div className="space-y-6">
      {/* Month selector + add button */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-white/80 border border-gray-200/80 rounded-xl px-3 py-2">
          <CalendarDays size={16} className="text-gray-400" />
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && onMonthChange(e.target.value)}
            className="text-sm font-medium text-gray-700 bg-transparent outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {monthOptions.slice(0, 6).map((p) => (
            <button
              key={p}
              onClick={() => onMonthChange(p)}
              className={`text-xs font-medium rounded-full px-3 py-1.5 border transition-colors ${
                p === month
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white/80 text-gray-500 border-gray-200 hover:border-cyan-300 hover:text-cyan-700'
              }`}
            >
              {fmtMonth(p).split(' ')[0]} {fmtMonth(p).split(' ')[1]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ExportMenu onExport={onExport} />
          <motion.button
            onClick={onAdd}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-cyan-500/25 flex items-center gap-2"
          >
            <Plus size={16} />
            Add Expense
          </motion.button>
        </div>
      </motion.div>

      {/* Selected-month summary strip */}
      {summary && (
        <motion.div variants={containerVariants} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Total Payments" value={inr(summary.total_payment_inr)} color="text-blue-600" />
          <MiniStat label="3% Commission" value={inr(summary.commission_inr)} color="text-green-600" />
          <MiniStat label="Spent" value={inr(summary.spent_inr)} color="text-amber-600" />
          <MiniStat
            label="Remaining"
            value={summary.remaining_inr < 0 ? `−${inr(-summary.remaining_inr)}` : inr(summary.remaining_inr)}
            color={summary.remaining_inr < 0 ? 'text-red-600' : 'text-purple-600'}
            warning={summary.remaining_inr < 0}
          />
        </motion.div>
      )}

      {/* Expense grid */}
      <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-xl rounded-2xl border border-gray-200/80 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <NotebookPen size={16} className="text-gray-400" />
            Expenditure · {fmtMonth(month)}
          </h2>
        </div>

        {!data ? (
          <div className="p-10 text-center text-sm text-gray-400 animate-pulse">Loading…</div>
        ) : data.expenses.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
              <Wallet size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">No expenses recorded for this month</p>
            <p className="text-xs text-gray-400 mt-1">
              Add an expense to start tracking how the 3% pool is spent.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.expenses.map((expense, i) => (
              <motion.button
                key={expense.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => onRowClick(expense)}
                className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-cyan-50/40 transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                  <Tag size={17} className="text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{expense.category}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fmtDate(expense.expense_date)}
                    {expense.notes ? ` · ${expense.notes.slice(0, 60)}${expense.notes.length > 60 ? '…' : ''}` : ''}
                  </p>
                </div>
                <span className="text-sm font-bold text-gray-900 tabular-nums shrink-0">
                  {inr(expense.amount_inr)}
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}

// ── Export CSV dropdown ───────────────────────────────────────────

const EXPORT_RANGES = [
  { label: 'This month', months: 1 },
  { label: 'Last 3 months', months: 3 },
  { label: 'Last 6 months', months: 6 },
  { label: 'Last 12 months', months: 12 },
]

function ExportMenu({ onExport }: { onExport: (months: number) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <motion.button
        onClick={() => setOpen((v) => !v)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className="bg-white/80 border border-gray-200/80 hover:border-cyan-300 hover:text-cyan-700 text-gray-600 text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
      >
        <Download size={16} />
        Export CSV
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-2xl py-1.5 z-40"
          >
            <p className="px-4 pt-1.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              Expenditure range
            </p>
            {EXPORT_RANGES.map((r) => (
              <button
                key={r.months}
                onClick={() => {
                  setOpen(false)
                  onExport(r.months)
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-cyan-50 hover:text-cyan-700 transition-colors"
              >
                {r.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Add-expense form modal ────────────────────────────────────────

function AddExpenseModal({
  defaultMonth,
  monthOptions,
  onClose,
  onSaved,
}: {
  defaultMonth: string
  monthOptions: string[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [period, setPeriod] = useState(defaultMonth)
  const [amountRs, setAmountRs] = useState('')
  const [category, setCategory] = useState('')
  const [date, setDate] = useState(() => istDate(new Date().toISOString()))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const amountPaise = Math.round((parseFloat(amountRs) || 0) * 100)
  const canSubmit = amountPaise > 0 && category.trim().length > 0 && date && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/commission/expenses`, {
        ...(await adminMutateOptions()),
        method: 'POST',
        body: JSON.stringify({
          period,
          amount_inr: amountPaise,
          category: category.trim(),
          expense_date: isoFromIst(date),
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? `Failed to save (HTTP ${res.status})`)
      }
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Plus size={17} className="text-cyan-500" />
            Add Expense
          </h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Commission Month
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white outline-none focus:border-cyan-400"
            >
              {monthOptions.map((p) => (
                <option key={p} value={p}>
                  {fmtMonth(p)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Amount (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">₹</span>
              <input
                value={amountRs}
                onChange={(e) => setAmountRs(e.target.value.replace(/[^\d.]/g, ''))}
                inputMode="decimal"
                placeholder="0.00"
                autoFocus
                className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:border-cyan-400 tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Where / Category
            </label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Instagram ads, Travel, Software, Staff…"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Date
            </label>
            <input
              type="date"
              value={date}
              max={istDate(new Date().toISOString())}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
              Notes / Explanation
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why was this spent? Add detail for your records…"
              rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-cyan-400 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <motion.button
              onClick={() => void submit()}
              disabled={!canSubmit}
              whileHover={canSubmit ? { scale: 1.02 } : undefined}
              whileTap={canSubmit ? { scale: 0.98 } : undefined}
              className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <PiggyBank size={16} />
                  Record Expense
                </>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Expense detail popup ──────────────────────────────────────────

function ExpenseDetailModal({
  expense,
  monthOptions,
  onClose,
  onChanged,
}: {
  expense: Expense
  monthOptions: string[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Edit-form state, seeded from the expense when entering edit mode.
  const [period, setPeriod] = useState(expense.period)
  const [amountRs, setAmountRs] = useState((expense.amount_inr / 100).toFixed(0))
  const [category, setCategory] = useState(expense.category)
  const [date, setDate] = useState(() => istDate(expense.expense_date))
  const [notes, setNotes] = useState(expense.notes ?? '')

  const startEdit = () => {
    setPeriod(expense.period)
    setAmountRs((expense.amount_inr / 100).toFixed(0))
    setCategory(expense.category)
    setDate(istDate(expense.expense_date))
    setNotes(expense.notes ?? '')
    setError('')
    setEditing(true)
  }

  const amountPaise = Math.round((parseFloat(amountRs) || 0) * 100)
  const canSave = amountPaise > 0 && category.trim().length > 0 && date && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/v1/admin/commission/expenses/${expense.id}`, {
        ...(await adminMutateOptions()),
        method: 'PATCH',
        body: JSON.stringify({
          period,
          amount_inr: amountPaise,
          category: category.trim(),
          expense_date: isoFromIst(date),
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.error?.message ?? `Failed to save (HTTP ${res.status})`)
      }
      setEditing(false)
      await onChanged()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setDeleting(true)
    try {
      await fetch(`${API_URL}/v1/admin/commission/expenses/${expense.id}`, {
        ...(await adminMutateOptions()),
        method: 'DELETE',
      })
      onClose()
      await onChanged()
    } catch {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className={`bg-white rounded-2xl shadow-2xl w-full p-6 ${editing ? 'max-w-md' : 'max-w-sm'}`}
      >
        {editing ? (
          // ── Edit form ──
          <>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Pencil size={16} className="text-cyan-500" />
                Edit Expense
              </h3>
              <button
                onClick={() => setEditing(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                aria-label="Cancel editing"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Commission Month
                </label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 bg-white outline-none focus:border-cyan-400"
                >
                  {monthOptions.map((p) => (
                    <option key={p} value={p}>
                      {fmtMonth(p)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">₹</span>
                  <input
                    value={amountRs}
                    onChange={(e) => setAmountRs(e.target.value.replace(/[^\d.]/g, ''))}
                    inputMode="decimal"
                    className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:border-cyan-400 tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Where / Category
                </label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Notes / Explanation
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 outline-none focus:border-cyan-400 resize-none"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl px-3 py-2.5">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <motion.button
                  onClick={() => void save()}
                  disabled={!canSave}
                  whileHover={canSave ? { scale: 1.02 } : undefined}
                  whileTap={canSave ? { scale: 0.98 } : undefined}
                  className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-xl shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Pencil size={15} />
                      Save Changes
                    </>
                  )}
                </motion.button>
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-3 rounded-xl"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        ) : (
          // ── Read-only detail ──
          <>
            <div className="flex items-start justify-between mb-4">
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                <Tag size={20} className="text-amber-500" />
              </div>
              <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <p className="text-lg font-bold text-gray-900">{expense.category}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{inr(expense.amount_inr)}</p>

            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Month</span>
                <span className="font-medium text-gray-700">{fmtMonth(expense.period)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Date</span>
                <span className="font-medium text-gray-700">{fmtDate(expense.expense_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Recorded</span>
                <span className="font-medium text-gray-700">{fmtDate(expense.created_at)}</span>
              </div>
              {expense.notes && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-gray-400 mb-1">Notes</p>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{expense.notes}</p>
                </div>
              )}
            </div>

            <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
              <motion.button
                onClick={startEdit}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                className="w-full flex items-center justify-center gap-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                <Pencil size={15} />
                Edit expense
              </motion.button>
              {confirming ? (
                <div className="flex items-center gap-2">
                  <motion.button
                    onClick={() => void remove()}
                    disabled={deleting}
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold py-2.5 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete'}
                  </motion.button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(true)}
                  className="w-full flex items-center justify-center gap-2 text-red-600 hover:text-red-500 hover:bg-red-50 text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  <Trash2 size={15} />
                  Delete expense
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Small building blocks ─────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: LucideIcon
  label: string
  value: string
  subtext: string
  color: 'blue' | 'green' | 'amber' | 'purple' | 'red'
}) {
  const colorMap = {
    blue: { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-600', icon: 'text-blue-500', top: 'from-blue-500/20 to-transparent' },
    green: { bg: 'bg-green-50 border-green-100', text: 'text-green-600', icon: 'text-green-500', top: 'from-green-500/20 to-transparent' },
    amber: { bg: 'bg-amber-50 border-amber-100', text: 'text-amber-600', icon: 'text-amber-500', top: 'from-amber-500/20 to-transparent' },
    purple: { bg: 'bg-purple-50 border-purple-100', text: 'text-purple-600', icon: 'text-purple-500', top: 'from-purple-500/20 to-transparent' },
    red: { bg: 'bg-red-50 border-red-100', text: 'text-red-600', icon: 'text-red-500', top: 'from-red-500/20 to-transparent' },
  }
  const c = colorMap[color]
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -3, boxShadow: '0 12px 24px -8px rgba(0,0,0,0.1)' }}
      className="relative bg-white/80 backdrop-blur-sm rounded-2xl border border-gray-200/80 p-5 transition-all overflow-hidden"
    >
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${c.top}`} />
      <div className="flex items-start justify-between mb-2 relative">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest">{label}</span>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${c.bg} ${c.icon}`}>
          <Icon size={17} />
        </div>
      </div>
      <div className={`text-2xl font-bold relative ${c.text}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-1.5 relative">{subtext}</div>
    </motion.div>
  )
}

function MiniStat({ label, value, color, warning }: { label: string; value: string; color: string; warning?: boolean }) {
  return (
    <motion.div
      variants={itemVariants}
      className="relative bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/80 p-4"
    >
      {warning && (
        <div className="absolute top-2.5 right-2.5 text-red-400">
          <AlertTriangle size={14} />
        </div>
      )}
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1.5">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </motion.div>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: LucideIcon
  label: string
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={`relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
        active ? 'text-cyan-700' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {active && (
        <motion.span
          layoutId="commission-tab"
          className="absolute inset-0 bg-cyan-50 border border-cyan-200 rounded-xl"
          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
        />
      )}
      <Icon size={16} className="relative z-10" />
      <span className="relative z-10">{label}</span>
    </motion.button>
  )
}
