import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { router } from 'expo-router'
import { Check, ChevronLeft, Copy } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'
import { GradientButton } from '../../../src/components/GradientButton'
import { googleBusinessApi } from '../../../src/lib/api'
import { showError } from '../../../src/lib/errors'
import { gbpCountLabel } from '../../../src/lib/gbp-summary'
import { useScreenInsets } from '../../../src/lib/safe-area'

// One screen, five honest states. Every state comes from the server (GET /status); this
// screen never decides "connected" on its own and has NO success path that skips the server
// answering LINKED (RC-056/058/060). UNAVAILABLE shows no action button at all.
export default function GoogleBusinessScreen() {
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets()
  const queryClient = useQueryClient()
  const [consent, setConsent] = useState(false)
  const [copied, setCopied] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['google-business', 'status'],
    queryFn: () => googleBusinessApi.status(),
  })
  const status = data?.data

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['google-business'] })

  const requestLink = useMutation({
    mutationFn: () => googleBusinessApi.requestLink(),
    onSuccess: refresh,
    onError: (e) => showError(e, 'Could not send your request'),
  })
  const unlink = useMutation({
    mutationFn: () => googleBusinessApi.unlink(),
    onSuccess: refresh,
    onError: (e) => showError(e, 'Could not disconnect'),
  })

  const copyEmail = async () => {
    if (!status?.manager_email) return
    await Clipboard.setStringAsync(status.manager_email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const confirmUnlink = () =>
    Alert.alert(
      'Disconnect Google reviews?',
      'Your Google reviews will stop showing here. Also remove Kanchuki as a Manager in your Google Business Profile settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: () => unlink.mutate() },
      ],
    )

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: headerPaddingTop }}
      >
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
          <View className="flex-1">
            <Text className="text-xl font-semibold text-spaceCadet-900">Google reviews</Text>
            <Text className="text-xs text-heliotrope-500 font-medium">
              Read and reply to your Google reviews here
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: screenPaddingBottom }}
      >
        {isLoading ? (
          <ActivityIndicator color="#6B4773" className="mt-10" />
        ) : isError || !status ? (
          <View className="bg-white rounded-2xl p-5 border border-lavender-200">
            <Text className="text-sm font-semibold text-spaceCadet-900">Could not load this</Text>
            <Text className="text-xs text-heliotrope-500 mt-1">
              Check your connection and try again.
            </Text>
            <AnimatedPressable
              onPress={() => void refetch()}
              accessibilityRole="button"
              className="mt-3 self-start py-2"
            >
              <Text className="text-xs font-semibold text-fuchsia-600">Try again</Text>
            </AnimatedPressable>
          </View>
        ) : status.state === 'UNAVAILABLE' ? (
          <View className="bg-white rounded-2xl p-5 border border-lavender-200">
            <Text className="text-sm font-semibold text-spaceCadet-900">Coming soon</Text>
            <Text className="text-xs text-heliotrope-500 mt-1 leading-5">
              Google reviews are not available for your shop yet. We will let you know when they
              are.
            </Text>
          </View>
        ) : status.state === 'LINKED' ? (
          <View className="bg-white rounded-2xl p-5 border border-lavender-200 gap-3">
            <Text className="text-sm font-semibold text-spaceCadet-900">
              Connected{status.location_title ? ` — ${status.location_title}` : ''}
            </Text>
            <Text className="text-xs text-heliotrope-500">
              {gbpCountLabel(status)}
            </Text>
            <GradientButton
              label="See your Google reviews"
              onPress={() => router.push('/growth/ratings' as never)}
            />
            <AnimatedPressable
              onPress={confirmUnlink}
              disabled={unlink.isPending}
              accessibilityRole="button"
              className="self-start py-2"
            >
              <Text className="text-xs font-semibold text-heliotrope-600">Disconnect</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <View className="bg-white rounded-2xl p-5 border border-lavender-200 gap-3">
            {status.state === 'NOT_REQUESTED' && (
              <>
                <Text className="text-sm font-semibold text-spaceCadet-900">
                  Bring your Google reviews into Kanchuki
                </Text>
                <Text className="text-xs text-heliotrope-500 leading-5">
                  The Kanchuki team can read your Google reviews and let you reply from here. We
                  never post reviews for you or your customers.
                </Text>
                <AnimatedPressable
                  onPress={() => setConsent((c) => !c)}
                  accessibilityRole="button"
                  accessibilityLabel="Agree to let the Kanchuki team read and reply to your Google reviews"
                  accessibilityState={{ selected: consent }}
                  className="flex-row items-center gap-3 py-2 min-h-[44px]"
                >
                  <View
                    className={`w-6 h-6 rounded-md border items-center justify-center ${
                      consent ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'border-lavender-300'
                    }`}
                  >
                    {consent && <Check size={14} color="#FFFFFF" />}
                  </View>
                  <Text className="flex-1 text-xs text-spaceCadet-900">
                    I agree to let the Kanchuki team read and reply to the reviews on my Google
                    Business Profile.
                  </Text>
                </AnimatedPressable>
                <GradientButton
                  label="Ask Kanchuki team to connect"
                  onPress={() => requestLink.mutate()}
                  disabled={!consent || requestLink.isPending}
                />
              </>
            )}

            {(status.state === 'REQUESTED' || status.state === 'NEEDS_ACCESS') && (
              <>
                <Text className="text-sm font-semibold text-spaceCadet-900">
                  {status.state === 'REQUESTED' ? 'One step for you' : 'Kanchuki no longer has access'}
                </Text>
                {status.steps?.map((s, i) => (
                  <Text key={s} className="text-xs text-heliotrope-600 leading-5">
                    {i + 1}. {s}
                  </Text>
                ))}
                {status.manager_email && (
                  <AnimatedPressable
                    onPress={() => void copyEmail()}
                    accessibilityRole="button"
                    accessibilityLabel="Copy the Kanchuki email"
                    className="flex-row items-center justify-between bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 min-h-[44px]"
                  >
                    <Text className="text-sm font-semibold text-spaceCadet-900 flex-1" selectable>
                      {status.manager_email}
                    </Text>
                    {copied ? (
                      <Check size={16} color="#6B4773" />
                    ) : (
                      <Copy size={16} color="#560A39" />
                    )}
                  </AnimatedPressable>
                )}
                <Text className="text-[11px] text-heliotrope-500">
                  {status.state === 'REQUESTED'
                    ? 'Our team has been told. Once you have added us, they link your profile and your reviews appear here.'
                    : 'Add us again as Manager and your reviews will start syncing again.'}
                </Text>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
