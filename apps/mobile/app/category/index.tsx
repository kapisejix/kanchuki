import { View, Text, FlatList } from 'react-native'
import { COLORS } from '@kanchuki/shared'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Plus, ChevronLeft } from 'lucide-react-native'
import ProductCard from '../../src/components/ProductCard'
import { ProductGridSkeleton } from '../../src/components/Skeleton'
import { categoryApi, type ProductCategory } from '../../src/lib/api'
import { useGridColumns } from '../../src/hooks/useIsTablet'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

export default function CategoryListScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const columns = useGridColumns()
  const { data, isLoading } = useQuery({
    queryKey: ['categories', 'list'],
    queryFn: () => categoryApi.list(),
  })
  const categories = data?.data ?? []

  return (
    <>
      <View className="flex-1 bg-ink-50">
        {/* Icon-only header — no title text (native Stack header showed
            the previous screen's route name as the back-button label). */}
        <View
          className="flex-row items-center px-4 pb-4 bg-white border-b border-sand-100"
          style={{ paddingTop: insets.top + 12 }}
        >
          <AnimatedPressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
        </View>
        {isLoading ? (
          <ProductGridSkeleton />
        ) : (
          <FlatList
            key={columns}
            data={categories}
            keyExtractor={(item) => item.id}
            numColumns={columns}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1 }}
            renderItem={({ item }: { item: ProductCategory }) => (
              <ProductCard
                imageUrl={item.image_url}
                onPress={() => router.push(`/category/${item.id}`)}
                placeholderIcon="🗂️"
                footer={
                  <View className="p-2.5">
                    <Text className="text-sm font-semibold text-sand-900" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className="text-xs text-sand-500 mt-0.5">
                      {item.product_count} product{item.product_count === 1 ? '' : 's'}
                    </Text>
                  </View>
                }
              />
            )}
            ListEmptyComponent={
              <View className="items-center py-16">
                <Text className="text-sand-400 text-sm">No categories yet</Text>
                <AnimatedPressable
                  onPress={() => router.push('/category/new')}
                  className="mt-3 bg-ink-600 px-5 py-2.5 rounded-xl"
                >
                  <Text className="text-white text-sm font-semibold">Add First Category</Text>
                </AnimatedPressable>
              </View>
            }
          />
        )}

        <AnimatedPressable
          onPress={() => router.push('/category/new')}
          className="absolute bottom-6 right-4 w-14 h-14 bg-ink-600 rounded-full items-center justify-center shadow-lg"
          style={{ elevation: 6 }}
          accessibilityLabel="Add category"
          accessibilityRole="button"
        >
          <Plus size={24} color="white" />
        </AnimatedPressable>
      </View>
    </>
  )
}
