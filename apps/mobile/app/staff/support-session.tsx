import { useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView, ActivityIndicator, Alert } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Store, ShieldCheck } from 'lucide-react-native'
import { useScreenInsets } from '../../src/lib/safe-area'
import { teamApi, type TerritoryRetailer } from '../../src/lib/team-api'
import { enterSupportSession, type SupportScope } from '../../src/lib/catalog-delegate'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

// Kanchuki manager → asks the retailer for in-app consent → on approval, enters
// a scoped, ≤24h session in the retailer's account. No OTP, no extension: a new
// session needs a new request (docs/tasks/pending/support-session-access.md).

const SCOPES: { key: SupportScope; label: string; blurb: string }[] = [
  { key: 'DEMO', label: 'Demo', blurb: 'Read-only walkthrough of their shop' },
  { key: 'GROWTH', label: 'Growth', blurb: 'Campaigns, promotions, social posts' },
  { key: 'MAINTENANCE', label: 'Maintenance', blurb: 'Catalog fixes and profile settings' },
]

const POLL_MS = 3000

type Waiting = { grantId: string; shop: string; scope: SupportScope; deadline: number }

export default function SupportSessionScreen() {
  const { primaryColor, colors } = useTheme()
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets()
  const [scope, setScope] = useState<SupportScope>('GROWTH')
  const [starting, setStarting] = useState<string | null>(null)
  const [waiting, setWaiting] = useState<Waiting | null>(null)
  const busy = useRef(false)

  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'retailers'],
    queryFn: () => teamApi.getRetailers(),
  })
  const retailers = (data as { data: TerritoryRetailer[] } | undefined)?.data ?? []

  useEffect(() => {
    if (!waiting) return
    const id = setInterval(async () => {
      if (busy.current) return
      busy.current = true
      try {
        const res = await teamApi.getSupportSession(waiting.grantId)
        const status = res.data.status
        if (status === 'APPROVED') {
          clearInterval(id)
          const t = await teamApi.getSupportSessionToken(waiting.grantId)
          await enterSupportSession({
            token: t.data.token,
            shop_name: waiting.shop,
            ticket_id: '',
            support: {
              grant_id: waiting.grantId,
              scope: waiting.scope,
              expires_at: t.data.expires_at,
            },
          })
          setWaiting(null)
          // Let the root layout's route guard open the retailer screens first.
          setTimeout(() => router.replace('/(tabs)'), 50)
        } else if (status !== 'PENDING') {
          clearInterval(id)
          setWaiting(null)
          Alert.alert('Not approved', `${waiting.shop} did not approve this session.`)
        } else if (Date.now() > waiting.deadline) {
          clearInterval(id)
          setWaiting(null)
          Alert.alert('No answer', `${waiting.shop} has not answered. Ask them to open Kanchuki.`)
        }
      } catch (err) {
        clearInterval(id)
        setWaiting(null)
        showError(err, 'Could not check the session')
      } finally {
        busy.current = false
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [waiting])

  const handleStart = async (r: TerritoryRetailer) => {
    setStarting(r.id)
    try {
      const res = await teamApi.startSupportSession({ retailer_id: r.id, scope })
      setWaiting({
        grantId: res.data.grant_id,
        shop: r.shop_name,
        scope,
        deadline: Date.now() + res.data.answer_within_seconds * 1000,
      })
    } catch (err) {
      showError(err, 'Could not request the session')
    } finally {
      setStarting(null)
    }
  }

  const handleCancel = async () => {
    if (!waiting) return
    const { grantId } = waiting
    setWaiting(null)
    try {
      await teamApi.endSupportSession(grantId)
    } catch (err) {
      showError(err, 'Could not cancel the request. It expires on its own.')
    }
  }

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
          <Text className="text-base font-bold text-sand-900">Support Session</Text>
        </View>
      </View>

      {waiting ? (
        <View className="flex-1 items-center justify-center px-8">
          <ActivityIndicator color={primaryColor} />
          <Text className="text-sand-900 text-base font-bold mt-4 text-center">
            Waiting for {waiting.shop}
          </Text>
          <Text className="text-sand-500 text-sm mt-2 text-center">
            They will see an Approve / Deny prompt the next time Kanchuki is open.
          </Text>
          <AnimatedPressable
            onPress={() => void handleCancel()}
            className="mt-6 bg-sand-100 px-5 py-3 rounded-xl"
          >
            <Text className="text-sand-700 text-sm font-bold">Cancel request</Text>
          </AnimatedPressable>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: screenPaddingBottom }}
        >
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
            What do you need to do?
          </Text>
          <View className="gap-2 mb-5">
            {SCOPES.map((s) => (
              <AnimatedPressable
                key={s.key}
                onPress={() => setScope(s.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: scope === s.key }}
                className={`rounded-2xl p-4 border ${
                  scope === s.key ? 'border-ink-600 bg-ink-50' : 'border-sand-100 bg-white'
                }`}
              >
                <View className="flex-row items-center gap-2">
                  <ShieldCheck size={16} color={primaryColor} />
                  <Text className="text-sm font-bold text-sand-900">{s.label}</Text>
                </View>
                <Text className="text-xs text-sand-500 mt-1">{s.blurb}</Text>
              </AnimatedPressable>
            ))}
          </View>

          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
            Retailer
          </Text>
          {isLoading ? (
            <ActivityIndicator color={primaryColor} className="mt-6" />
          ) : retailers.length === 0 ? (
            <Text className="text-sand-400 text-sm text-center py-10">
              No retailers in your territory.
            </Text>
          ) : (
            <View className="gap-2">
              {retailers.map((r) => (
                <AnimatedPressable
                  key={r.id}
                  onPress={() => void handleStart(r)}
                  disabled={starting !== null}
                  className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center gap-3"
                >
                  <Store size={18} color={primaryColor} />
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-sand-900">{r.shop_name}</Text>
                    <Text className="text-xs text-sand-400 mt-0.5">{r.city}</Text>
                  </View>
                  {starting === r.id ? (
                    <ActivityIndicator color={primaryColor} size="small" />
                  ) : (
                    <Text className="text-xs font-bold text-ink-600">Request</Text>
                  )}
                </AnimatedPressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}
