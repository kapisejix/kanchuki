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

function statusInfo(status: CampaignStatus) {
  const map: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
    DRAFT: { label: 'Draft', color: '#928EB2', bg: '#F8F7FC' },
    SCHEDULED: { label: 'Scheduled', color: '#BB3F95', bg: '#BB3F951A' },
    SENT: { label: 'Sent', color: '#16a34a', bg: '#dcfce7' },
  }
  return map[status]
}

export default function CampaignsScreen() {
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
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              Campaign Broadcasts
            </Text>
          </View>
          <AnimatedPressable
            onPress={() => router.push('/growth/campaign-new')}
            accessibilityLabel="New campaign"
            accessibilityRole="button"
            className="w-10 h-10 rounded-2xl items-center justify-center bg-fuchsia-600 shadow-sm"
          >
            <Plus size={20} color="white" />
          </AnimatedPressable>
        </View>
      </View>

      {/* Type filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="flex-grow-0 bg-white border-b border-lavender-200 px-5 py-3"
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
              className={`px-4 py-1.5 rounded-full border ${
                active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'border-lavender-200 bg-lavender-50'
              }`}
            >
              <Text
                className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}
              >
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
      ) : campaigns.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4 bg-lavender-100 border border-lavender-200"
            >
              <Megaphone size={28} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              {filter === 'ALL' ? 'No campaigns yet' : `No ${TYPE_LABEL[filter].toLowerCase()} campaigns`}
            </Text>
            <Text className="text-xs text-heliotrope-500 text-center mt-1.5 leading-relaxed max-w-[260px] font-medium">
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
          <View className="gap-3.5">
            {campaigns.map((c) => {
              const status = statusInfo(c.status)
              return (
                <AnimatedPressable
                  key={c.id}
                  onPress={() => router.push(`/growth/campaign/${c.id}`)}
                  className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm"
                >
                  <View className="flex-row items-center justify-between mb-2">
                    <Text
                      style={{ fontFamily: 'Marcellus_400Regular' }}
                      className="text-base font-bold text-spaceCadet-900 flex-1 mr-2"
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                    <View
                      className="rounded-full px-2.5 py-0.5"
                      style={{ backgroundColor: status.bg }}
                    >
                      <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: status.color }}>
                        {status.label}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-xs text-heliotrope-500 font-medium">
                      {TYPE_LABEL[c.type]}
                      {c.festival_name ? ` · ${c.festival_name}` : ''}
                    </Text>
                  </View>
                  {c.status === 'SENT' && (
                    <Text className="text-xs font-semibold text-fuchsia-700 mt-2">
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
