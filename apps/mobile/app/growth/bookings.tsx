import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { CalendarClock, Check, ChevronLeft, DoorOpen, Plus, X } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { growthApi, type Booking, type BookingStatus } from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

const STATUS_FILTERS: { key: BookingStatus | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'REQUESTED', label: 'Requested' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

function statusBadge(status: BookingStatus, colors: ReturnType<typeof useTheme>['colors']) {
  const map: Record<BookingStatus, { label: string; color: string; bg: string }> = {
    REQUESTED: { label: 'Requested', color: colors.turmeric[600], bg: colors.turmeric[100] },
    CONFIRMED: { label: 'Confirmed', color: colors.turmeric[700], bg: colors.turmeric[100] },
    COMPLETED: { label: 'Completed', color: colors.sand[500], bg: colors.sand[100] },
    CANCELLED: { label: 'Cancelled', color: colors.rust[600], bg: colors.rust[50] },
  }
  return map[status]
}

function fmtSlot(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function BookingsScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<BookingStatus | 'ALL'>('ALL')

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'bookings', filter],
    queryFn: () => growthApi.bookings(filter === 'ALL' ? undefined : { status: filter }),
  })
  const bookings = data?.data ?? []

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) =>
      growthApi.updateBooking(id, { status }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['growth', 'bookings'] }),
    onError: (err) => showError(err, 'Failed to update booking'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => growthApi.deleteBooking(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['growth', 'bookings'] }),
    onError: (err) => showError(err, 'Failed to delete booking'),
  })

  const confirmCancel = (b: Booking) => {
    Alert.alert('Cancel booking?', `${b.name}'s slot will be freed up.`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel Booking', style: 'destructive', onPress: () => setStatus.mutate({ id: b.id, status: 'CANCELLED' }) },
    ])
  }

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <AnimatedPressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <ChevronLeft size={24} color={colors.sand[700]} />
            </AnimatedPressable>
            <Text className="text-base font-bold text-sand-900">Try-on Bookings</Text>
          </View>
          <AnimatedPressable
            onPress={() => router.push('/growth/booking-form')}
            accessibilityLabel="New booking"
            accessibilityRole="button"
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: `${primaryColor}1A` }}
          >
            <Plus size={20} color={primaryColor} />
          </AnimatedPressable>
        </View>
      </View>

      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-grow-0 bg-white border-b border-sand-100 px-4 py-2.5"
        contentContainerStyle={{ gap: 8 }}
      >
        {STATUS_FILTERS.map((t) => {
          const active = filter === t.key
          return (
            <AnimatedPressable
              key={t.key}
              onPress={() => setFilter(t.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`px-3.5 py-1.5 rounded-full border ${
                active ? 'border-ink-600' : 'border-sand-200 bg-white'
              }`}
              style={active ? { backgroundColor: primaryColor } : undefined}
            >
              <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-sand-600'}`}>
                {t.label}
              </Text>
            </AnimatedPressable>
          )
        })}
      </ScrollView>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : bookings.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <DoorOpen size={28} color={primaryColor} />
            </View>
            <Text className="text-base font-bold text-sand-900">No bookings</Text>
            <Text className="text-xs text-sand-500 text-center mt-1.5 leading-4 max-w-[260px]">
              Reserve the try-on room for a customer, or take a phone-in booking.
            </Text>
            <View className="w-48 mt-5">
              <GradientButton label="New Booking" onPress={() => router.push('/growth/booking-form')} />
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          <View className="gap-2.5">
            {bookings.map((b) => {
              const badge = statusBadge(b.status, colors)
              return (
                <View key={b.id} className="bg-white rounded-2xl p-4 border border-sand-100">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-1 mr-2">
                      <Text className="text-sm font-bold text-sand-900" numberOfLines={1}>
                        {b.name}
                      </Text>
                      {b.phone ? <Text className="text-xs text-sand-400">{b.phone}</Text> : null}
                    </View>
                    <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: badge.bg }}>
                      <Text className="text-[10px] font-semibold" style={{ color: badge.color }}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2 mb-3">
                    <CalendarClock size={13} color={colors.sand[400]} />
                    <Text className="text-xs text-sand-600">
                      {fmtSlot(b.starts_at)} → {new Date(b.ends_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  </View>
                  {b.note ? <Text className="text-[11px] text-sand-500 mb-3">{b.note}</Text> : null}
                  <View className="flex-row gap-2">
                    {b.status === 'REQUESTED' && (
                      <View className="flex-1">
                        <GradientButton label="Confirm" onPress={() => setStatus.mutate({ id: b.id, status: 'CONFIRMED' })} />
                      </View>
                    )}
                    {b.status === 'CONFIRMED' && (
                      <AnimatedPressable
                        onPress={() => setStatus.mutate({ id: b.id, status: 'COMPLETED' })}
                        accessibilityRole="button"
                        className="flex-1 flex-row items-center justify-center gap-1.5 bg-emerald-50 rounded-2xl py-3 border border-emerald-100"
                      >
                        <Check size={14} color="#059669" />
                        <Text className="text-emerald-700 text-xs font-semibold">Mark Completed</Text>
                      </AnimatedPressable>
                    )}
                    {(b.status === 'REQUESTED' || b.status === 'CONFIRMED') && (
                      <AnimatedPressable
                        onPress={() => confirmCancel(b)}
                        accessibilityRole="button"
                        className="flex-row items-center justify-center gap-1 px-4 rounded-2xl py-3 bg-rust-50 border border-rust-100"
                      >
                        <X size={14} color={colors.rust[500]} />
                        <Text className="text-rust-600 text-xs font-semibold">Cancel</Text>
                      </AnimatedPressable>
                    )}
                    {b.status === 'CANCELLED' && (
                      <AnimatedPressable
                        onPress={() =>
                          Alert.alert('Delete booking?', 'Remove this booking permanently.', [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(b.id) },
                          ])
                        }
                        accessibilityRole="button"
                        className="flex-1 items-center rounded-2xl py-3"
                      >
                        <Text className="text-rust-600 text-xs font-semibold">Delete</Text>
                      </AnimatedPressable>
                    )}
                  </View>
                </View>
              )
            })}
          </View>
        </ScrollView>
      )}
    </View>
  )
}
