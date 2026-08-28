import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ChevronLeft,
  Receipt,
  TrendingUp,
  FileText,
  CheckCircle,
  Clock,
  ChevronRight,
} from 'lucide-react-native'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { growthApi, type GstTransaction, type GstSummary, type GstMonthly, type GstTransactions } from '../../src/lib/api/growth'

// ─── Helpers ──────────────────────────────────────────────────────

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

// ─── Main Screen ──────────────────────────────────────────────────

export default function GstScreen() {
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<'summary' | 'monthly' | 'transactions'>('summary')
  const currentYear = new Date().getFullYear()
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [txPage, setTxPage] = useState(1)

  const { data: summaryData, isLoading: summaryLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'gst', 'summary', selectedMonth, selectedYear],
    queryFn: () => growthApi.gstSummary({ month: selectedMonth, year: selectedYear }),
  })
  const summary = summaryData?.data

  const { data: monthlyData, isLoading: monthlyLoading } = useQuery({
    queryKey: ['growth', 'gst', 'monthly', selectedYear],
    queryFn: () => growthApi.gstMonthly(selectedYear),
  })
  const monthly = monthlyData?.data

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['growth', 'gst', 'transactions', selectedMonth, selectedYear, txPage],
    queryFn: () =>
      growthApi.gstTransactions({
        month: selectedMonth,
        year: selectedYear,
        page: txPage,
      }),
  })
  const transactions = txData?.data

  const isLoading = summaryLoading || monthlyLoading || txLoading

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center justify-between mb-3.5">
          <View className="flex-row items-center gap-3">
            <AnimatedPressable
              onPress={() => router.back()}
              hitSlop={8}
              className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <ChevronLeft size={20} color="#231F48" />
            </AnimatedPressable>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              GST Filing Ledger
            </Text>
          </View>
          {/* Year selector */}
          <View className="flex-row items-center gap-1 bg-lavender-50 rounded-2xl p-1 border border-lavender-200">
            <AnimatedPressable
              onPress={() => setSelectedYear((y) => y - 1)}
              hitSlop={8}
              className="w-8 h-8 rounded-xl items-center justify-center bg-white border border-lavender-200"
            >
              <ChevronLeft size={14} color="#231F48" />
            </AnimatedPressable>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-sm font-bold text-spaceCadet-900 px-2 text-center"
            >
              {selectedYear}
            </Text>
            <AnimatedPressable
              onPress={() => setSelectedYear((y) => y + 1)}
              hitSlop={8}
              className="w-8 h-8 rounded-xl items-center justify-center bg-white border border-lavender-200"
            >
              <ChevronRight size={14} color="#231F48" />
            </AnimatedPressable>
          </View>
        </View>

        {/* Tab bar */}
        <View className="flex-row gap-2">
          {(
            [
              { key: 'summary', label: 'Summary' },
              { key: 'monthly', label: 'Monthly' },
              { key: 'transactions', label: 'Invoices' },
            ] as const
          ).map((t) => {
            const active = tab === t.key
            return (
              <AnimatedPressable
                key={t.key}
                onPress={() => setTab(t.key)}
                className={`flex-1 items-center py-2.5 rounded-2xl border ${
                  active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}
                >
                  {t.label}
                </Text>
              </AnimatedPressable>
            )
          })}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        {/* Month filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pt-3.5 mb-2">
          <View className="flex-row gap-2">
            <AnimatedPressable
              onPress={() => { setSelectedMonth(undefined); setTxPage(1) }}
              className={`rounded-full px-4 py-1.5 border ${
                !selectedMonth ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
              }`}
            >
              <Text
                className={`text-xs font-bold ${!selectedMonth ? 'text-white' : 'text-spaceCadet-900'}`}
              >
                Full Year
              </Text>
            </AnimatedPressable>
            {MONTHS.map((m, i) => {
              const active = selectedMonth === i + 1
              return (
                <AnimatedPressable
                  key={i}
                  onPress={() => { setSelectedMonth(i + 1); setTxPage(1) }}
                  className={`rounded-full px-4 py-1.5 border ${
                    active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}
                  >
                    {m}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </ScrollView>

        {isLoading ? (
          <View className="items-center justify-center py-20">
            <Text className="text-xs text-heliotrope-500 font-medium">Loading GST data…</Text>
          </View>
        ) : tab === 'summary' && summary ? (
          <SummaryTab summary={summary} />
        ) : tab === 'monthly' && monthly ? (
          <MonthlyTab monthly={monthly} />
        ) : tab === 'transactions' && transactions ? (
          <TransactionsTab
            transactions={transactions}
            page={txPage}
            onPageChange={setTxPage}
          />
        ) : null}
      </ScrollView>
    </View>
  )
}

// ─── Summary Tab ──────────────────────────────────────────────────

function SummaryTab({
  summary,
}: {
  summary: GstSummary
}) {
  return (
    <View className="px-4 pt-2">
      {/* Main stats cards */}
      <View className="flex-row gap-2.5 mb-3">
        <StatCard
          label="Total Sales"
          value={inr(summary.total_sales)}
          icon={<TrendingUp size={16} color="#BB3F95" />}
          flex
        />
        <StatCard
          label="Total GST"
          value={inr(summary.total_gst)}
          icon={<Receipt size={16} color="#16a34a" />}
          flex
        />
      </View>

      <View className="flex-row gap-2.5 mb-3">
        <StatCard
          label="Taxable Amount"
          value={inr(summary.total_taxable)}
          icon={<FileText size={16} color="#6B4773" />}
          flex
        />
        <StatCard
          label="Total Orders"
          value={String(summary.total_orders)}
          icon={<FileText size={16} color="#BB3F95" />}
          flex
        />
      </View>

      {/* GST Breakdown */}
      <View className="bg-white rounded-3xl border border-lavender-200 p-5 mb-3.5 shadow-sm">
        <Text
          style={{ fontFamily: 'Marcellus_400Regular' }}
          className="text-base font-bold text-spaceCadet-900 mb-3.5"
        >
          GST Breakdown (Estimated)
        </Text>
        <View className="gap-3">
          <BreakdownRow label="CGST (9%)" value={inr(summary.estimated_cgst)} />
          <BreakdownRow label="SGST (9%)" value={inr(summary.estimated_sgst)} />
          <BreakdownRow label="IGST (18%)" value={inr(summary.estimated_igst)} />
          <View className="border-t border-lavender-200 pt-3">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold text-spaceCadet-900">Total GST Liability</Text>
              <Text
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-base font-bold text-fuchsia-700"
              >
                {inr(summary.total_gst)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Invoice status */}
      <View className="bg-white rounded-3xl border border-lavender-200 p-5 shadow-sm">
        <Text
          style={{ fontFamily: 'Marcellus_400Regular' }}
          className="text-base font-bold text-spaceCadet-900 mb-3.5"
        >
          Invoice Fulfillment Status
        </Text>
        <View className="flex-row gap-3">
          <View className="flex-1 items-center py-3.5 bg-emerald-50 rounded-2xl border border-emerald-200">
            <CheckCircle size={20} color="#16a34a" />
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-emerald-700 mt-1"
            >
              {summary.invoiced_orders}
            </Text>
            <Text className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mt-0.5">Invoiced</Text>
          </View>
          <View className="flex-1 items-center py-3.5 bg-amber-50 rounded-2xl border border-amber-200">
            <Clock size={20} color="#d97706" />
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-amber-700 mt-1"
            >
              {summary.pending_invoices}
            </Text>
            <Text className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mt-0.5">Pending</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

// ─── Monthly Tab ──────────────────────────────────────────────────

function MonthlyTab({
  monthly,
}: {
  monthly: GstMonthly
}) {
  const maxGst = Math.max(...monthly.months.map((m) => m.gst), 1)

  return (
    <View className="px-4 pt-2">
      <Text
        style={{ fontFamily: 'Marcellus_400Regular' }}
        className="text-base font-bold text-spaceCadet-900 mb-3.5"
      >
        Monthly GST Breakdown — {monthly.year}
      </Text>

      <View className="gap-3">
        {monthly.months.map((m) => (
          <View
            key={m.month}
            className="bg-white rounded-3xl border border-lavender-200 p-4 shadow-sm"
          >
            <View className="flex-row items-center justify-between mb-2">
              <Text
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-base font-bold text-spaceCadet-900"
              >
                {m.month_name}
              </Text>
              <Text className="text-xs text-heliotrope-500 font-medium">
                {m.orders} {m.orders === 1 ? 'order' : 'orders'}
              </Text>
            </View>
            {/* Bar */}
            <View className="h-2 bg-lavender-100 rounded-full mb-2 overflow-hidden">
              <View
                className="h-full rounded-full bg-fuchsia-600"
                style={{
                  width: `${Math.max((m.gst / maxGst) * 100, 0)}%`,
                }}
              />
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xs text-heliotrope-500 font-medium">
                Sales: {inr(m.sales)}
              </Text>
              <Text
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-sm font-bold text-fuchsia-700"
              >
                GST: {inr(m.gst)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Transactions Tab ─────────────────────────────────────────────

function TransactionsTab({
  transactions,
  page,
  onPageChange,
}: {
  transactions: GstTransactions
  page: number
  onPageChange: (p: number) => void
}) {
  return (
    <View className="px-4 pt-2">
      <View className="flex-row items-center justify-between mb-3.5">
        <Text
          style={{ fontFamily: 'Marcellus_400Regular' }}
          className="text-base font-bold text-spaceCadet-900"
        >
          Invoices ({transactions.pagination.total})
        </Text>
        <Text className="text-xs text-heliotrope-500 font-medium">
          Page {transactions.pagination.page} of {transactions.pagination.pages}
        </Text>
      </View>

      {transactions.transactions.length === 0 ? (
        <View className="items-center py-12">
          <Text className="text-sm text-heliotrope-500 font-medium">No transactions found</Text>
        </View>
      ) : (
        <View className="gap-3">
          {transactions.transactions.map((tx) => (
            <TxRow key={tx.id} tx={tx} />
          ))}
        </View>
      )}

      {/* Pagination */}
      {transactions.pagination.pages > 1 && (
        <View className="flex-row items-center justify-center gap-3 mt-5">
          <AnimatedPressable
            onPress={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className={`rounded-2xl px-5 py-2.5 border ${
              page <= 1 ? 'bg-lavender-50 border-lavender-200 opacity-50' : 'bg-white border-lavender-200'
            }`}
          >
            <Text className="text-xs font-bold text-spaceCadet-900">← Prev</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => onPageChange(Math.min(transactions.pagination.pages, page + 1))}
            disabled={page >= transactions.pagination.pages}
            className="rounded-2xl px-5 py-2.5 bg-spaceCadet-900 shadow-sm"
          >
            <Text className="text-xs font-bold text-white">Next →</Text>
          </AnimatedPressable>
        </View>
      )}
    </View>
  )
}

// ─── Transaction Row ──────────────────────────────────────────────

function TxRow({
  tx,
}: {
  tx: GstTransaction
}) {
  const date = new Date(tx.date)
  const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  return (
    <View className="bg-white rounded-3xl border border-lavender-200 p-4 shadow-sm">
      <View className="flex-row items-center justify-between mb-1.5">
        <Text
          style={{ fontFamily: 'Marcellus_400Regular' }}
          className="text-base font-bold text-spaceCadet-900"
          numberOfLines={1}
        >
          {tx.customer ?? 'Walk-in Client'}
        </Text>
        <Text
          style={{ fontFamily: 'Marcellus_400Regular' }}
          className="text-base font-bold text-spaceCadet-900"
        >
          {inr(tx.total)}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="text-xs text-heliotrope-400 font-medium">{dateStr}</Text>
        <Text className="text-xs text-lavender-300">·</Text>
        <Text className="text-xs text-fuchsia-700 font-bold">GST: {inr(tx.gst)}</Text>
        <View className="flex-1" />
        {tx.has_invoice ? (
          <View className="flex-row items-center gap-1 bg-emerald-50 rounded-full px-2.5 py-0.5 border border-emerald-200">
            <CheckCircle size={11} color="#16a34a" />
            <Text className="text-[10px] font-bold text-emerald-700">
              {tx.invoice_number}
            </Text>
          </View>
        ) : (
          <View className="bg-amber-50 rounded-full px-2.5 py-0.5 border border-amber-200">
            <Text className="text-[10px] font-bold text-amber-700">No invoice</Text>
          </View>
        )}
      </View>
    </View>
  )
}

// ─── Shared Components ────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  flex,
}: {
  label: string
  value: string
  icon: React.ReactNode
  flex?: boolean
}) {
  return (
    <View
      className="bg-white rounded-3xl border border-lavender-200 p-4 shadow-sm"
      style={flex ? { flex: 1 } : undefined}
    >
      <View className="flex-row items-center gap-2 mb-2">
        <View className="w-8 h-8 rounded-xl bg-lavender-100 items-center justify-center border border-lavender-200">
          {icon}
        </View>
        <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider">{label}</Text>
      </View>
      <Text
        style={{ fontFamily: 'Marcellus_400Regular' }}
        className="text-xl font-bold text-spaceCadet-900"
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  )
}

function BreakdownRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-xs text-heliotrope-500 font-medium">{label}</Text>
      <Text className="text-xs font-bold text-spaceCadet-900">{value}</Text>
    </View>
  )
}
