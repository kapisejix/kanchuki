import { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Image,
  Pressable,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useScreenInsets } from '../../src/lib/safe-area'
import { Plus, Sparkles, ImagePlus } from 'lucide-react-native'
import {
  showcaseDesignsApi,
  retailerApi,
  type ShowcaseDesignRow,
} from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { ProductGridSkeleton } from '../../src/components/Skeleton'

export default function ShowcaseDesignsScreen() {
  const { headerPaddingTop, tabScrollPaddingBottom } = useScreenInsets()
  const queryClient = useQueryClient()

  // Header identity (logo + shop name) — mirrors (tabs)/catalog.tsx.
  const { data: retailerData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
    staleTime: 60_000,
  })
  const retailerProfile = (retailerData as { data: Record<string, any> } | undefined)?.data as Record<string, any> | undefined

  const [filterSlug, setFilterSlug] = useState<string | null>(null)

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['showcase-designs', 'mine', { category: filterSlug }],
    queryFn: () => showcaseDesignsApi.listMine(filterSlug ?? undefined),
    staleTime: 30_000,
  })
  const designs: ShowcaseDesignRow[] = listData?.data ?? []

  // DB category chips + related links (retailer picks from the admin list).
  const { data: categoriesData } = useQuery({
    queryKey: ['showcase-designs', 'categories'],
    queryFn: () => showcaseDesignsApi.categories(),
    staleTime: 60_000,
  })

  // "X of Y used" badge + FAB disabled at the plan cap.
  const { data: usageData } = useQuery({
    queryKey: ['showcase-designs', 'usage'],
    queryFn: () => showcaseDesignsApi.usage(),
    staleTime: 30_000,
  })
  const usage = usageData?.data
  const atCap = (usage?.limit ?? null) !== null && (usage?.used ?? 0) >= (usage?.limit ?? 0)

  const categoryChips = useMemo(() => {
    const all = { id: 'all', name: 'All', slug: 'all', sort_order: -1, related: [] }
    return [all, ...(categoriesData?.data ?? [])]
  }, [categoriesData])
  const handleDelete = useCallback(
    (design: ShowcaseDesignRow) => {
      Alert.alert(
        'Delete this design?',
        'The photo will be removed from your designs and any shared links.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await showcaseDesignsApi.remove(design.id)
                void queryClient.invalidateQueries({ queryKey: ['showcase-designs'] })
              } catch (err) {
                showError(err, 'Try again.', 'Delete failed')
              }
            },
          },
        ],
      )
    },
    [queryClient],
  )

  const renderItem = useCallback(
    ({ item }: { item: ShowcaseDesignRow }) => (
      <View className="flex-1">
        <AnimatedPressable
          onPress={() => router.push(`/showcase-designs/${item.id}`)}
          onLongPress={() => handleDelete(item)}
          className="bg-white rounded-2xl overflow-hidden border border-lavender-200 shadow-sm"
        >
          <View className="w-full aspect-[3/4] bg-lavender-100">
            <Image source={{ uri: item.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>
          <View className="px-2.5 py-2">
            <Text className="text-xs font-bold text-spaceCadet-900 truncate" numberOfLines={1}>
              {item.name ?? item.category_name ?? 'Design'}
            </Text>
            <Text className="text-[10px] text-heliotrope-500 font-medium mt-0.5">
              {item.category_name ?? item.category_slug}
              {item.owner === 'global' ? ' · Kanchuki' : ''}
            </Text>
          </View>
        </AnimatedPressable>
      </View>
    ),
    [handleDelete],
  )

  const keyExtractor = useCallback((item: ShowcaseDesignRow) => item.id, [])

  const listEmpty = useCallback(
    () => (
      <View className="items-center py-16 px-8">
        <View className="w-16 h-16 bg-lavender-100 rounded-3xl items-center justify-center mb-4 border border-lavender-200 shadow-sm">
          <ImagePlus size={28} color="#BB3F95" />
        </View>
        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-spaceCadet-900 text-lg font-bold text-center"
        >
          No designs yet
        </Text>
        <Text className="text-heliotrope-500 text-xs text-center mt-1 leading-5">
          Add a photo of a suit, blouse, or saree design{'\n'}— it gets a light watermark automatically.
        </Text>
      </View>
    ),
    [],
  )

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header — shop identity + design count */}
      <View
        className="bg-white px-5 pb-3 border-b border-lavender-200 flex-row items-center justify-between"
        style={{ paddingTop: headerPaddingTop }}
      >
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-2xl overflow-hidden bg-lavender-100 items-center justify-center border border-lavender-200 shadow-sm">
            {retailerProfile?.logo_url ? (
              <Image
                source={{ uri: retailerProfile.logo_url }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            ) : (
              <Text className="font-bold text-spaceCadet-900 font-marcellus text-sm">
                {(retailerProfile?.shop_name ?? 'K').slice(0, 2).toUpperCase()}
              </Text>
            )}
          </View>
          <View>
            <Text className="text-sm font-bold text-spaceCadet-900">Suits Designs</Text>
            <Text className="text-[10px] uppercase tracking-wider text-heliotrope-500 font-bold">
              {designs.length} {designs.length === 1 ? 'Design' : 'Designs'}
              {usage?.limit ? ` · ${usage.used} of ${usage.limit} used` : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Category chips (DB-driven) */}
      <View className="px-4 pt-3 pb-1">
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={categoryChips}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => {
            const selected = filterSlug === (item.slug === 'all' ? null : item.slug)
            const isAll = item.slug === 'all'
            return (
              <AnimatedPressable
                onPress={() => setFilterSlug(isAll ? null : item.slug)}
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

      {/* 2-col grid */}
      {listLoading && designs.length === 0 ? (
        <ProductGridSkeleton />
      ) : (
        <FlatList
          data={designs}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 14, gap: 12, flexGrow: 1, paddingBottom: tabScrollPaddingBottom }}
          ListEmptyComponent={listEmpty}
          windowSize={7}
          maxToRenderPerBatch={10}
          initialNumToRender={6}
        />
      )}

      {/* + FAB — disabled at the plan cap */}
      <Pressable
        onPress={() => (atCap ? undefined : router.push('/showcase-designs/new'))}
        disabled={atCap}
        accessibilityLabel={atCap ? 'Design limit reached' : 'Add a design'}
        accessibilityRole="button"
        className="absolute bottom-6 right-5 w-14 h-14 rounded-full bg-spaceCadet-900 items-center justify-center shadow-lg border border-white/20"
        style={{
          shadowColor: '#231F48',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 12,
          elevation: 8,
          opacity: atCap ? 0.5 : 1,
        }}
      >
        {atCap ? (
          <Sparkles size={24} color="#E0E1F6" />
        ) : (
          <Plus size={26} color="white" />
        )}
      </Pressable>

      {atCap && (
        <View className="absolute bottom-24 left-4 right-4 items-center">
          <View className="bg-spaceCadet-900 rounded-2xl px-4 py-2.5 flex-row items-center gap-2 shadow-lg">
            <Sparkles size={14} color="#E0E1F6" />
            <Text className="text-white text-[11px] font-bold">
              Design limit reached — delete one or upgrade your plan
            </Text>
          </View>
        </View>
      )}
    </View>
  )
}