import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, Linking, RefreshControl,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Package, Check, Clock, IndianRupee } from 'lucide-react-native'
import { catalogUploadApi, type CatalogUploadTicket } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'

// ─── Request Form (no ticket yet) ───────────────────────────────────

function RequestForm() {
  const [itemCount, setItemCount] = useState('')
  const [note, setNote] = useState('')
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: () =>
      catalogUploadApi.create({
        item_count_estimate: parseInt(itemCount, 10),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-upload-request'] })
    },
    onError: (err: Error) => showError(err, 'Failed to submit request'),
  })

  const canSubmit = parseInt(itemCount, 10) > 0

  return (
    <View className="pt-2">
      <View className="w-16 h-16 bg-cyan-100 rounded-2xl items-center justify-center mb-4">
        <Package size={28} color="#0891B2" />
      </View>
      <Text className="text-2xl font-bold text-gray-900">Get help adding your catalog</Text>
      <Text className="text-gray-500 text-base mt-2 leading-5">
        A Kanchuki team member visits your shop and uploads your entire catalog for you. Tell us
        roughly how many items you have — we&apos;ll quote a price and propose a visit time.
      </Text>

      <View className="mt-6">
        <Text className="text-sm font-semibold text-gray-600 mb-2">About how many items?</Text>
        <TextInput
          value={itemCount}
          onChangeText={(t) => setItemCount(t.replace(/[^0-9]/g, ''))}
          placeholder="e.g. 500"
          keyboardType="number-pad"
          className="border-2 border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900"
          placeholderTextColor="#9CA3AF"
          maxLength={6}
        />
      </View>

      <View className="mt-4">
        <Text className="text-sm font-semibold text-gray-600 mb-2">
          Note <Text className="text-gray-400 font-normal">(optional)</Text>
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Anything we should know?"
          multiline
          numberOfLines={3}
          className="border-2 border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900"
          placeholderTextColor="#9CA3AF"
          maxLength={2000}
        />
      </View>

      <TouchableOpacity
        onPress={() => create.mutate()}
        disabled={!canSubmit || create.isPending}
        className={`mt-6 py-4 rounded-2xl items-center ${canSubmit ? 'bg-cyan-600' : 'bg-gray-200'}`}
      >
        {create.isPending ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className={`font-bold text-base ${canSubmit ? 'text-white' : 'text-gray-400'}`}>
            Request Catalog Upload Help
          </Text>
        )}
      </TouchableOpacity>
    </View>
  )
}

// ─── Ticket Status View ─────────────────────────────────────────────

function TicketStatus({ ticket }: { ticket: CatalogUploadTicket }) {
  const queryClient = useQueryClient()

  const pay = useMutation({
    mutationFn: () => catalogUploadApi.pay(ticket.id),
    onSuccess: async (res) => {
      await Linking.openURL(res.data.checkout_url)
    },
    onError: (err: Error) => showError(err, 'Could not start payment'),
  })

  const confirmSlot = useMutation({
    mutationFn: (slot: string) => catalogUploadApi.confirmSlot(ticket.id, slot),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalog-upload-request'] })
    },
    onError: (err: Error) => showError(err, 'Could not confirm that slot'),
  })

  // Waiting for admin to quote a price
  if (ticket.quoted_price_inr == null) {
    return (
      <View className="items-center pt-8">
        <View className="w-16 h-16 bg-amber-100 rounded-2xl items-center justify-center mb-4">
          <Clock size={28} color="#D97706" />
        </View>
        <Text className="text-xl font-bold text-gray-900 text-center">Request received</Text>
        <Text className="text-gray-500 text-base mt-2 text-center leading-5">
          Our team is reviewing your request for {ticket.item_count_requested ?? 'your'} items. We&apos;ll
          notify you with a price and visit time soon. Pull down to refresh.
        </Text>
      </View>
    )
  }

  // Quoted, not yet paid
  if (!ticket.paid_at) {
    return (
      <View className="items-center pt-8">
        <View className="w-16 h-16 bg-cyan-100 rounded-2xl items-center justify-center mb-4">
          <IndianRupee size={28} color="#0891B2" />
        </View>
        <Text className="text-xl font-bold text-gray-900 text-center">Your quote is ready</Text>
        <Text className="text-3xl font-bold text-cyan-600 mt-3">₹{ticket.quoted_price_inr}</Text>
        <Text className="text-gray-500 text-sm mt-2 text-center leading-5">
          for {ticket.item_count_requested ?? 'your'} items. Pay now to pick your visit slot.
        </Text>
        <TouchableOpacity
          onPress={() => pay.mutate()}
          disabled={pay.isPending}
          className="mt-6 w-full bg-cyan-600 py-4 rounded-2xl items-center"
        >
          {pay.isPending ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-base">Pay ₹{ticket.quoted_price_inr}</Text>
          )}
        </TouchableOpacity>
        <Text className="text-gray-400 text-xs mt-3 text-center">
          Opens Razorpay checkout in your browser — return here after paying.
        </Text>
      </View>
    )
  }

  // Paid, slot not yet confirmed
  if (!ticket.confirmed_slot) {
    const slots = ticket.proposed_slots ?? []
    return (
      <View className="pt-4">
        <View className="items-center mb-4">
          <View className="w-16 h-16 bg-green-100 rounded-2xl items-center justify-center mb-4">
            <Check size={28} color="#059669" />
          </View>
          <Text className="text-xl font-bold text-gray-900 text-center">Payment received</Text>
        </View>

        {slots.length === 0 ? (
          <Text className="text-gray-500 text-base text-center leading-5">
            Waiting for our team to propose visit times. Pull down to refresh.
          </Text>
        ) : (
          <>
            <Text className="text-gray-500 text-base text-center leading-5 mb-4">
              Pick a visit time:
            </Text>
            {slots.map((slot) => (
              <TouchableOpacity
                key={slot}
                onPress={() => confirmSlot.mutate(slot)}
                disabled={confirmSlot.isPending}
                className="flex-row items-center justify-between border-2 border-gray-200 rounded-2xl p-4 mb-3"
                activeOpacity={0.7}
              >
                <Text className="text-gray-900 font-semibold">
                  {new Date(slot).toLocaleString('en-IN', {
                    weekday: 'short', day: 'numeric', month: 'short',
                    hour: 'numeric', minute: '2-digit',
                  })}
                </Text>
                {confirmSlot.isPending && <ActivityIndicator size="small" color="#0891B2" />}
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>
    )
  }

  // Fully confirmed
  return (
    <View className="items-center pt-8">
      <View className="w-16 h-16 bg-green-100 rounded-2xl items-center justify-center mb-4">
        <Check size={28} color="#059669" />
      </View>
      <Text className="text-xl font-bold text-gray-900 text-center">Visit confirmed</Text>
      <Text className="text-gray-500 text-base mt-2 text-center leading-5">
        {new Date(ticket.confirmed_slot).toLocaleString('en-IN', {
          weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit',
        })}
      </Text>
      <Text className="text-gray-400 text-xs mt-3 text-center">
        A Kanchuki team member will visit your shop at this time to upload your catalog.
      </Text>
    </View>
  )
}

// ─── Main Screen ────────────────────────────────────────────────────

export default function CatalogUploadScreen() {
  const insets = useSafeAreaInsets()

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['catalog-upload-request'],
    queryFn: () => catalogUploadApi.list(),
  })

  const tickets = data?.data ?? []
  // Most recent non-closed request, or just the most recent overall
  const activeTicket =
    tickets.find((t) => t.status !== 'CLOSED' && t.status !== 'RESOLVED') ?? tickets[0]

  return (
    <View className="flex-1 bg-white">
      <View
        className="bg-white border-b border-gray-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <ChevronLeft size={24} color="#374151" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-gray-900">Catalog Upload Help</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color="#0891B2" className="mt-12" />
      ) : (
        <ScrollView
          className="flex-1 px-6"
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          {activeTicket ? <TicketStatus ticket={activeTicket} /> : <RequestForm />}
        </ScrollView>
      )}
    </View>
  )
}
