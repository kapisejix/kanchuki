import { useCallback } from 'react'
import { View, Text, ScrollView, ActivityIndicator, Alert, RefreshControl } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ShieldCheck } from 'lucide-react-native'
import { useScreenInsets } from '../../src/lib/safe-area'
import {
  SUPPORT_SCOPE_LABEL,
  supportSessionApi,
  type SupportSessionRow,
} from '../../src/lib/api/support-sessions'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

// Retailer view of Kanchuki support access: answer a pending request, or
// Revoke a live session at any time (docs/tasks/pending/support-session-access.md §6).

export default function SupportSessionsScreen() {
  const { primaryColor, colors } = useTheme()
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets()
  const qc = useQueryClient()

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['support-sessions'],
    queryFn: () => supportSessionApi.list(),
  })
  useFocusEffect(
    useCallback(() => {
      void refetch()
    }, [refetch]),
  )
  const rows = data?.data ?? []

  const act = async (fn: (id: string) => Promise<unknown>, id: string, failMsg: string) => {
    try {
      await fn(id)
      await qc.invalidateQueries({ queryKey: ['support-sessions'] })
    } catch (err) {
      showError(err, failMsg)
    }
  }

  const confirmRevoke = (r: SupportSessionRow) =>
    Alert.alert(
      'End support access?',
      `${r.staff_name} will be signed out of your account immediately.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'End access',
          style: 'destructive',
          onPress: () => void act(supportSessionApi.revoke, r.id, 'Could not end the session'),
        },
      ],
    )

  return (
    <View className="flex-1 bg-white">
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: headerPaddingTop }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900">Kanchuki support access</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={primaryColor} className="mt-12" />
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: screenPaddingBottom }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        >
          {rows.length === 0 ? (
            <View className="items-center py-16">
              <ShieldCheck size={40} color={colors.sand[300]} />
              <Text className="text-sand-400 text-sm mt-4 text-center px-8">
                No active support sessions. Kanchuki staff can only enter your account after you
                approve, for up to 24 hours.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {rows.map((r) => (
                <View key={r.id} className="bg-white rounded-2xl p-4 border border-sand-100">
                  <Text className="text-sm font-bold text-sand-900">{r.staff_name}</Text>
                  <Text className="text-xs text-sand-500 mt-1">
                    {r.status === 'PENDING' ? 'Wants to ' : 'Can '}
                    {SUPPORT_SCOPE_LABEL[r.scope]}
                    {r.expires_at
                      ? ` · until ${new Date(r.expires_at).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </Text>

                  {r.status === 'PENDING' ? (
                    <View className="flex-row gap-2 mt-3">
                      <AnimatedPressable
                        onPress={() =>
                          void act(supportSessionApi.deny, r.id, 'Could not send your answer')
                        }
                        className="flex-1 items-center bg-sand-100 py-3 rounded-xl"
                      >
                        <Text className="text-sand-700 text-sm font-bold">Deny</Text>
                      </AnimatedPressable>
                      <AnimatedPressable
                        onPress={() =>
                          void act(supportSessionApi.approve, r.id, 'Could not send your answer')
                        }
                        className="flex-1 items-center bg-ink-600 py-3 rounded-xl"
                      >
                        <Text className="text-white text-sm font-bold">Approve</Text>
                      </AnimatedPressable>
                    </View>
                  ) : (
                    <AnimatedPressable
                      onPress={() => confirmRevoke(r)}
                      className="mt-3 items-center bg-sand-100 py-3 rounded-xl"
                    >
                      <Text className="text-sand-700 text-sm font-bold">End access now</Text>
                    </AnimatedPressable>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}
