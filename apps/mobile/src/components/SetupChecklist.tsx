import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { X } from 'lucide-react-native'
import { Alert, Text, View } from 'react-native'
import { type SetupChecklistItem, retailerApi } from '../lib/api'
import { useAuth } from '../lib/auth-context'
import { showError } from '../lib/errors'
import { staffCan } from '../lib/staff-can'
import { META_SOCIAL_ENABLED } from '../lib/meta-social';
import { AnimatedPressable } from './AnimatedPressable'

type Key = SetupChecklistItem['key']

// What each row says and where "Set it up myself" goes. Status itself comes from the
// server (derived from real data) — nothing about "done" is decided or stored here.
const COPY: Record<Key, { title: string; why: string; href: string }> = {
  google_place: {
    title: 'Link your Google listing',
    why: 'Get a review link to send happy customers',
    href: '/growth/ratings',
  },
  google_business: {
    title: 'Connect Google Business Profile',
    why: 'See and reply to your Google reviews here',
    href: '/growth/integrations/google-business',
  },
  facebook: {
    title: 'Connect your Facebook page',
    why: 'Post your new arrivals in one tap',
    href: '/growth/integrations/facebook',
  },
  instagram: {
    title: 'Connect your Instagram',
    why: 'Share products to your shop account',
    href: '/growth/integrations/instagram',
  },
  gst: {
    title: 'Add your GST details',
    why: 'Needed for GST invoices',
    href: '/settings',
  },
  store_location: {
    title: 'Pin your shop location',
    why: 'Nearby customers find you and get directions',
    href: '/settings',
  },
  whatsapp_api: {
    title: 'Set up WhatsApp Business API',
    why: 'Send collections to many customers at once',
    href: '/growth/integrations/whatsapp',
  },
}

const QUERY_KEY = ['retailer', 'setup-checklist']

// "Complete your profile" block for the owner's dashboard. Renders nothing while loading,
// on error, for staff roles (no request is even sent), and once nothing is left to do.
export function SetupChecklist() {
  const { staffRole } = useAuth()
  const allowed = staffCan(staffRole, 'setup')
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => retailerApi.getSetupChecklist(),
    enabled: allowed,
    retry: false,
  })

  const refresh = () => void queryClient.invalidateQueries({ queryKey: QUERY_KEY })

  const dismiss = useMutation({
    mutationFn: (key: Key) => retailerApi.dismissSetupItem(key),
    onSuccess: refresh,
    onError: (e) => showError(e, 'Could not hide this'),
  })
  const restore = useMutation({
    mutationFn: () => retailerApi.restoreSetupItems(),
    onSuccess: refresh,
    onError: (e) => showError(e, 'Could not show hidden items'),
  })
  const ask = useMutation({
    mutationFn: (key: Key) => retailerApi.askTeamToSetUp(key),
    onSuccess: refresh,
    onError: (e) => showError(e, 'Could not send your request'),
  })

  if (!allowed || !data) return null

  // Keys this build has no copy for (added by a newer API) are ignored, not rendered: an
  // old build must never crash on a checklist item it does not know.
  const items = data.data.items.filter(
    (i) => i.key in COPY && (META_SOCIAL_ENABLED || (i.key !== 'facebook' && i.key !== 'instagram')),
  )
  const open = items.filter((i) => i.status !== 'done' && !i.dismissed)
  const hidden = items.filter((i) => i.status !== 'done' && i.dismissed).length
  if (open.length === 0 && hidden === 0) return null

  const confirmAsk = (key: Key) =>
    Alert.alert(
      'Ask Kanchuki team',
      `Our team will call you to help with “${COPY[key].title}”. We never get access to your account without your approval.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Ask for help', onPress: () => ask.mutate(key) },
      ],
    )

  return (
    <View className="mx-5 mb-3 bg-white rounded-2xl border border-lavender-200 p-4 gap-3">
      {open.length > 0 && (
        <Text className="text-sm font-semibold text-spaceCadet-900">
          Complete your profile · {open.length} left
        </Text>
      )}

      {open.map((item) => (
        <View key={item.key} className="border border-lavender-200 rounded-2xl p-3">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-spaceCadet-900">{COPY[item.key].title}</Text>
              <Text className="text-[11px] text-heliotrope-500 mt-0.5 font-medium">
                {item.status === 'requested'
                  ? 'Requested — our team will call you'
                  : COPY[item.key].why}
              </Text>
            </View>
            <AnimatedPressable
              onPress={() => dismiss.mutate(item.key)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Hide ${COPY[item.key].title}`}
              className="w-9 h-9 items-center justify-center"
            >
              <X size={16} color="#928EB2" />
            </AnimatedPressable>
          </View>

          {/* ponytail: 36px visual + hitSlop 4 keeps the 44px touch target */}
          <View className="flex-row items-center gap-2 mt-2.5">
            <AnimatedPressable
              onPress={() => router.push(COPY[item.key].href as never)}
              accessibilityRole="button"
              accessibilityLabel={`Set up ${COPY[item.key].title} myself`}
              hitSlop={{ top: 4, bottom: 4 }}
              className="bg-spaceCadet-900 px-3 py-1.5 rounded-lg min-h-[36px] justify-center"
            >
              <Text className="text-white text-xs font-semibold">Set it up myself</Text>
            </AnimatedPressable>
            {item.can_ask && (
              <AnimatedPressable
                onPress={() => confirmAsk(item.key)}
                disabled={ask.isPending}
                accessibilityRole="button"
                accessibilityLabel={`Ask Kanchuki team to help with ${COPY[item.key].title}`}
                hitSlop={{ top: 4, bottom: 4 }}
                className="border border-fuchsia-600 px-3 py-1.5 rounded-lg min-h-[36px] justify-center"
              >
                <Text className="text-fuchsia-600 text-xs font-semibold">Ask Kanchuki team</Text>
              </AnimatedPressable>
            )}
          </View>
        </View>
      ))}

      {hidden > 0 && (
        <AnimatedPressable
          onPress={() => restore.mutate()}
          accessibilityRole="button"
          accessibilityLabel="Show hidden profile items"
          className="self-start py-1.5 justify-center border border-lavender-200 rounded-lg px-3 min-h-[44px] items-center"
        >
          <Text className="text-xs font-semibold text-heliotrope-600">Show {hidden} hidden</Text>
        </AnimatedPressable>
      )}
    </View>
  )
}
