import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ChevronLeft, Megaphone, Plus } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { growthApi, type CampaignStatus, type CampaignType } from '../../src/lib/api'
import { useTheme } from '../../src/lib/theme'

const TYPE_LABEL: Record<CampaignType, string> = {
  FESTIVAL: 'Festival',
  REACTIVATION: 'Reactivation',
  PROMOTION: 'Promotion',
  AB_TEST: 'A/B Test',
}

const TYPE_FILTERS: { key: CampaignType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'FESTIVAL', label: 'Festival' },
  { key: 'REACTIVATION', label: 'Reactivation' },
  { key: 'PROMOTION', label: 'Promotion' },
  { key: 'AB_TEST', label: 'A/B Test' },
]

function statusInfo(status: CampaignStatus, colors: ReturnType<typeof useTheme>['colors']) {
  const map: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
    DRAFT: { label: 'Draft', color: colors.sand[600], bg: colors.sand[100] },
    SCHEDULED: { label: 'Scheduled', color: colors.turmeric[600], bg: colors.turmeric[100] },
    SENT: { label: 'Sent', color: colors.turmeric[600], bg: colors.turmeric[100] },
  }
  return map[status]
}

export default function CampaignsScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [filter, setFilter] = useState<CampaignType | 'ALL'>('ALL')

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'campaigns'],
    queryFn: () => growthApi.campaigns(),
  })

  const campaigns = (data?.data ?? []).filter(
    (c) => filter === 'ALL' || c.type === filter,
  )

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
            <Text className="text-base font-bold text-sand-900">Campaigns</Text>
          </View>
          <AnimatedPressable
            onPress={() => router.push('/growth/campaign-new')}
            accessibilityLabel="New campaign"
            accessibilityRole="button"
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: `${primaryColor}1A` }}
          >
            <Plus size={20} color={primaryColor} />
          </AnimatedPressable>
        </View>
      </View>

      {/* Type filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-grow-0 bg-white border-b border-sand-100 px-4 py-2.5"
        contentContainerStyle={{ gap: 8 }}
      >
        {TYPE_FILTERS.map((t) => {
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
              <Text
                className={`text-xs font-semibold ${active ? 'text-white' : 'text-sand-600'}`}
              >
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
      ) : campaigns.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <Megaphone size={28} color={primaryColor} />
            </View>
            <Text className="text-base font-bold text-sand-900">
              {filter === 'ALL' ? 'No campaigns yet' : `No ${TYPE_LABEL[filter].toLowerCase()} campaigns`}
            </Text>
            <Text className="text-xs text-sand-500 text-center mt-1.5 leading-4 max-w-[260px]">
              {filter === 'ALL'
                ? 'Create a festival greeting, reactivation offer, or new-arrivals blast.'
                : 'Try a different filter or create a new campaign.'}
            </Text>
            <View className="w-48 mt-5">
              <GradientButton
                label="Create Campaign"
                onPress={() => router.push('/growth/campaign-new')}
              />
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        >
          <View className="gap-2.5">
            {campaigns.map((c) => {
              const status = statusInfo(c.status, colors)
              return (
                <AnimatedPressable
                  key={c.id}
                  onPress={() => router.push(`/growth/campaign/${c.id}`)}
                  className="bg-white rounded-2xl p-4 border border-sand-100"
                >
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-sm font-bold text-sand-900 flex-1 mr-2" numberOfLines={1}>
                      {c.name}
                    </Text>
                    <View
                      className="rounded-full px-2.5 py-1"
                      style={{ backgroundColor: status.bg }}
                    >
                      <Text className="text-[10px] font-semibold" style={{ color: status.color }}>
                        {status.label}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs text-sand-500">
                      {TYPE_LABEL[c.type]}
                      {c.festival_name ? ` · ${c.festival_name}` : ''}
                    </Text>
                  </View>
                  {c.status === 'SENT' && (
                    <Text className="text-[11px] text-sand-400 mt-1.5">
                      {c.sent_count} sent · {c.opened_count} opened
                    </Text>
                  )}
                </AnimatedPressable>
              )
            })}
          </View>
        </ScrollView>
      )}
    </View>
  )
}
