import { useState, useCallback } from 'react'
import { COLORS } from '@kanchuki/shared'
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  PackageCheck,
  CreditCard,
  XCircle,
  Clock,
  ChevronRight,
  Phone,
  User,
  IndianRupee,
  FileText,
} from 'lucide-react-native'
import { ordersApi, type Order } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { OrdersListSkeleton } from '../../src/components/Skeleton'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

export default function OrdersScreen() {
  const { primaryColor } = useTheme()
  // ponytail: STATUS_CONFIG moved inside the component (was module-scope)
  // so FULFILLED can use the reactive admin brand color via useTheme().
  const STATUS_CONFIG: Record<
    string,
    { label: string; color: string; bg: string; icon: React.ReactNode }
  > = {
    PENDING_PAYMENT: {
      label: 'Pending Payment',
      color: COLORS.turmeric[600],
      bg: COLORS.turmeric[50],
      icon: <Clock size={14} color={COLORS.turmeric[600]} />,
    },
    PAID: {
      label: 'Paid',
      color: COLORS.turmeric[600],
      bg: COLORS.turmeric[50],
      icon: <CreditCard size={14} color={COLORS.turmeric[600]} />,
    },
    FULFILLED: {
      label: 'Fulfilled',
      color: primaryColor,
      bg: '#FFF1F1',
      icon: <PackageCheck size={14} color={primaryColor} />,
    },
    CANCELLED: {
      label: 'Cancelled',
      color: COLORS.rust[600],
      bg: COLORS.rust[50],
      icon: <XCircle size={14} color={COLORS.rust[600]} />,
    },
  }

  const [filter, setFilter] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['orders'],
    queryFn: () => ordersApi.list(),
  })

  const updateStatus = useMutation({
    mutationFn: ({
      orderId,
      status,
    }: {
      orderId: string
      status: 'FULFILLED' | 'CANCELLED'
    }) => ordersApi.updateStatus(orderId, status),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      Alert.alert(
        data.data.status === 'FULFILLED'
          ? '✅ Order Fulfilled'
          : '🛑 Order Cancelled',
        data.data.status === 'FULFILLED'
          ? 'The order has been marked as delivered to the customer.'
          : 'The order has been cancelled. Products have been released back to inventory.',
      )
    },
    onError: (err: Error) => {
      showError(err, 'Could not update order status')
    },
  })

  const allOrders = data?.data ?? []
  const orders = filter
    ? allOrders.filter((o) => o.status === filter)
    : allOrders

  const counts = {
    PENDING_PAYMENT: allOrders.filter((o) => o.status === 'PENDING_PAYMENT').length,
    PAID: allOrders.filter((o) => o.status === 'PAID').length,
    FULFILLED: allOrders.filter((o) => o.status === 'FULFILLED').length,
    CANCELLED: allOrders.filter((o) => o.status === 'CANCELLED').length,
  }

  const confirmFulfill = (order: Order) => {
    Alert.alert(
      'Mark as Fulfilled?',
      `Confirm that order for ${order.customer_name ?? 'customer'} has been delivered.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Fulfilled',
          onPress: () =>
            updateStatus.mutate({ orderId: order.id, status: 'FULFILLED' }),
        },
      ],
    )
  }

  const confirmCancel = (order: Order) => {
    Alert.alert(
      'Cancel Order?',
      `Cancel order for ${order.customer_name ?? 'customer'}? ${
        order.status === 'PENDING_PAYMENT'
          ? 'Products will be released back to inventory.'
          : ''
      }`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Order',
          style: 'destructive',
          onPress: () =>
            updateStatus.mutate({ orderId: order.id, status: 'CANCELLED' }),
        },
      ],
    )
  }

  return (
    <ScrollView
      className="flex-1 bg-sand-50"
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={() => void refetch()}
        />
      }
    >
      {/* Status filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-4 pt-3 pb-2"
      >
        <View className="flex-row gap-2">
          {[
            { key: null, label: `All (${allOrders.length})`, color: COLORS.sand[600], bg: COLORS.sand[100] },
            ...Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
              key,
              label: `${cfg.label} (${counts[key as keyof typeof counts]})`,
              color: cfg.color,
              bg: cfg.bg,
            })),
          ].map((chip) => (
            <AnimatedPressable
              key={chip.key ?? 'all'}
              onPress={() => setFilter(chip.key)}
              className={`px-3 py-1.5 rounded-full border ${
                filter === chip.key
                  ? 'border-sand-800 bg-sand-800'
                  : 'border-sand-200 bg-white'
              }`}
            >
              <Text
                className={`text-xs font-medium ${
                  filter === chip.key ? 'text-white' : 'text-sand-600'
                }`}
              >
                {chip.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      </ScrollView>

      {/* Orders list */}
      {isLoading ? (
        <OrdersListSkeleton
          refreshing={isLoading}
          onRefresh={() => void refetch()}
        />
      ) : orders.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4 pt-20">
          <PackageCheck size={48} color={COLORS.sand[300]} />
          <Text className="text-sand-400 text-base mt-3 font-medium">
            No orders {filter ? `with status "${filter}"` : 'yet'}
          </Text>
          <Text className="text-sand-400 text-xs mt-1 text-center">
            Orders from your customers will appear here
          </Text>
        </View>
      ) : (
        <View className="px-4 pt-2 pb-8 gap-3">
          {orders.map((order) => {
            const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING_PAYMENT

            return (
              <AnimatedPressable
                key={order.id}
                onPress={() => router.push(`/orders/${order.id}`)}
                className="bg-white rounded-2xl border border-sand-100 overflow-hidden"
              >
                {/* Header — status + date */}
                <View className="flex-row items-center justify-between px-4 pt-3 pb-2">
                  <View
                    className="flex-row items-center gap-1.5 px-2 py-1 rounded-lg"
                    style={{ backgroundColor: config.bg }}
                  >
                    {config.icon}
                    <Text
                      className="text-xs font-semibold"
                      style={{ color: config.color }}
                    >
                      {config.label}
                    </Text>
                  </View>
                  <Text className="text-xs text-sand-400">
                    {new Date(order.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>

                {/* Customer info */}
                <View className="px-4 pb-2">
                  <View className="flex-row items-center gap-2 mb-1">
                    <User size={14} color={COLORS.sand[600]} />
                    <Text className="text-sm font-semibold text-sand-900">
                      {order.customer_name ?? 'Customer'}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Phone size={14} color={COLORS.sand[600]} />
                    <Text className="text-xs text-sand-500">
                      {order.customer_phone ?? '—'}
                    </Text>
                  </View>
                </View>

                {/* Items summary */}
                <View className="px-4 pb-2 border-b border-sand-50">
                  {order.items.slice(0, 3).map((item) => (
                    <View
                      key={item.id}
                      className="flex-row items-center justify-between py-1"
                    >
                      <Text className="text-xs text-sand-600 flex-1 mr-2" numberOfLines={1}>
                        {item.product_name_snapshot ?? `Product #${item.product_id.slice(0, 8)}`}
                      </Text>
                      <Text className="text-xs font-medium text-sand-700">
                        ₹{(item.price_snapshot / 100).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))}
                  {order.items.length > 3 && (
                    <Text className="text-xs text-sand-400 mt-1">
                      +{order.items.length - 3} more item{order.items.length - 3 > 1 ? 's' : ''}
                    </Text>
                  )}
                </View>

                {/* Amount + invoice */}
                <View className="px-4 py-2 border-b border-sand-50">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-sand-500">Total</Text>
                    <Text className="text-sm font-bold text-sand-900">
                      ₹{(order.total_amount / 100).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  {order.gst_invoice_number && (
                    <View className="flex-row items-center gap-1 mt-1">
                      <FileText size={11} color={COLORS.sand[400]} />
                      <Text className="text-xs text-sand-400">
                        GST: {order.gst_invoice_number}
                      </Text>
                    </View>
                  )}
                </View>

                {/* View Details link */}
                <View className="border-t border-sand-50 py-2">
                  <View className="flex-row items-center justify-center gap-1">
                    <Text className="text-xs font-medium text-ink-600">View Details</Text>
                    <ChevronRight size={12} color={primaryColor} />
                  </View>
                </View>

                {/* Action buttons */}
                <View className="flex-row px-3 py-2 gap-2">
                  {order.status === 'PAID' && (
                    <AnimatedPressable
                      onPress={() => confirmFulfill(order)}
                      disabled={updateStatus.isPending}
                      className="flex-1 py-2.5 rounded-xl bg-ink-600 items-center flex-row justify-center gap-1.5"
                    >
                      <PackageCheck size={14} color="white" />
                      <Text className="text-white text-xs font-semibold">
                        Mark Fulfilled
                      </Text>
                    </AnimatedPressable>
                  )}
                  {(order.status === 'PENDING_PAYMENT' || order.status === 'PAID') && (
                    <AnimatedPressable
                      onPress={() => confirmCancel(order)}
                      disabled={updateStatus.isPending}
                      className={`py-2.5 rounded-xl items-center flex-row justify-center gap-1.5 ${
                        order.status === 'PAID'
                          ? 'flex-1 border border-rust-200 bg-rust-50'
                          : 'flex-1 border border-sand-200 bg-sand-50'
                      }`}
                    >
                      <XCircle
                        size={14}
                        color={order.status === 'PAID' ? COLORS.rust[600] : COLORS.sand[600]}
                      />
                      <Text
                        className={`text-xs font-semibold ${
                          order.status === 'PAID' ? 'text-rust-600' : 'text-sand-600'
                        }`}
                      >
                        Cancel
                      </Text>
                    </AnimatedPressable>
                  )}
                  {order.status === 'FULFILLED' && (
                    <View className="flex-1 py-2.5 rounded-xl bg-turmeric-50 border border-turmeric-100 items-center">
                      <Text className="text-turmeric-700 text-xs font-semibold">
                        ✓ Delivered
                      </Text>
                    </View>
                  )}
                  {order.status === 'CANCELLED' && (
                    <View className="flex-1 py-2.5 rounded-xl bg-rust-50 border border-rust-100 items-center">
                      <Text className="text-rust-500 text-xs font-semibold">
                        Cancelled
                      </Text>
                    </View>
                  )}
                </View>
              </AnimatedPressable>
            )
          })}
        </View>
      )}

      <View className="h-8" />
    </ScrollView>
  )
}
