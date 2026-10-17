// F-044 E3 â€” Enquiries inbox: every enquiry across collections, first-to-tap
// Take (D3), status, and reassign for owner + manager. Phone arrives masked for
// staff (server-side); replies happen in WhatsApp on the shared Business number (D1-A).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ChevronLeft, Shirt, Sparkles } from 'lucide-react-native'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Image, RefreshControl, Text, View } from 'react-native'
import { AnimatedPressable } from '../src/components/AnimatedPressable'
import { ApiError, collectionApi, retailerApi, type Enquiry, type EnquiryStatus } from '../src/lib/api'
import { useAuth } from '../src/lib/auth-context'
import { showError } from '../src/lib/errors'
import { useScreenInsets } from '../src/lib/safe-area'
import { staffCan } from '../src/lib/staff-can'

const STATUS_ACTIONS: { status: EnquiryStatus; label: string }[] = [
  { status: 'SEEN', label: 'Seen' },
  { status: 'REPLIED', label: 'Replied' },
  { status: 'CLOSED', label: 'Closed' },
]

export default function EnquiriesScreen() {
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets()
  const { staffRole } = useAuth()
  const canAssign = staffCan(staffRole, 'enquiries.assign')
  const queryClient = useQueryClient()
  // F-044 R2 — same fail-closed flag read as product/[id].tsx; the API re-checks.
  const { data: meData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
  })
  const features = (meData as { data?: { features?: string[] } } | undefined)?.data?.features
  const canTryOn =
    staffCan(staffRole, 'enquiries.tryon') &&
    Array.isArray(features) &&
    features.includes('VIRTUAL_TRY_ON_V2')
  const [reassigning, setReassigning] = useState<string | null>(null)
  // RC-015: a sync ref, not state â€” a double tap must send one request.
  const inFlight = useRef(false)

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['enquiries'],
    queryFn: () => collectionApi.enquiries(),
  })
  const enquiries = data?.data ?? []
  const assignees = data?.assignees ?? []

  const run = async (action: () => Promise<unknown>, fallback: string) => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      await action()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ENQUIRY_TAKEN') {
        Alert.alert('Already taken', err.message)
      } else {
        showError(err, fallback)
      }
    } finally {
      inFlight.current = false
      setReassigning(null)
      void queryClient.invalidateQueries({ queryKey: ['enquiries'] })
    }
  }

  const renderItem = ({ item: e }: { item: Enquiry }) => (
    <View className="bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm mb-3">
      <View className="flex-row justify-between items-center">
        <Text className="text-sm font-bold text-spaceCadet-900 flex-1" numberOfLines={1}>
          {e.customer_name ?? e.customer_phone ?? 'Customer'}
        </Text>
        <Text className="text-xs text-heliotrope-500">
          {new Date(e.created_at).toLocaleDateString('en-IN')}
        </Text>
      </View>
      <Text className="text-xs text-heliotrope-600 mt-0.5" numberOfLines={1}>
        {e.collection.title}
        {e.customer_name && e.customer_phone ? ` Â· ${e.customer_phone}` : ''}
      </Text>
      {e.message ? (
        <Text className="text-xs text-spaceCadet-900 mt-1.5 font-medium">{e.message}</Text>
      ) : null}

      {e.products.length > 0 && (
        <View className="flex-row flex-wrap gap-2 mt-3">
          {e.products.map((p) => (
            <AnimatedPressable
              key={p.id}
              onPress={() => router.push(`/product/${p.id}`)}
              className="w-16"
              accessibilityRole="button"
              accessibilityLabel={p.name ?? 'Product'}
            >
              {p.photo_url ? (
                <Image source={{ uri: p.photo_url }} className="w-16 h-16 rounded-2xl bg-lavender-100" />
              ) : (
                <View className="w-16 h-16 rounded-2xl bg-lavender-100 items-center justify-center">
                  <Shirt size={18} color="#928EB2" />
                </View>
              )}
              <Text className="text-[10px] text-spaceCadet-900 mt-1" numberOfLines={1}>
                {p.name ?? 'Product'}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      )}

      {canTryOn && e.products.length > 0 && (
        <AnimatedPressable
          // Ids + product names only — never the customer's phone or name.
          onPress={() =>
            router.push({
              pathname: '/enquiry-try-on',
              params: {
                productIds: e.products.map((p) => p.id).join(','),
                productNames: JSON.stringify(e.products.map((p) => p.name ?? 'Product')),
              },
            })
          }
          className="flex-row items-center justify-center gap-2 mt-3 py-2.5 rounded-full bg-spaceCadet-900"
          accessibilityRole="button"
          accessibilityLabel="Try on with customer"
        >
          <Sparkles size={14} color="#fff" />
          <Text className="text-xs font-bold text-white">Try on with customer</Text>
        </AnimatedPressable>
      )}

      <View className="flex-row items-center justify-between mt-3">
        {e.assigned_to ? (
          <Text className="text-xs font-semibold text-heliotrope-700 flex-1" numberOfLines={1}>
            Being handled by {e.assigned_to.name}
          </Text>
        ) : (
          <AnimatedPressable
            onPress={() => run(() => collectionApi.takeEnquiry(e.id), 'Could not take this enquiry')}
            className="px-4 py-2 rounded-full bg-spaceCadet-900"
            accessibilityRole="button"
            accessibilityLabel="Take this enquiry"
          >
            <Text className="text-xs font-bold text-white">Take</Text>
          </AnimatedPressable>
        )}
        {canAssign && assignees.length > 0 && (
          <AnimatedPressable
            onPress={() => setReassigning(reassigning === e.id ? null : e.id)}
            className="px-3 py-2"
            accessibilityRole="button"
            accessibilityLabel="Reassign"
          >
            <Text className="text-xs font-bold text-heliotrope-600">Reassign</Text>
          </AnimatedPressable>
        )}
      </View>

      {reassigning === e.id && (
        <View className="flex-row flex-wrap gap-2 mt-2">
          {assignees.map((a) => (
            <AnimatedPressable
              key={a.id}
              onPress={() =>
                run(() => collectionApi.assignEnquiry(e.id, a.id), 'Could not reassign this enquiry')
              }
              className="px-3 py-1.5 rounded-full border border-lavender-200 bg-lavender-100"
              accessibilityRole="button"
              accessibilityLabel={`Assign to ${a.name}`}
            >
              <Text className="text-xs text-spaceCadet-900">{a.name}</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}

      <View className="flex-row gap-2 mt-3">
        {STATUS_ACTIONS.map(({ status, label }) => {
          const active = e.status === status
          return (
            <AnimatedPressable
              key={status}
              disabled={active}
              onPress={() =>
                run(
                  () => collectionApi.setEnquiryStatus(e.collection.id, e.id, status),
                  'Could not update the status',
                )
              }
              className={`px-3 py-1.5 rounded-full border ${
                active ? 'bg-heliotrope-600 border-heliotrope-600' : 'bg-white border-lavender-200'
              }`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Mark ${label}`}
            >
              <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-spaceCadet-900'}`}>
                {label}
              </Text>
            </AnimatedPressable>
          )
        })}
        {e.status === 'NEW' && (
          <Text className="text-xs font-bold text-heliotrope-600 self-center ml-auto">New</Text>
        )}
      </View>
    </View>
  )

  return (
    <View className="flex-1 bg-[#F8F7FC]" style={{ paddingTop: headerPaddingTop }}>
      <View className="flex-row items-center justify-between px-5 mb-4">
        <AnimatedPressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
          accessibilityLabel="Back"
          accessibilityRole="button"
        >
          <ChevronLeft size={20} color="#231F48" />
        </AnimatedPressable>
        <Text className="text-lg font-bold text-spaceCadet-900 font-marcellus">Enquiries</Text>
        <View className="w-10" />
      </View>
      {isLoading ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <FlatList
          data={enquiries}
          keyExtractor={(e) => e.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: screenPaddingBottom }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <Text className="text-sm text-heliotrope-600 text-center mt-10">
              No enquiries yet. When a customer sends their picks, they show up here.
            </Text>
          }
        />
      )}
    </View>
  )
}
