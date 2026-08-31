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

function statusBadge(status: BookingStatus) {
  const map: Record<BookingStatus, { label: string; color: string; bg: string; border: string }> = {
    REQUESTED: { label: 'Requested', color: '#BB3F95', bg: '#BB3F9515', border: '#BB3F9530' },
    CONFIRMED: { label: 'Confirmed', color: '#059669', bg: '#10B98115', border: '#10B98130' },
    COMPLETED: { label: 'Completed', color: '#231F48', bg: '#E0E1F6', border: '#D0D2F0' },
    CANCELLED: { label: 'Cancelled', color: '#DC2626', bg: '#FEE2E2', border: '#FECACA' },
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
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center justify-between">
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
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              Try-on Bookings
            </Text>
          </View>
          <AnimatedPressable
            onPress={() => router.push('/growth/booking-form')}
            accessibilityLabel="New booking"
            accessibilityRole="button"
            className="w-10 h-10 rounded-2xl items-center justify-center bg-fuchsia-600 shadow-sm"
          >
            <Plus size={20} color="white" />
          </AnimatedPressable>
        </View>
      </View>

      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-grow-0 bg-white border-b border-lavender-200 px-4 py-2.5"
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
              className={`px-4 py-1.5 rounded-full border ${
                active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'border-lavender-200 bg-lavender-50'
              }`}
            >
              <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}>
                {t.label}
              </Text>
            </AnimatedPressable>
          )
        })}
      </ScrollView>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#BB3F95" />
        </View>
      ) : bookings.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4 bg-lavender-100 border border-lavender-200"
            >
              <DoorOpen size={28} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              No Bookings
            </Text>
            <Text className="text-xs text-heliotrope-500 text-center mt-1.5 leading-relaxed max-w-[260px] font-medium">
              Reserve the VIP try-on room for a customer, or take a phone-in bridal slot.
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
          <View className="gap-3">
            {bookings.map((b) => {
              const badge = statusBadge(b.status)
              return (
                <View key={b.id} className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
                  <View className="flex-row items-center justify-between mb-2.5">
                    <View className="flex-1 mr-2">
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                        className="text-base font-bold text-spaceCadet-900"
                        numberOfLines={1}
                      >
                        {b.name}
                      </Text>
                      {b.phone ? <Text className="text-xs text-heliotrope-500 mt-0.5 font-medium">{b.phone}</Text> : null}
                    </View>
                    <View className="rounded-full px-3 py-1 border" style={{ backgroundColor: badge.bg, borderColor: badge.border }}>
                      <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: badge.color }}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2 mb-3">
                    <CalendarClock size={14} color="#928EB2" />
                    <Text className="text-xs text-spaceCadet-900 font-semibold">
                      {fmtSlot(b.starts_at)} → {new Date(b.ends_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                    </Text>
                  </View>
                  {b.note ? <Text className="text-xs text-heliotrope-500 mb-3 font-medium bg-lavender-50 p-2.5 rounded-xl border border-lavender-200">{b.note}</Text> : null}
                  <View className="flex-row gap-2">
                    {b.status === 'REQUESTED' && (
                      <View className="flex-1">
                        <GradientButton label="Confirm Slot" onPress={() => setStatus.mutate({ id: b.id, status: 'CONFIRMED' })} />
                      </View>
                    )}
                    {b.status === 'CONFIRMED' && (
                      <AnimatedPressable
                        onPress={() => setStatus.mutate({ id: b.id, status: 'COMPLETED' })}
                        accessibilityRole="button"
                        className="flex-1 flex-row items-center justify-center gap-1.5 bg-emerald-50 rounded-2xl py-3 border border-emerald-200"
                      >
                        <Check size={14} color="#059669" />
                        <Text className="text-emerald-700 text-xs font-bold uppercase tracking-wider">Mark Completed</Text>
                      </AnimatedPressable>
                    )}
                    {(b.status === 'REQUESTED' || b.status === 'CONFIRMED') && (
                      <AnimatedPressable
                        onPress={() => confirmCancel(b)}
                        accessibilityRole="button"
                        className="flex-row items-center justify-center gap-1 px-4 rounded-2xl py-3 bg-red-50 border border-red-200"
                      >
                        <X size={14} color="#dc2626" />
                        <Text className="text-red-700 text-xs font-bold uppercase tracking-wider">Cancel</Text>
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
                        className="flex-1 items-center rounded-2xl py-3 border border-red-200 bg-red-50"
                      >
                        <Text className="text-red-700 text-xs font-bold uppercase tracking-wider">Delete</Text>
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
