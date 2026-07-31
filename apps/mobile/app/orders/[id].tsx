import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { router, useLocalSearchParams, Stack } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DetailScreenSkeleton } from '../../src/components/Skeleton'
import {
  ChevronLeft,
  PackageCheck,
  CreditCard,
  XCircle,
  Clock,
  Phone,
  User,
  FileText,
  MapPin,
  Hash,
  CalendarDays,
  ShoppingBag,
  Receipt,
} from 'lucide-react-native'
import { ordersApi, type OrderDetail, type ShippingAddress } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN')}`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TimelineStep({
  icon,
  label,
  timestamp,
  isLast,
  isActive,
}: {
  icon: React.ReactNode
  label: string
  timestamp: string | null
  isLast: boolean
  isActive: boolean
}) {
  return (
    <View className="flex-row">
      {/* Timeline connector */}
      <View className="items-center w-8">
        <View
          className={`w-7 h-7 rounded-full items-center justify-center ${
            isActive ? 'bg-ink-600' : 'bg-sand-100'
          }`}
        >
          {icon}
        </View>
        {!isLast && <View className="w-0.5 flex-1 bg-sand-200" />}
      </View>
      {/* Content */}
      <View className={`flex-1 ml-3 ${isLast ? '' : 'pb-6'}`}>
        <Text className={`text-sm font-semibold ${isActive ? 'text-sand-900' : 'text-sand-400'}`}>
          {label}
        </Text>
        {timestamp && (
          <Text className={`text-xs mt-0.5 ${isActive ? 'text-sand-500' : 'text-sand-300'}`}>
            {formatDateTime(timestamp)}
          </Text>
        )}
      </View>
    </View>
  )
}

export default function OrderDetailScreen() {
  const { primaryColor } = useTheme()
  // ponytail: STATUS_CONFIG moved inside the component (was module-scope)
  // so FULFILLED can use the reactive admin brand color via useTheme().
  const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    PENDING_PAYMENT: {
      label: 'Pending Payment',
      color: '#7D5334',
      bg: '#F8F0E8',
      icon: <Clock size={16} color="#7D5334" />,
    },
    PAID: {
      label: 'Paid',
      color: '#7D5334',
      bg: '#F8F0E8',
      icon: <CreditCard size={16} color="#7D5334" />,
    },
    FULFILLED: {
      label: 'Fulfilled',
      color: primaryColor,
      bg: '#FFF1F1',
      icon: <PackageCheck size={16} color={primaryColor} />,
    },
    CANCELLED: {
      label: 'Cancelled',
      color: '#A24854',
      bg: '#FDF2F3',
      icon: <XCircle size={16} color="#A24854" />,
    },
  }

  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id),
  })

  const order = data?.data

  const updateStatus = useMutation({
    mutationFn: ({ status }: { status: 'FULFILLED' | 'CANCELLED' }) =>
      ordersApi.updateStatus(id, status),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['order', id] })
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      Alert.alert(
        res.data.status === 'FULFILLED' ? '✅ Order Fulfilled' : '🛑 Order Cancelled',
        res.data.status === 'FULFILLED'
          ? 'The order has been marked as delivered to the customer.'
          : 'The order has been cancelled. Products have been released back to inventory.',
      )
    },
    onError: (err: Error) => {
      showError(err, 'Could not update order status')
    },
  })

  const confirmFulfill = () => {
    if (!order) return
    Alert.alert(
      'Mark as Fulfilled?',
      `Confirm that order for ${order.customer_name ?? 'customer'} has been delivered.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Fulfilled', onPress: () => updateStatus.mutate({ status: 'FULFILLED' }) },
      ],
    )
  }

  const confirmCancel = () => {
    if (!order) return
    Alert.alert(
      'Cancel Order?',
      `Cancel order for ${order.customer_name ?? 'customer'}?${
        order.status === 'PENDING_PAYMENT'
          ? '\nProducts will be released back to inventory.'
          : ''
      }`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: () => updateStatus.mutate({ status: 'CANCELLED' }),
        },
      ],
    )
  }

  if (isLoading || !order) {
    return <DetailScreenSkeleton />
  }

  const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING_PAYMENT
  const address = order.shipping_address as ShippingAddress | undefined

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Order Details',
          headerShown: true,
          headerStyle: { backgroundColor: '#ffffff' },
          headerTintColor: '#14100D',
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          headerShadowVisible: false,
          headerLeft: () => (
            <AnimatedPressable onPress={() => router.back()} hitSlop={8} className="mr-2" accessibilityLabel="Go back" accessibilityRole="button">
              <ChevronLeft size={24} color="#4B4039" />
            </AnimatedPressable>
          ),
        }}
      />

      <ScrollView
        className="flex-1 bg-sand-50"
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => void refetch()} />}
      >
        {/* ─── Status Banner ─────────────────────────────────── */}
        <View className="px-4 pt-4 pb-2">
          <View
            className={`rounded-2xl p-4 border ${config.bg}`}
            style={{ borderColor: config.color + '30' }}
          >
            <View className="flex-row items-center gap-2 mb-1">
              {config.icon}
              <Text className="text-base font-bold" style={{ color: config.color }}>
                {config.label}
              </Text>
            </View>
            <Text className="text-xs text-sand-500 mt-1">
              Order placed {formatDateTime(order.created_at)}
            </Text>
          </View>
        </View>

        {/* ─── Customer Info ─────────────────────────────────── */}
        <View className="mx-4 mb-3 bg-white rounded-2xl border border-sand-100 overflow-hidden">
          <View className="px-4 py-3 border-b border-sand-50">
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
              Customer
            </Text>
          </View>
          <View className="px-4 py-3">
            <View className="flex-row items-center gap-2 mb-2">
              <User size={15} color="#847B75" />
              <Text className="text-sm font-semibold text-sand-900">
                {order.customer_name ?? 'Customer'}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Phone size={15} color="#847B75" />
              <Text className="text-sm text-sand-600">{order.customer_phone ?? '—'}</Text>
            </View>
          </View>
        </View>

        {/* ─── Shipping Address ──────────────────────────────── */}
        {address && (
          <View className="mx-4 mb-3 bg-white rounded-2xl border border-sand-100 overflow-hidden">
            <View className="px-4 py-3 border-b border-sand-50 flex-row items-center gap-2">
              <MapPin size={14} color="#847B75" />
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
                Shipping Address
              </Text>
            </View>
            <View className="px-4 py-3">
              <Text className="text-sm text-sand-900 font-medium">{address.line1}</Text>
              {address.line2 && (
                <Text className="text-sm text-sand-600 mt-0.5">{address.line2}</Text>
              )}
              <Text className="text-sm text-sand-600 mt-0.5">
                {address.city}, {address.state} — {address.pincode}
              </Text>
            </View>
          </View>
        )}

        {/* ─── Items Breakdown ───────────────────────────────── */}
        <View className="mx-4 mb-3 bg-white rounded-2xl border border-sand-100 overflow-hidden">
          <View className="px-4 py-3 border-b border-sand-50 flex-row items-center gap-2">
            <ShoppingBag size={14} color="#847B75" />
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
              Items ({order.items.length})
            </Text>
          </View>

          {order.items.map((item) => (
            <View
              key={item.id}
              className="px-4 py-3 border-b border-sand-50 flex-row items-center justify-between"
            >
              <View className="flex-1 mr-3">
                <Text className="text-sm font-medium text-sand-900" numberOfLines={1}>
                  {item.product_name_snapshot ?? `Product #${item.product_id.slice(0, 8)}`}
                </Text>
                {item.quantity > 1 && (
                  <Text className="text-xs text-sand-400 mt-0.5">Qty: {item.quantity}</Text>
                )}
              </View>
              <Text className="text-sm font-semibold text-sand-900">
                {formatInr(item.price_snapshot)}
              </Text>
            </View>
          ))}
        </View>

        {/* ─── Amount Summary ────────────────────────────────── */}
        <View className="mx-4 mb-3 bg-white rounded-2xl border border-sand-100 overflow-hidden">
          <View className="px-4 py-3 border-b border-sand-50 flex-row items-center gap-2">
            <Receipt size={14} color="#847B75" />
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
              Payment Summary
            </Text>
          </View>

          <View className="px-4 py-3 gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-sand-600">Subtotal</Text>
              <Text className="text-sm text-sand-900">{formatInr(order.subtotal_amount)}</Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-sand-600">GST</Text>
              <Text className="text-sm text-sand-900">{formatInr(order.gst_amount)}</Text>
            </View>
            <View className="h-px bg-sand-100 my-1" />
            <View className="flex-row items-center justify-between">
              <Text className="text-base font-bold text-sand-900">Total</Text>
              <Text className="text-base font-bold text-ink-600">
                {formatInr(order.total_amount)}
              </Text>
            </View>
          </View>
        </View>

        {/* ─── GST Invoice ───────────────────────────────────── */}
        {order.gst_invoice_number && (
          <View className="mx-4 mb-3 bg-white rounded-2xl border border-sand-100 overflow-hidden">
            <View className="px-4 py-3 border-b border-sand-50 flex-row items-center gap-2">
              <FileText size={14} color="#847B75" />
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
                GST Invoice
              </Text>
            </View>
            <View className="px-4 py-3">
              <View className="flex-row items-center gap-2 mb-1">
                <Hash size={13} color="#ABA39C" />
                <Text className="text-sm font-mono text-sand-900">
                  {order.gst_invoice_number}
                </Text>
              </View>
              <Text className="text-xs text-sand-400 mt-1">
                Auto-generated for this order. Share with customer for their records.
              </Text>
            </View>
          </View>
        )}

        {/* ─── Payment Timeline ──────────────────────────────── */}
        <View className="mx-4 mb-3 bg-white rounded-2xl border border-sand-100 overflow-hidden">
          <View className="px-4 py-3 border-b border-sand-50 flex-row items-center gap-2">
            <CalendarDays size={14} color="#847B75" />
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
              Timeline
            </Text>
          </View>
          <View className="px-4 py-4">
            <TimelineStep
              icon={<ShoppingBag size={12} color="white" />}
              label="Order Created"
              timestamp={order.created_at}
              isLast={order.status === 'PENDING_PAYMENT' && !order.paid_at}
              isActive={true}
            />
            {(order.status === 'PAID' || order.status === 'FULFILLED') && (
              <TimelineStep
                icon={<CreditCard size={12} color="white" />}
                label="Payment Received"
                timestamp={order.paid_at}
                isLast={order.status === 'PAID'}
                isActive={true}
              />
            )}
            {order.status === 'FULFILLED' && (
              <TimelineStep
                icon={<PackageCheck size={12} color="white" />}
                label="Order Fulfilled"
                timestamp={order.updated_at}
                isLast={true}
                isActive={true}
              />
            )}
            {order.status === 'CANCELLED' && (
              <TimelineStep
                icon={<XCircle size={12} color="white" />}
                label="Order Cancelled"
                timestamp={order.cancelled_at ?? order.updated_at}
                isLast={true}
                isActive={true}
              />
            )}
          </View>
        </View>

        {/* ─── Payment Info ──────────────────────────────────── */}
        {(order.razorpay_order_id || order.razorpay_payment_id) && (
          <View className="mx-4 mb-3 bg-white rounded-2xl border border-sand-100 overflow-hidden">
            <View className="px-4 py-3 border-b border-sand-50 flex-row items-center gap-2">
              <Hash size={14} color="#847B75" />
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
                Payment Details
              </Text>
            </View>
            <View className="px-4 py-3 gap-2">
              {order.razorpay_order_id && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-sand-500">Razorpay Order ID</Text>
                  <Text className="text-xs font-mono text-sand-700" numberOfLines={1}>
                    {order.razorpay_order_id}
                  </Text>
                </View>
              )}
              {order.razorpay_payment_id && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-sand-500">Payment ID</Text>
                  <Text className="text-xs font-mono text-sand-700" numberOfLines={1}>
                    {order.razorpay_payment_id}
                  </Text>
                </View>
              )}
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-sand-500">Payment Mode</Text>
                <Text className="text-xs font-medium text-sand-700">
                  {order.payment_mode === 'DIRECT' ? 'Direct (Razorpay)' : order.payment_mode}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ─── Action Buttons ────────────────────────────────── */}
        <View className="px-4 pb-6 gap-2">
          {order.status === 'PAID' && (
            <AnimatedPressable
              onPress={confirmFulfill}
              disabled={updateStatus.isPending}
              className="py-3.5 rounded-2xl bg-ink-600 items-center flex-row justify-center gap-2"
            >
              {updateStatus.isPending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <PackageCheck size={18} color="white" />
              )}
              <Text className="text-white font-semibold text-base">Mark as Fulfilled</Text>
            </AnimatedPressable>
          )}

          {(order.status === 'PENDING_PAYMENT' || order.status === 'PAID') && (
            <AnimatedPressable
              onPress={confirmCancel}
              disabled={updateStatus.isPending}
              className="py-3.5 rounded-2xl border border-rust-200 bg-rust-50 items-center flex-row justify-center gap-2"
            >
              <XCircle size={18} color="#A24854" />
              <Text className="text-rust-600 font-semibold text-base">
                {order.status === 'PAID' ? 'Cancel & Refund' : 'Cancel Order'}
              </Text>
            </AnimatedPressable>
          )}

          <AnimatedPressable
            onPress={() => router.back()}
            className="py-3.5 rounded-2xl border border-sand-200 bg-white items-center"
          >
            <Text className="text-sand-600 font-medium">Back to Orders</Text>
          </AnimatedPressable>
        </View>
      </ScrollView>
    </>
  )
}
