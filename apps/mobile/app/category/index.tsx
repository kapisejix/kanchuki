import { View, Text, FlatList } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Plus, ChevronLeft, FolderKanban } from 'lucide-react-native'
import { Image } from 'expo-image'
import { ProductGridSkeleton } from '../../src/components/Skeleton'
import { categoryApi, type ProductCategory } from '../../src/lib/api'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

export default function CategoryListScreen() {
  const insets = useSafeAreaInsets()
  const columns = 2
  const { data, isLoading } = useQuery({
    queryKey: ['categories', 'list'],
    queryFn: () => categoryApi.list(),
  })
  const categories = data?.data ?? []

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-5 pb-3 bg-white border-b border-lavender-200"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <AnimatedPressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={20} color="#231F48" />
        </AnimatedPressable>

        <Text className="text-lg font-bold text-spaceCadet-900 font-marcellus">Categories</Text>

        <View className="w-10" />
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
          contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
          ListHeaderComponent={
            <View className="mb-2">
              <Text
                style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                className="text-2xl font-extrabold text-spaceCadet-900 leading-tight"
              >
                Curated Collections{'\n'}for your store
              </Text>
              <Text className="text-xs text-heliotrope-500 font-medium mt-1">
                {categories.length} {categories.length === 1 ? 'category' : 'categories'} configured
              </Text>
            </View>
          }
          renderItem={({ item }: { item: ProductCategory }) => (
            <AnimatedPressable
              onPress={() => router.push(`/category/${item.id}`)}
              className="flex-1 bg-white rounded-[28px] overflow-hidden border border-lavender-200 shadow-sm"
              style={{
                shadowColor: '#231F48',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.08,
                shadowRadius: 10,
                elevation: 3,
              }}
            >
              <View className="p-1.5">
                <View className="w-full aspect-[4/3] bg-lavender-100 rounded-[22px] overflow-hidden relative">
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
                  <View className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-spaceCadet-900/85 backdrop-blur-md shadow-sm">
                    <Text className="text-[10px] font-bold text-white uppercase tracking-wider">
                      {item.product_count} {item.product_count === 1 ? 'Item' : 'Items'}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="px-3.5 pb-3.5 pt-1 bg-white">
                <Text className="text-sm font-bold text-spaceCadet-900 font-marcellus truncate" numberOfLines={1}>
                  {item.name}
                </Text>
                <Text className="text-[11px] text-fuchsia-600 font-bold mt-0.5">
                  Browse collection →
                </Text>
              </View>
            </AnimatedPressable>
          )}
          ListEmptyComponent={
            <View className="items-center py-16 px-6">
              <View className="w-16 h-16 rounded-3xl bg-lavender-100 items-center justify-center mb-4 border border-lavender-200">
                <FolderKanban size={28} color="#6B4773" />
              </View>
              <Text className="text-base font-bold text-spaceCadet-900 font-marcellus">No categories yet</Text>
              <Text className="text-xs text-heliotrope-500 mt-1 text-center mb-6">
                Organize your catalog into luxury collections for easy browsing.
              </Text>
              <View className="w-full max-w-xs">
                <GradientButton
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
        className="absolute bottom-8 right-6 w-14 h-14 bg-fuchsia-600 rounded-full items-center justify-center shadow-lg border border-white/20"
        style={{
          shadowColor: '#BB3F95',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.45,
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
