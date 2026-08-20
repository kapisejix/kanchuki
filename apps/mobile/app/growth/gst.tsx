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
import { useTheme } from '../../src/lib/theme'

// ─── Helpers ──────────────────────────────────────────────────────

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`

// ─── Main Screen ──────────────────────────────────────────────────

export default function GstScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<'summary' | 'monthly' | 'transactions'>('summary')
  const currentYear = new Date().getFullYear()
  const currentMonth = new Date().getMonth() + 1
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
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-3">
            <AnimatedPressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <ChevronLeft size={24} color={colors.sand[700]} />
            </AnimatedPressable>
            <Text className="text-base font-bold text-sand-900">GST Report</Text>
          </View>
          {/* Year selector */}
          <View className="flex-row items-center gap-1">
            <AnimatedPressable
              onPress={() => setSelectedYear((y) => y - 1)}
              hitSlop={8}
              className="w-7 h-7 rounded-lg items-center justify-center"
              style={{ backgroundColor: colors.sand[100] }}
            >
              <ChevronLeft size={14} color={colors.sand[600]} />
            </AnimatedPressable>
            <Text className="text-sm font-bold text-sand-900 w-10 text-center">
              {selectedYear}
            </Text>
            <AnimatedPressable
              onPress={() => setSelectedYear((y) => y + 1)}
              hitSlop={8}
              className="w-7 h-7 rounded-lg items-center justify-center"
              style={{ backgroundColor: colors.sand[100] }}
            >
              <ChevronRight size={14} color={colors.sand[600]} />
            </AnimatedPressable>
          </View>
        </View>

        {/* Tab bar */}
        <View className="flex-row gap-1 bg-sand-50 rounded-xl p-1">
          {(
            [
              { key: 'summary', label: 'Summary' },
              { key: 'monthly', label: 'Monthly' },
              { key: 'transactions', label: 'Transactions' },
            ] as const
          ).map((t) => (
            <AnimatedPressable
              key={t.key}
              onPress={() => setTab(t.key)}
              className="flex-1 items-center py-2 rounded-lg"
              style={{
                backgroundColor: tab === t.key ? 'white' : 'transparent',
                shadowColor: tab === t.key ? colors.sand[300] : 'transparent',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: tab === t.key ? 0.2 : 0,
                shadowRadius: 2,
                elevation: tab === t.key ? 2 : 0,
              }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: tab === t.key ? primaryColor : colors.sand[500] }}
              >
                {t.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
      >
        {/* Month filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pt-3 mb-2">
          <View className="flex-row gap-2">
            <AnimatedPressable
              onPress={() => { setSelectedMonth(undefined); setTxPage(1) }}
              className="rounded-full px-3 py-1.5 border"
              style={{
                backgroundColor: !selectedMonth ? `${primaryColor}1A` : colors.sand[50],
                borderColor: !selectedMonth ? primaryColor : colors.sand[200],
              }}
            >
              <Text
                className="text-[11px] font-semibold"
                style={{ color: !selectedMonth ? primaryColor : colors.sand[500] }}
              >
                Full Year
              </Text>
            </AnimatedPressable>
            {MONTHS.map((m, i) => (
              <AnimatedPressable
                key={i}
                onPress={() => { setSelectedMonth(i + 1); setTxPage(1) }}
                className="rounded-full px-3 py-1.5 border"
                style={{
                  backgroundColor: selectedMonth === i + 1 ? `${primaryColor}1A` : colors.sand[50],
                  borderColor: selectedMonth === i + 1 ? primaryColor : colors.sand[200],
                }}
              >
                <Text
                  className="text-[11px] font-semibold"
                  style={{ color: selectedMonth === i + 1 ? primaryColor : colors.sand[500] }}
                >
                  {m}
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        </ScrollView>

        {isLoading ? (
          <View className="items-center justify-center py-20">
            <Text className="text-sm text-sand-400">Loading GST data…</Text>
          </View>
        ) : tab === 'summary' && summary ? (
          <SummaryTab summary={summary} primaryColor={primaryColor} colors={colors} />
        ) : tab === 'monthly' && monthly ? (
          <MonthlyTab monthly={monthly} primaryColor={primaryColor} colors={colors} />
        ) : tab === 'transactions' && transactions ? (
          <TransactionsTab
            transactions={transactions}
            page={txPage}
            onPageChange={setTxPage}
            primaryColor={primaryColor}
            colors={colors}
          />
        ) : null}
      </ScrollView>
    </View>
  )
}

// ─── Summary Tab ──────────────────────────────────────────────────

function SummaryTab({
  summary,
  primaryColor,
  colors,
}: {
  summary: GstSummary
  primaryColor: string
  colors: any
}) {
  return (
    <View className="px-4 pt-2">
      {/* Main stats cards */}
      <View className="flex-row gap-2.5 mb-3">
        <StatCard
          label="Total Sales"
          value={inr(summary.total_sales)}
          icon={<TrendingUp size={16} color={primaryColor} />}
          primaryColor={primaryColor}
          colors={colors}
          flex
        />
        <StatCard
          label="Total GST"
          value={inr(summary.total_gst)}
          icon={<Receipt size={16} color={colors.rust?.[500] ?? '#C2724D'} />}
          primaryColor={colors.rust?.[500] ?? '#C2724D'}
          colors={colors}
          flex
        />
      </View>

      <View className="flex-row gap-2.5 mb-3">
        <StatCard
          label="Taxable Amount"
          value={inr(summary.total_taxable)}
          icon={<FileText size={16} color={colors.sand[500]} />}
          primaryColor={colors.sand[500]}
          colors={colors}
          flex
        />
        <StatCard
          label="Orders"
          value={String(summary.total_orders)}
          icon={<FileText size={16} color="#3B82F6" />}
          primaryColor="#3B82F6"
          colors={colors}
          flex
        />
      </View>

      {/* GST Breakdown */}
      <View className="bg-white rounded-2xl border border-sand-100 p-4 mb-3">
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-3">
          GST Breakdown (Estimated)
        </Text>
        <View className="gap-2.5">
          <BreakdownRow label="CGST (9%)" value={inr(summary.estimated_cgst)} colors={colors} />
          <BreakdownRow label="SGST (9%)" value={inr(summary.estimated_sgst)} colors={colors} />
          <BreakdownRow label="IGST (18%)" value={inr(summary.estimated_igst)} colors={colors} />
          <View className="border-t border-sand-100 pt-2.5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold text-sand-900">Total GST</Text>
              <Text className="text-sm font-bold" style={{ color: primaryColor }}>
                {inr(summary.total_gst)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Invoice status */}
      <View className="bg-white rounded-2xl border border-sand-100 p-4">
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-3">
          Invoice Status
        </Text>
        <View className="flex-row gap-3">
          <View className="flex-1 items-center py-3 bg-green-50 rounded-xl">
            <CheckCircle size={18} color="#22C55E" />
            <Text className="text-lg font-bold text-green-700 mt-1">
              {summary.invoiced_orders}
            </Text>
            <Text className="text-[10px] text-green-600 font-medium">Invoiced</Text>
          </View>
          <View className="flex-1 items-center py-3 bg-amber-50 rounded-xl">
            <Clock size={18} color="#F59E0B" />
            <Text className="text-lg font-bold text-amber-700 mt-1">
              {summary.pending_invoices}
            </Text>
            <Text className="text-[10px] text-amber-600 font-medium">Pending</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

// ─── Monthly Tab ──────────────────────────────────────────────────

function MonthlyTab({
  monthly,
  primaryColor,
  colors,
}: {
  monthly: GstMonthly
  primaryColor: string
  colors: any
}) {
  const maxGst = Math.max(...monthly.months.map((m) => m.gst), 1)

  return (
    <View className="px-4 pt-2">
      <Text className="text-xs font-semibold text-sand-500 uppercase mb-3">
        Monthly GST — {monthly.year}
      </Text>

      <View className="gap-2">
        {monthly.months.map((m) => (
          <View
            key={m.month}
            className="bg-white rounded-xl border border-sand-100 p-3"
          >
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="text-sm font-semibold text-sand-900">{m.month_name}</Text>
              <Text className="text-xs text-sand-400">
                {m.orders} {m.orders === 1 ? 'order' : 'orders'}
              </Text>
            </View>
            {/* Bar */}
            <View className="h-2 bg-sand-100 rounded-full mb-1.5 overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.max((m.gst / maxGst) * 100, 0)}%`,
                  backgroundColor: primaryColor,
                }}
              />
            </View>
            <View className="flex-row justify-between">
              <Text className="text-[10px] text-sand-400">
                Sales: {inr(m.sales)}
              </Text>
              <Text className="text-[10px] font-semibold" style={{ color: primaryColor }}>
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
  primaryColor,
  colors,
}: {
  transactions: GstTransactions
  page: number
  onPageChange: (p: number) => void
  primaryColor: string
  colors: any
}) {
  return (
    <View className="px-4 pt-2">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-xs font-semibold text-sand-500 uppercase">
          Transactions ({transactions.pagination.total})
        </Text>
        <Text className="text-[10px] text-sand-400">
          Page {transactions.pagination.page} of {transactions.pagination.pages}
        </Text>
      </View>

      {transactions.transactions.length === 0 ? (
        <View className="items-center py-10">
          <Text className="text-sm text-sand-400">No transactions found</Text>
        </View>
      ) : (
        <View className="gap-2">
          {transactions.transactions.map((tx) => (
            <TxRow key={tx.id} tx={tx} primaryColor={primaryColor} colors={colors} />
          ))}
        </View>
      )}

      {/* Pagination */}
      {transactions.pagination.pages > 1 && (
        <View className="flex-row items-center justify-center gap-3 mt-4">
          <AnimatedPressable
            onPress={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-lg px-4 py-2 border"
            style={{
              backgroundColor: page <= 1 ? colors.sand[50] : 'white',
              borderColor: colors.sand[200],
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            <Text className="text-xs font-semibold text-sand-600">← Prev</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => onPageChange(Math.min(transactions.pagination.pages, page + 1))}
            disabled={page >= transactions.pagination.pages}
            className="rounded-lg px-4 py-2"
            style={{ backgroundColor: primaryColor }}
          >
            <Text className="text-xs font-semibold text-white">Next →</Text>
          </AnimatedPressable>
        </View>
      )}
    </View>
  )
}

// ─── Transaction Row ──────────────────────────────────────────────

function TxRow({
  tx,
  primaryColor,
  colors,
}: {
  tx: GstTransaction
  primaryColor: string
  colors: any
}) {
  const date = new Date(tx.date)
  const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  return (
    <View className="bg-white rounded-xl border border-sand-100 p-3">
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-sm font-semibold text-sand-900" numberOfLines={1}>
          {tx.customer ?? 'Walk-in Customer'}
        </Text>
        <Text className="text-xs font-bold" style={{ color: primaryColor }}>
          {inr(tx.total)}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="text-[10px] text-sand-400">{dateStr}</Text>
        <Text className="text-[10px] text-sand-300">·</Text>
        <Text className="text-[10px] text-sand-400">GST: {inr(tx.gst)}</Text>
        <View className="flex-1" />
        {tx.has_invoice ? (
          <View className="flex-row items-center gap-0.5 bg-green-50 rounded-full px-2 py-0.5">
            <CheckCircle size={10} color="#22C55E" />
            <Text className="text-[10px] font-semibold text-green-600">
              {tx.invoice_number}
            </Text>
          </View>
        ) : (
          <View className="bg-amber-50 rounded-full px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-amber-600">No invoice</Text>
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
  primaryColor,
  colors,
  flex,
}: {
  label: string
  value: string
  icon: React.ReactNode
  primaryColor: string
  colors: any
  flex?: boolean
}) {
  return (
    <View
      className="bg-white rounded-2xl border border-sand-100 p-3.5"
      style={flex ? { flex: 1 } : undefined}
    >
      <View className="flex-row items-center gap-1.5 mb-1.5">
        {icon}
        <Text className="text-[10px] font-semibold text-sand-500 uppercase">{label}</Text>
      </View>
      <Text className="text-lg font-bold text-sand-900" numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

function BreakdownRow({
  label,
  value,
  colors,
}: {
  label: string
  value: string
  colors: any
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-xs text-sand-500">{label}</Text>
      <Text className="text-xs font-semibold text-sand-700">{value}</Text>
    </View>
  )
}
