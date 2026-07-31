import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Store, MapPin, Package, ArrowRight } from 'lucide-react-native'
import { teamApi, type SupportTicket, type TeamMemberInfo } from '../../src/lib/team-api'
import { enterCatalogSession } from '../../src/lib/catalog-delegate'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

// F-020: only tickets ready for an on-site upload — assigned to me, paid,
// and a visit slot confirmed. General support tickets aren't shown here;
// this screen is scoped to the catalog-upload delegated-access flow only.
function readyForSession(ticket: SupportTicket, myId: string): boolean {
  return (
    ticket.assigned_to_id === myId &&
    ticket.status === 'ASSIGNED' &&
    ticket.paid_at != null &&
    ticket.confirmed_slot != null
  )
}

export default function CatalogTicketsScreen() {
  const { primaryColor } = useTheme()
  const insets = useSafeAreaInsets()
  const [starting, setStarting] = useState<string | null>(null)

  const { data: meData } = useQuery({ queryKey: ['staff', 'me'], queryFn: () => teamApi.getMe() })
  const me = (meData as { data: TeamMemberInfo } | undefined)?.data

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['staff', 'catalog-tickets'],
    queryFn: () => teamApi.getTickets({ ticket_type: 'CATALOG_UPLOAD' }),
  })

  useFocusEffect(
    useCallback(() => {
      void refetch()
    }, [refetch]),
  )

  const tickets = ((data as { data: SupportTicket[] } | undefined)?.data ?? []).filter((t) =>
    me ? readyForSession(t, me.id) : false,
  )

  const handleStart = async (ticket: SupportTicket) => {
    setStarting(ticket.id)
    try {
      const res = await teamApi.startCatalogSession(ticket.id)
      await enterCatalogSession({
        token: res.data.token,
        shop_name: ticket.retailer.shop_name,
        ticket_id: ticket.id,
      })
      if (ticket.item_count_requested != null && ticket.item_count_requested >= 100) {
        router.push(`/product/bulk-onboard?target=${ticket.item_count_requested}`)
      } else {
        router.push('/product/add')
      }
    } catch (err) {
      showError(err as Error, 'Could not start the upload session')
    } finally {
      setStarting(null)
    }
  }

  return (
    <View className="flex-1 bg-white">
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
            <ChevronLeft size={24} color="#4B4039" />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900">Catalog Upload Jobs</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={primaryColor} className="mt-12" />
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          {tickets.length === 0 ? (
            <View className="items-center py-16">
              <Package size={40} color="#CDC6BF" />
              <Text className="text-sand-400 text-sm mt-4 text-center px-8">
                No confirmed catalog upload visits assigned to you right now.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {tickets.map((t) => (
                <View key={t.id} className="bg-white rounded-2xl p-4 border border-sand-100">
                  <View className="flex-row items-center gap-2 mb-2">
                    <Store size={16} color={primaryColor} />
                    <Text className="text-sm font-bold text-sand-900 flex-1">
                      {t.retailer.shop_name}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1 mb-1">
                    <MapPin size={12} color="#ABA39C" />
                    <Text className="text-xs text-sand-400">{t.retailer.city}</Text>
                  </View>
                  <Text className="text-xs text-sand-500 mb-3">
                    ~{t.item_count_requested ?? '?'} items · visit{' '}
                    {t.confirmed_slot &&
                      new Date(t.confirmed_slot).toLocaleString('en-IN', {
                        weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
                      })}
                  </Text>
                  <AnimatedPressable
                    onPress={() => void handleStart(t)}
                    disabled={starting === t.id}
                    className="flex-row items-center justify-center gap-2 bg-ink-600 py-3 rounded-xl"
                  >
                    {starting === t.id ? (
                      <ActivityIndicator color="white" size="small" />
                    ) : (
                      <>
                        <Text className="text-white text-sm font-bold">Start Upload Session</Text>
                        <ArrowRight size={16} color="white" />
                      </>
                    )}
                  </AnimatedPressable>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}
