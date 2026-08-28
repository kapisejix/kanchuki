import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  BarChart3,
  Calendar,
  ChevronLeft,
  Clock,
  Film,
  Image as ImageIcon,
  Megaphone,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react-native'
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { growthApi, type GrowthAnalytics, type SeasonalAnalytics, type SeasonalPeriod } from '../../src/lib/api/growth'
import { useTheme } from '../../src/lib/theme'

// ─── Roadmap R — campaign & commerce analytics with India-retail
// dimensions: festival, customer segment, hour-of-day, product category,
// video-vs-photo performance, and per-A/B-variant results + significance.

type Stats = GrowthAnalytics

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
      <View className="flex-row items-center gap-2 mb-3.5">
        {icon}
        <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">{title}</Text>
      </View>
      {children}
    </View>
  )
}

function OpenRateRow({
  label,
  sent,
  opened,
  barColor,
}: {
  label: string
  sent: number
  opened: number
  barColor?: string
}) {
  const rate = sent > 0 ? opened / sent : 0
  return (
    <View className="mb-3">
      <View className="flex-row items-center justify-between mb-1.5">
        <Text className="text-xs font-bold text-spaceCadet-900 flex-1 mr-2" numberOfLines={1}>
          {label}
        </Text>
        <Text className="text-[11px] text-heliotrope-500 font-medium">
          {sent} sent · {Math.round(rate * 100)}% open
        </Text>
      </View>
      <View className="h-2 bg-lavender-100 rounded-full overflow-hidden border border-lavender-200">
        <View
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, Math.max(2, rate * 100))}%`,
            backgroundColor: barColor ?? '#BB3F95',
          }}
        />
      </View>
    </View>
  )
}

// ─── Roadmap R — Seasonal Section ──────────────────────────────

function SeasonalSection({ data, loading, period, onPeriodChange }: {
  data: SeasonalAnalytics | undefined
  loading: boolean
  period: SeasonalPeriod
  onPeriodChange: (p: SeasonalPeriod) => void
}) {
  return (
    <Section icon={<Calendar size={16} color="#BB3F95" />} title="Seasonal comparison">
      {/* Period toggle */}
      <View className="flex-row bg-lavender-100 rounded-2xl p-1 mb-4 border border-lavender-200">
        {([
          { key: 'wedding' as const, label: 'Wedding Season' },
          { key: 'daily' as const, label: 'Daily Wear' },
        ]).map((p) => {
          const active = period === p.key
          return (
            <AnimatedPressable
              key={p.key}
              onPress={() => onPeriodChange(p.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`flex-1 flex-row items-center justify-center rounded-xl py-2.5 ${
                active ? 'bg-spaceCadet-900 shadow-sm' : 'bg-transparent'
              }`}
            >
              <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}>
                {p.label}
              </Text>
            </AnimatedPressable>
          )
        })}
      </View>

      {loading ? (
        <View className="items-center py-6">
          <ActivityIndicator color="#BB3F95" />
        </View>
      ) : !data || data.categories.length === 0 ? (
        <Empty text="Run festival or promotion campaigns to unlock seasonal insights." />
      ) : (
        <>
          {/* Summary badge */}
          {data.summary.biggestSwing && (
            <View className="bg-fuchsia-500/10 rounded-2xl p-3.5 mb-3.5 border border-fuchsia-500/20">
              <Text className="text-xs font-bold text-fuchsia-800">
                Biggest swing: {data.summary.biggestSwing.category}{' '}
                ({data.summary.biggestSwing.metric})
                {' '}{data.summary.biggestSwing.deltaPct > 0 ? '+' : ''}{data.summary.biggestSwing.deltaPct}%
              </Text>
            </View>
          )}

          {/* Period labels */}
          <View className="flex-row justify-between mb-2">
            <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider">
              {data.period.label}
            </Text>
            {data.comparePeriod && (
              <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider">
                {data.comparePeriod.label}
              </Text>
            )}
          </View>

          {/* Category rows */}
          {data.categories.slice(0, 8).map((cat) => (
            <View key={cat.category} className="mb-3">
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-xs font-bold text-spaceCadet-900 flex-1 mr-2" numberOfLines={1}>
                  {cat.category}
                </Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-[11px] text-heliotrope-500 font-medium">
                    {cat.current.opens} opens
                  </Text>
                  {data.comparePeriod && (
                    <Text className="text-[11px] text-spaceCadet-900 font-bold">
                      {cat.deltaPct.opens > 0 ? '+' : ''}{cat.deltaPct.opens}%
                    </Text>
                  )}
                </View>
              </View>
              <View className="h-2 bg-lavender-100 rounded-full overflow-hidden border border-lavender-200">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(2, (cat.current.opens / Math.max(1, ...data.categories.map((c) => c.current.opens))) * 100))}%`,
                    backgroundColor: '#BB3F95',
                  }}
                />
              </View>
            </View>
          ))}

          {data.categories.length > 8 && (
            <Text className="text-[10px] text-heliotrope-500 text-center mt-1 font-medium">
              +{data.categories.length - 8} more categories
            </Text>
          )}
        </>
      )}
    </Section>
  )
}

function Empty({ text }: { text: string }) {
  return <Text className="text-xs text-heliotrope-500 text-center py-4 font-medium">{text}</Text>
}

export default function GrowthAnalyticsScreen() {
  const insets = useSafeAreaInsets()
  const [seasonalPeriod, setSeasonalPeriod] = useState<SeasonalPeriod>('wedding')

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'analytics'],
    queryFn: () => growthApi.analytics(),
  })
  const stats = data?.data

  const { data: seasonalData, isLoading: seasonalLoading } = useQuery({
    queryKey: ['growth', 'analytics', 'seasonal', seasonalPeriod],
    queryFn: () => growthApi.seasonal(seasonalPeriod),
  })
  const seasonal = seasonalData?.data

  const maxHourOpens = stats ? Math.max(1, ...stats.by_hour.map((h) => h.opens)) : 1
  const maxCategoryTotal = stats
    ? Math.max(1, ...stats.by_category.map((c) => c.views + c.enquiries))
    : 1

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
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
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              Campaign Analytics
            </Text>
            <Text className="text-xs text-heliotrope-500 font-medium">Festivals, segments, timing & A/B results</Text>
          </View>
        </View>
      </View>

      {isLoading || !stats ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#BB3F95" />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          <View className="gap-4">
            {/* Campaigns overview */}
            <Section icon={<Megaphone size={16} color="#BB3F95" />} title="Campaigns">
              {stats.total_campaigns === 0 ? (
                <Empty text="No campaigns yet — create one from the growth hub." />
              ) : (
                <>
                  {Object.entries(stats.by_type).map(([type, v]) => (
                    <OpenRateRow key={type} label={type.replace(/_/g, ' ')} sent={v.sent} opened={v.opened} />
                  ))}
                  {Object.keys(stats.by_festival).length > 0 && (
                    <>
                      <Text className="text-[10px] font-bold text-spaceCadet-900 uppercase tracking-wider mt-2 mb-2">
                        By festival
                      </Text>
                      {Object.entries(stats.by_festival).map(([festival, v]) => (
                        <OpenRateRow
                          key={festival}
                          label={festival}
                          sent={v.sent}
                          opened={v.opened}
                          barColor="#560A39"
                        />
                      ))}
                    </>
                  )}
                </>
              )}
            </Section>

            {/* A/B variant results — roadmap S */}
            {stats.by_variant.length > 0 && (
              <Section icon={<Trophy size={16} color="#BB3F95" />} title="A/B winners">
                <View className="gap-3">
                  {stats.by_variant.map((ab) => (
                    <View key={ab.campaign_id} className="bg-lavender-50 rounded-2xl p-4 border border-lavender-200">
                      <Text className="text-xs font-bold text-spaceCadet-900 mb-2.5" numberOfLines={1}>
                        {ab.campaign_name}
                      </Text>
                      {ab.variants.map((v) => (
                        <View key={v.label} className="flex-row items-center justify-between py-1">
                          <Text className="text-xs text-spaceCadet-900 font-medium flex-1 mr-2" numberOfLines={1}>
                            {v.label}
                          </Text>
                          <Text className="text-xs font-bold text-spaceCadet-900">
                            {v.sent} sent · {Math.round(v.open_rate * 100)}% open
                          </Text>
                        </View>
                      ))}
                      <View className="flex-row items-center gap-1.5 mt-2 pt-2 border-t border-lavender-200">
                        {ab.significance.reliable && ab.significance.winner ? (
                          <>
                            <Trophy size={13} color="#BB3F95" />
                            <Text className="text-xs font-bold text-fuchsia-700">
                              {ab.significance.winner} is winning
                            </Text>
                            <Text className="text-[10px] text-heliotrope-500 font-medium">
                              (p = {ab.significance.p_value})
                            </Text>
                          </>
                        ) : (
                          <Text className="text-[11px] text-heliotrope-500 font-medium">
                            {ab.significance.reliable
                              ? 'No clear winner yet — let it run.'
                              : 'Keep going — needs 30+ sends per variant to call a winner.'}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </Section>
            )}

            {/* Segments */}
            <Section icon={<Users size={16} color="#BB3F95" />} title="By customer segment">
              <OpenRateRow label="VIP (spent ≥ ₹2,000)" sent={stats.by_segment.VIP?.sent ?? 0} opened={stats.by_segment.VIP?.opened ?? 0} barColor="#BB3F95" />
              <OpenRateRow label="Regular" sent={stats.by_segment.REGULAR?.sent ?? 0} opened={stats.by_segment.REGULAR?.opened ?? 0} barColor="#231F48" />
              <OpenRateRow label="Never purchased" sent={stats.by_segment.NEVER_PURCHASED?.sent ?? 0} opened={stats.by_segment.NEVER_PURCHASED?.opened ?? 0} barColor="#560A39" />
            </Section>

            {/* Hour of day */}
            <Section icon={<Clock size={16} color="#BB3F95" />} title="Opens by hour of day">
              {stats.by_hour.length === 0 ? (
                <Empty text="No opens tracked yet (opens count when customers open the link)." />
              ) : (
                <View className="flex-row items-end gap-2 h-24 pt-2">
                  {stats.by_hour.map((h) => (
                    <View key={h.hour} className="flex-1 items-center gap-1">
                      <View
                        className="w-full rounded-t-lg"
                        style={{
                          height: `${Math.max(8, (h.opens / maxHourOpens) * 100)}%`,
                          backgroundColor: '#BB3F95',
                        }}
                      />
                      <Text className="text-[9px] font-bold text-heliotrope-500 mt-1">{h.hour}:00</Text>
                    </View>
                  ))}
                </View>
              )}
            </Section>

            {/* Categories */}
            <Section icon={<BarChart3 size={16} color="#BB3F95" />} title="Categories · last 30 days">
              {stats.by_category.length === 0 ? (
                <Empty text="No views or enquiries in the last 30 days." />
              ) : (
                stats.by_category.slice(0, 6).map((c) => (
                  <View key={c.category} className="mb-3">
                    <View className="flex-row items-center justify-between mb-1.5">
                      <Text className="text-xs font-bold text-spaceCadet-900 flex-1 mr-2" numberOfLines={1}>
                        {c.category}
                      </Text>
                      <Text className="text-[11px] text-heliotrope-500 font-medium">
                        {c.views} views · {c.enquiries} enquiries
                      </Text>
                    </View>
                    <View className="h-2 bg-lavender-100 rounded-full overflow-hidden border border-lavender-200">
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(2, ((c.views + c.enquiries) / maxCategoryTotal) * 100)}%`,
                          backgroundColor: '#BB3F95',
                        }}
                      />
                    </View>
                  </View>
                ))
              )}
            </Section>

            {/* Video vs photo */}
            <Section icon={<Film size={16} color="#BB3F95" />} title="Video vs photo · last 30 days">
              <View className="flex-row gap-3">
                <View className="flex-1 bg-lavender-50 rounded-2xl p-4 border border-lavender-200">
                  <View className="flex-row items-center gap-1.5 mb-1.5">
                    <Film size={14} color="#BB3F95" />
                    <Text className="text-xs font-bold text-spaceCadet-900">With video</Text>
                  </View>
                  <Text
                    style={{ fontFamily: 'Marcellus_400Regular' }}
                    className="text-xl font-bold text-spaceCadet-900"
                  >
                    {stats.video_vs_photo.video.enquiries}
                  </Text>
                  <Text className="text-[10px] text-heliotrope-500 font-medium">enquiries</Text>
                  <Text className="text-[10px] text-heliotrope-500 mt-0.5 font-medium">
                    {stats.video_vs_photo.video.views} views
                  </Text>
                </View>
                <View className="flex-1 bg-lavender-50 rounded-2xl p-4 border border-lavender-200">
                  <View className="flex-row items-center gap-1.5 mb-1.5">
                    <ImageIcon size={14} color="#6B4773" />
                    <Text className="text-xs font-bold text-spaceCadet-900">Photo only</Text>
                  </View>
                  <Text
                    style={{ fontFamily: 'Marcellus_400Regular' }}
                    className="text-xl font-bold text-spaceCadet-900"
                  >
                    {stats.video_vs_photo.photo.enquiries}
                  </Text>
                  <Text className="text-[10px] text-heliotrope-500 font-medium">enquiries</Text>
                  <Text className="text-[10px] text-heliotrope-500 mt-0.5 font-medium">
                    {stats.video_vs_photo.photo.views} views
                  </Text>
                </View>
              </View>
              <Text className="text-[11px] text-heliotrope-500 mt-2.5 font-medium">
                Products with a video clip vs without — a quick read on whether video is pulling
                its weight.
              </Text>
            </Section>

            {/* Seasonal comparison — roadmap R */}
            <SeasonalSection
              data={seasonal}
              loading={seasonalLoading}
              period={seasonalPeriod}
              onPeriodChange={setSeasonalPeriod}
            />

            <View className="flex-row items-center gap-1.5 justify-center pt-2">
              <TrendingUp size={14} color="#BB3F95" />
              <Text className="text-xs text-heliotrope-500 font-medium">
                Analytics refresh on pull.
              </Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  )
}
