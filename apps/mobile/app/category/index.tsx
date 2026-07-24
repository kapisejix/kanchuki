import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Stack, router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react-native'
import ProductCard from '../../src/components/ProductCard'
import { categoryApi, type ProductCategory } from '../../src/lib/api'

export default function CategoryListScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['categories', 'list'],
    queryFn: () => categoryApi.list(),
  })
  const categories = data?.data ?? []

  return (
    <>
      <Stack.Screen options={{ title: 'Categories', headerShown: true }} />
      <View className="flex-1 bg-cyan-50">
        {isLoading ? (
          <ActivityIndicator className="mt-16" color="#0891B2" />
        ) : (
          <FlatList
            data={categories}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 12 }}
            contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1 }}
            renderItem={({ item }: { item: ProductCategory }) => (
              <ProductCard
                imageUrl={item.image_url}
                onPress={() => router.push(`/category/${item.id}`)}
                placeholderIcon="🗂️"
                footer={
                  <View className="p-2.5">
                    <Text className="text-sm font-semibold text-gray-900" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-0.5">
                      {item.product_count} product{item.product_count === 1 ? '' : 's'}
                    </Text>
                  </View>
                }
              />
            )}
            ListEmptyComponent={
              <View className="items-center py-16">
                <Text className="text-gray-400 text-sm">No categories yet</Text>
                <TouchableOpacity
                  onPress={() => router.push('/category/new')}
                  className="mt-3 bg-cyan-600 px-5 py-2.5 rounded-xl"
                >
                  <Text className="text-white text-sm font-semibold">Add First Category</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}

        <TouchableOpacity
          onPress={() => router.push('/category/new')}
          className="absolute bottom-6 right-4 w-14 h-14 bg-cyan-600 rounded-full items-center justify-center shadow-lg"
          style={{ elevation: 6 }}
          activeOpacity={0.8}
        >
          <Plus size={24} color="white" />
        </TouchableOpacity>
      </View>
    </>
  )
}
