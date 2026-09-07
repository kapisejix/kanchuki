// Suits Designs — "View more" browse (customer-facing, docs/tasks/suits-designs.md §2.4).
// Full grid of the related designs for the store, with the expanded related
// category set as filter chips. Uses only the public API — reachable without a
// retailer session.
import { useCallback, useMemo, useState } from 'react'
import { View, Text, FlatList, Image, ActivityIndicator } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useScreenInsets } from '../../src/lib/safe-area'
import { showcaseDesignsApi, type PublicShowcaseDesign } from '../../src/lib/api'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

interface BrowseData {
  designs: PublicShowcaseDesign[]
  related: string[]
}

export default function ShowcaseDesignsBrowseScreen() {
  const { store, category } = useLocalSearchParams<{ store?: string; category?: string }>()
  const { screenPaddingBottom } = useScreenInsets()

  const [activeSlug, setActiveSlug] = useState<string | null>(category ?? null)

  const { data, isLoading } = useQuery({
    queryKey: ['showcase-designs', 'browse', { store: store ?? '', category: activeSlug }],
    queryFn: () => showcaseDesignsApi.publicBrowse(store ?? '', activeSlug ?? undefined),
    staleTime: 60_000,
  })
  const { designs, related } = useMemo<BrowseData>(() => {
    const d = data?.data
    return { designs: d?.designs ?? [], related: d?.related ?? [] }
  }, [data])

  // Chip labels come from the API's related slugs — resolve names from the
  // design rows (each carries its category name).
  const chipLabels = useMemo(() => {
    const bySlug = new Map<string, string>()
    for (const d of designs) {
      if (!bySlug.has(d.category.slug)) bySlug.set(d.category.slug, d.category.name ?? d.category.slug)
    }
    return related
      .map((slug) => ({ slug, name: bySlug.get(slug) ?? slug }))
      .filter((c, i, arr) => arr.findIndex((x) => x.slug === c.slug) === i)
  }, [designs, related])

  const title = useMemo(() => {
    if (!activeSlug) return 'Suits Designs'
    const chip = chipLabels.find((c) => c.slug === activeSlug)
    return `${chip?.name ?? activeSlug} Designs`
  }, [activeSlug, chipLabels])

  const keyExtractor = useCallback((item: PublicShowcaseDesign) => item.id, [])

  const renderItem = useCallback(
    ({ item }: { item: PublicShowcaseDesign }) => (
      <View className="flex-1">
        <AnimatedPressable
          onPress={() => router.push(`/showcase-designs/view/${item.id}`)}
          className="bg-white rounded-2xl overflow-hidden border border-lavender-200 shadow-sm"
        >
          <View className="w-full aspect-[3/4] bg-lavender-100">
            <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
          <View className="px-2.5 py-2">
            <Text className="text-xs font-bold text-spaceCadet-900 truncate" numberOfLines={1}>
              {item.name ?? item.category.name ?? 'Design'}
            </Text>
            {item.store && (
              <Text className="text-[10px] text-heliotrope-500 font-medium mt-0.5 truncate">
                {item.store.shop_name ?? item.store.slug}
              </Text>
            )}
          </View>
        </AnimatedPressable>
      </View>
    ),
    [],
  )

  return (
    <>
      <Stack.Screen options={{ title, headerShown: true }} />
      <View className="flex-1 bg-[#F8F7FC]">
        {chipLabels.length > 1 && (
          <View className="px-4 pt-3 pb-1">
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={[{ slug: 'all', name: 'All' }, ...chipLabels]}
              keyExtractor={(c) => c.slug}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => {
                const selected = activeSlug === (item.slug === 'all' ? null : item.slug)
                const isAll = item.slug === 'all'
                return (
                  <AnimatedPressable
                    onPress={() => setActiveSlug(isAll ? null : item.slug)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`px-3.5 py-1.5 rounded-full border ${
                      selected ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'bg-white border-lavender-200'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-spaceCadet-900'}`}>
                      {item.name}
                    </Text>
                  </AnimatedPressable>
                )
              }}
            />
          </View>
        )}

        {isLoading && designs.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#BB3F95" />
          </View>
        ) : (
          <FlatList
            data={designs}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ padding: 14, gap: 12, flexGrow: 1, paddingBottom: screenPaddingBottom }}
            ListEmptyComponent={
              <View className="items-center py-16 px-8">
                <Text className="text-heliotrope-500 text-sm font-medium text-center">
                  No designs here yet — check back soon.
                </Text>
              </View>
            }
            windowSize={7}
            maxToRenderPerBatch={10}
            initialNumToRender={6}
          />
        )}
      </View>
    </>
  )
}