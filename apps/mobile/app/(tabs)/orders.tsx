import { useState } from 'react'
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
  FileText,
} from 'lucide-react-native'
import { ordersApi, type Order } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { OrdersListSkeleton } from '../../src/components/Skeleton'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

export default function OrdersScreen() {
  const STATUS_CONFIG: Record<
    string,
    { label: string; color: string; bg: string; icon: React.ReactNode }
  > = {
    PENDING_PAYMENT: {
      label: 'Pending Payment',
      color: '#d97706',
      bg: '#fef3c7',
      icon: <Clock size={13} color="#d97706" />,
    },
    PAID: {
      label: 'Paid',
      color: '#059669',
      bg: '#d1fae5',
      icon: <CreditCard size={13} color="#059669" />,
    },
    FULFILLED: {
      label: 'Fulfilled',
      color: '#BB3F95',
      bg: 'rgba(187, 63, 149, 0.1)',
      icon: <PackageCheck size={13} color="#BB3F95" />,
    },
    CANCELLED: {
      label: 'Cancelled',
      color: '#dc2626',
      bg: '#fee2e2',
      icon: <XCircle size={13} color="#dc2626" />,
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
      className="flex-1 bg-[#F8F7FC]"
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
        className="px-4 pt-3.5 pb-2"
      >
        <View className="flex-row gap-2">
          {[
            { key: null, label: `All (${allOrders.length})` },
            ...Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
              key,
              label: `${cfg.label} (${counts[key as keyof typeof counts]})`,
            })),
          ].map((chip) => (
            <AnimatedPressable
              key={chip.key ?? 'all'}
              onPress={() => setFilter(chip.key)}
              className={`px-4 py-2 rounded-full border ${
                filter === chip.key
                  ? 'border-spaceCadet-900 bg-spaceCadet-900 shadow-sm'
                  : 'border-lavender-200 bg-lavender-50'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  filter === chip.key ? 'text-white' : 'text-spaceCadet-900'
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
        <View className="flex-1 items-center justify-center px-8 pt-20">
          <View className="w-16 h-16 bg-lavender-100 rounded-3xl items-center justify-center mb-4 border border-lavender-200">
            <PackageCheck size={28} color="#BB3F95" />
          </View>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-spaceCadet-900 text-xl font-bold text-center"
          >
            No orders {filter ? `with status "${filter}"` : 'yet'}
          </Text>
          <Text className="text-heliotrope-500 text-xs mt-1.5 text-center leading-relaxed font-medium">
            Share a collection link on WhatsApp —{'\n'}customers can order directly from their phone.
          </Text>
        </View>
      ) : (
        <View className="px-4 pt-2 pb-8 gap-3.5">
          {orders.map((order) => {
            const config = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.PENDING_PAYMENT

            return (
              <AnimatedPressable
                key={order.id}
                onPress={() => router.push(`/orders/${order.id}`)}
                className="bg-white rounded-3xl border border-lavender-200 overflow-hidden shadow-sm"
              >
                {/* Header — status + date */}
                <View className="flex-row items-center justify-between px-4 pt-3.5 pb-2">
                  <View
                    className="flex-row items-center gap-1.5 px-3 py-1 rounded-full border border-lavender-200/50"
                    style={{ backgroundColor: config.bg }}
                  >
                    {config.icon}
                    <Text
                      className="text-xs font-bold"
                      style={{ color: config.color }}
                    >
                      {config.label}
                    </Text>
                  </View>
                  <Text className="text-xs font-medium text-heliotrope-400">
                    {new Date(order.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>

                {/* Customer info */}
                <View className="px-4 pb-2.5">
                  <View className="flex-row items-center gap-2 mb-1">
                    <User size={14} color="#BB3F95" />
                    <Text
                      style={{ fontFamily: 'Marcellus_400Regular' }}
                      className="text-base font-bold text-spaceCadet-900"
                    >
                      {order.customer_name ?? 'Customer'}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Phone size={13} color="#928EB2" />
                    <Text className="text-xs font-medium text-heliotrope-500">
                      {order.customer_phone ?? '—'}
                    </Text>
                  </View>
                </View>

                {/* Items summary */}
                <View className="px-4 pb-2.5 border-b border-lavender-100">
                  {order.items.slice(0, 3).map((item) => (
                    <View
                      key={item.id}
                      className="flex-row items-center justify-between py-1"
                    >
                      <Text className="text-xs font-medium text-spaceCadet-900 flex-1 mr-2" numberOfLines={1}>
                        {item.product_name_snapshot ?? `Product #${item.product_id.slice(0, 8)}`}
                      </Text>
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular' }}
                        className="text-xs font-bold text-spaceCadet-900"
                      >
                        ₹{(item.price_snapshot / 100).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  ))}
                  {order.items.length > 3 && (
                    <Text className="text-xs font-medium text-heliotrope-400 mt-1">
                      +{order.items.length - 3} more item{order.items.length - 3 > 1 ? 's' : ''}
                    </Text>
                  )}
                </View>

                {/* Amount + invoice */}
                <View className="px-4 py-2.5 border-b border-lavender-100">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider">Total</Text>
                    <Text
                      style={{ fontFamily: 'Marcellus_400Regular' }}
                      className="text-lg font-bold text-spaceCadet-900"
                    >
                      ₹{(order.total_amount / 100).toLocaleString('en-IN')}
                    </Text>
                  </View>
                  {order.gst_invoice_number && (
                    <View className="flex-row items-center gap-1 mt-1">
                      <FileText size={11} color="#928EB2" />
                      <Text className="text-xs font-medium text-heliotrope-400">
                        GST: {order.gst_invoice_number}
                      </Text>
                    </View>
                  )}
                </View>

                {/* View Details link */}
                <View className="py-2.5 bg-lavender-50/50">
                  <View className="flex-row items-center justify-center gap-1">
                    <Text className="text-xs font-bold text-fuchsia-700">View Order Details</Text>
                    <ChevronRight size={12} color="#BB3F95" />
                  </View>
                </View>

                {/* Action buttons */}
                <View className="flex-row px-3.5 py-3 gap-2 border-t border-lavender-100">
                  {order.status === 'PAID' && (
                    <AnimatedPressable
                      onPress={() => confirmFulfill(order)}
                      disabled={updateStatus.isPending}
                      className="flex-1 py-2.5 rounded-2xl bg-spaceCadet-900 items-center flex-row justify-center gap-1.5 shadow-sm"
                    >
                      <PackageCheck size={14} color="white" />
                      <Text className="text-white text-xs font-bold">
                        Mark Fulfilled
                      </Text>
                    </AnimatedPressable>
                  )}
                  {(order.status === 'PENDING_PAYMENT' || order.status === 'PAID') && (
                    <AnimatedPressable
                      onPress={() => confirmCancel(order)}
                      disabled={updateStatus.isPending}
                      className={`py-2.5 rounded-2xl items-center flex-row justify-center gap-1.5 ${
                        order.status === 'PAID'
                          ? 'flex-1 border border-rose-200 bg-rose-50'
                          : 'flex-1 border border-lavender-200 bg-lavender-50'
                      }`}
                    >
                      <XCircle
                        size={14}
                        color={order.status === 'PAID' ? '#dc2626' : '#928EB2'}
                      />
                      <Text
                        className={`text-xs font-bold ${
                          order.status === 'PAID' ? 'text-rose-600' : 'text-spaceCadet-900'
                        }`}
                      >
                        Cancel
                      </Text>
                    </AnimatedPressable>
                  )}
                  {order.status === 'FULFILLED' && (
                    <View className="flex-1 py-2.5 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 items-center">
                      <Text className="text-fuchsia-700 text-xs font-bold">
                        ✓ Delivered
                      </Text>
                    </View>
                  )}
                  {order.status === 'CANCELLED' && (
                    <View className="flex-1 py-2.5 rounded-2xl bg-rose-50 border border-rose-200 items-center">
                      <Text className="text-rose-600 text-xs font-bold">
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
