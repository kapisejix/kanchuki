import { View, Text, FlatList } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useScreenInsets } from '../../src/lib/safe-area'
import { Plus, FolderKanban } from 'lucide-react-native'
import { Image } from 'expo-image'
import { ProductGridSkeleton } from '../../src/components/Skeleton'
import { categoryApi, retailerApi, type ProductCategory } from '../../src/lib/api'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

export default function CategoryListScreen() {
  const { headerPaddingTop, tabScrollPaddingBottom } = useScreenInsets()
  const columns = 2
  const { data, isLoading } = useQuery({
    queryKey: ['categories', 'list'],
    queryFn: () => categoryApi.list(),
  })
  const categories = data?.data ?? []
  const { data: retailerData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
    staleTime: 60_000,
  })
  const retailerProfile = (retailerData as { data: Record<string, any> } | undefined)?.data

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header — store identity, matches Catalog */}
      <View
        className="bg-white px-5 pb-3 border-b border-lavender-200 flex-row items-center justify-between"
        style={{ paddingTop: headerPaddingTop }}
      >
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-2xl overflow-hidden bg-lavender-100 items-center justify-center border border-lavender-200 shadow-sm">
            {retailerProfile?.logo_url ? (
              <Image source={{ uri: retailerProfile.logo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <Text className="text-spaceCadet-900 font-marcellus text-sm">
                {(retailerProfile?.shop_name ?? 'K').slice(0, 2).toUpperCase()}
              </Text>
            )}
          </View>
          <View>
            <Text className="text-base text-spaceCadet-900 font-marcellus">{retailerProfile?.shop_name ?? 'Store'}</Text>
            <Text className="text-xs text-heliotrope-500">
              {retailerProfile?.city ?? 'Categories'} · {categories.length} {categories.length === 1 ? 'category' : 'categories'}
            </Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <ProductGridSkeleton />
      ) : (
        <FlatList
          key={columns}
          data={categories}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          columnWrapperStyle={{ gap: 14 }}
          contentContainerStyle={{ padding: 16, paddingBottom: tabScrollPaddingBottom, gap: 14, flexGrow: 1 }}
          renderItem={({ item }: { item: ProductCategory }) => (
            <AnimatedPressable
              onPress={() => router.push(`/category/${item.id}`)}
              className="flex-1 bg-white rounded-2xl overflow-hidden border border-lavender-200 shadow-sm"
            >
              <View className="p-1.5">
                <View className="w-full aspect-[4/3] bg-lavender-100 rounded-xl overflow-hidden relative">
                  {item.image_url ? (
                    <Image
                      source={{ uri: item.image_url }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      transition={300}
                    />
                  ) : (
                    <View className="w-full h-full items-center justify-center bg-lavender-100">
                      <FolderKanban size={32} color="#6B4773" />
                    </View>
                  )}
                  <View className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-spaceCadet-900/85">
                    <Text className="text-[11px] font-medium text-white">
                      {item.product_count} {item.product_count === 1 ? 'item' : 'items'}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="px-3.5 pb-3.5 pt-1 bg-white">
                <Text className="text-sm text-spaceCadet-900 font-marcellus truncate" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-xs text-heliotrope-500 mt-0.5">Browse collection</Text>
              </View>
            </AnimatedPressable>
          )}
          ListEmptyComponent={
            <View className="items-center py-16 px-6">
              <View className="w-16 h-16 rounded-2xl bg-lavender-100 items-center justify-center mb-4 border border-lavender-200">
                <FolderKanban size={28} color="#6B4773" />
              </View>
              <Text className="text-base text-spaceCadet-900 font-marcellus">No categories yet</Text>
              <Text className="text-xs text-heliotrope-500 mt-1 text-center mb-6">
                Group your products so they are easy to browse
              </Text>
              <View className="w-full max-w-xs">
                <GradientButton variant="web"
                  label="+ Add First Category"
                  onPress={() => router.push('/category/new')}
                />
              </View>
            </View>
          }
        />
      )}

      {/* Floating Action Button */}
      <AnimatedPressable
        onPress={() => router.push('/category/new')}
        className="absolute bottom-24 right-6 w-14 h-14 bg-fuchsia-600 rounded-full items-center justify-center shadow-lg border border-white/20"
        style={{
          shadowColor: '#231F48',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.18,
          shadowRadius: 10,
          elevation: 6,
        }}
        accessibilityLabel="Add category"
        accessibilityRole="button"
      >
        <Plus size={24} color="white" strokeWidth={2.5} />
      </AnimatedPressable>
    </View>
  )
}
