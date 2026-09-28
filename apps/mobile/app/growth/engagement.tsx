import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft, Eye, Heart, MessageSquare, Search, TrendingUp } from 'lucide-react-native';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { growthApi } from '../../src/lib/api/growth';
import { useScreenInsets } from '../../src/lib/safe-area';

// F-037 Phase 4 — retailer-facing engagement view (own store only,
// aggregate-only — no customer drill-down exists on this screen or its API,
// per the §4 privacy boundary). Precomputed nightly by the Phase 2 job.

function Section({
  icon,
  title,
  children,
}: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
      <View className="flex-row items-center gap-2 mb-3.5">
        {icon}
        <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <View className="flex-1 bg-white rounded-2xl p-3.5 border border-lavender-200 items-center gap-1">
      {icon}
      <Text className="text-lg font-bold text-spaceCadet-900">{value.toLocaleString('en-IN')}</Text>
      <Text className="text-[10px] text-heliotrope-500 font-medium uppercase tracking-wider">
        {label}
      </Text>
    </View>
  );
}

function TopList({
  title,
  entries,
}: { title: string; entries: { value: string; count: number }[] }) {
  if (entries.length === 0) {
    return (
      <View className="mb-3">
        <Text className="text-[10px] font-bold text-spaceCadet-900 uppercase tracking-wider mb-1.5">
          {title}
        </Text>
        <Text className="text-xs text-heliotrope-400">No data in range</Text>
      </View>
    );
  }
  const max = Math.max(1, ...entries.map((e) => e.count));
  return (
    <View className="mb-3">
      <Text className="text-[10px] font-bold text-spaceCadet-900 uppercase tracking-wider mb-1.5">
        {title}
      </Text>
      {entries.slice(0, 5).map((e) => (
        <View key={e.value} className="mb-2">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-spaceCadet-900 flex-1 mr-2" numberOfLines={1}>
              {e.value}
            </Text>
            <Text className="text-[11px] text-heliotrope-500 font-medium">{e.count}</Text>
          </View>
          <View className="h-1.5 bg-lavender-100 rounded-full overflow-hidden border border-lavender-200">
            <View
              className="h-full rounded-full bg-fuchsia-500"
              style={{ width: `${Math.max(4, (e.count / max) * 100)}%` }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function GrowthEngagementScreen() {
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'engagement'],
    queryFn: () => growthApi.engagement(30),
  });
  const view = data?.data;
  const maxDwell = view ? Math.max(1, ...view.dwell_trend.map((d) => Number(d.total_dwell_ms))) : 1;

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
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              Customer Engagement
            </Text>
            <Text className="text-xs text-heliotrope-500 font-medium">
              Last 30 days, your store only
            </Text>
          </View>
        </View>
      </View>

      {isLoading || !view ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#BB3F95" />
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: screenPaddingBottom }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
        >
          <View className="gap-4">
            <View className="flex-row gap-2">
              <StatTile
                icon={<Eye size={16} color="#BB3F95" />}
                label="Views"
                value={view.totals.view_count}
              />
              <StatTile
                icon={<Search size={16} color="#BB3F95" />}
                label="Searches"
                value={view.totals.search_count}
              />
              <StatTile
                icon={<Heart size={16} color="#BB3F95" />}
                label="Favorites"
                value={view.totals.favorite_count}
              />
              <StatTile
                icon={<MessageSquare size={16} color="#BB3F95" />}
                label="Enquiries"
                value={view.totals.enquiry_count}
              />
            </View>

            <Section icon={<TrendingUp size={16} color="#BB3F95" />} title="Dwell time trend">
              {view.dwell_trend.length === 0 ? (
                <Text className="text-xs text-heliotrope-400">No data yet</Text>
              ) : (
                <View className="flex-row items-end gap-1" style={{ height: 96 }}>
                  {view.dwell_trend.map((d) => (
                    <View key={d.date} className="flex-1 items-center">
                      <View
                        className="w-full rounded-t bg-fuchsia-500"
                        style={{
                          height: `${Math.max(4, (Number(d.total_dwell_ms) / maxDwell) * 100)}%`,
                        }}
                      />
                    </View>
                  ))}
                </View>
              )}
            </Section>

            <Section icon={<TrendingUp size={16} color="#BB3F95" />} title="Conversion funnel">
              <Text className="text-xs text-spaceCadet-900">
                {view.funnel.view_count} viewed → {view.funnel.view_to_favorite_pct}% favorited →{' '}
                {view.funnel.view_to_enquiry_pct}% enquired
              </Text>
            </Section>

            <Section icon={<TrendingUp size={16} color="#BB3F95" />} title="What's working">
              <TopList title="Top viewed products" entries={view.top_products} />
              <TopList title="Top favorited products" entries={view.top_favorited_products} />
              <TopList title="Top searches" entries={view.top_searches} />
            </Section>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
