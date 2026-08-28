import { useState } from 'react'
import { formatPriceRange } from '@kanchuki/shared'
import { View, Text, FlatList } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import ProductCard from '../../../src/components/ProductCard'
import { ProductGridSkeleton } from '../../../src/components/Skeleton'
import { useGridColumns } from '../../../src/hooks/useIsTablet'
import { productApi, categoryApi } from '../../../src/lib/api'
import { showError } from '../../../src/lib/errors'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'
import { GradientButton } from '../../../src/components/GradientButton'

type Product = {
  id: string
  category: string | null
  primary_color: string | null
  price_min: number | null
  price_max: number | null
  status: string
  primary_photo_url: string | null
}

export default function AddProductsToCategoryScreen() {
  const columns = useGridColumns()
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'list', 'available'],
    queryFn: () => productApi.list({ status: 'AVAILABLE', limit: 100 }),
  })
  const products = ((data as { data: Product[] } | undefined)?.data ?? [])

  const toggle = (productId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })
  }

  const assign = useMutation({
    mutationFn: () => categoryApi.assignProducts(id, [...selected]),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      router.back()
    },
    onError: (err: Error) => showError(err, 'Please try again.', 'Could not assign products'),
  })

  const canAssign = selected.size > 0 && !assign.isPending

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      <View
        className="flex-row items-center px-5 pb-4 bg-white border-b border-lavender-200"
        style={{ paddingTop: insets.top + 12 }}
      >
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
          className="text-xl font-bold text-spaceCadet-900 ml-3"
        >
          Add Products to Category
        </Text>
      </View>

      {isLoading ? (
        <ProductGridSkeleton />
      ) : (
        <FlatList
          key={columns}
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id)
            return (
              <ProductCard
                imageUrl={item.primary_photo_url}
                onPress={() => toggle(item.id)}
                selected={isSelected}
                elevation={isSelected ? 3 : 1}
                imageHeight={150}
                style={isSelected ? { borderWidth: 2, borderColor: '#BB3F95' } : undefined}
                placeholderIcon="📷"
                footer={
                  <View className="p-3">
                    <Text
                      style={{ fontFamily: 'Marcellus_400Regular' }}
                      className="text-xs font-bold text-spaceCadet-900"
                      numberOfLines={1}
                    >
                      {item.category ?? 'Design'} · {item.primary_color ?? '—'}
                    </Text>
                    <Text className="text-xs font-bold text-spaceCadet-900 mt-1">
                      {formatPriceRange(item.price_min, item.price_max)}
                    </Text>
                  </View>
                }
              />
            )
          }}
          ListEmptyComponent={
            <Text className="text-heliotrope-400 text-xs font-medium text-center mt-16">
              No available products. Add products to your catalog first.
            </Text>
          }
        />
      )}

      <View
        className="bg-white px-5 pt-3.5 border-t border-lavender-200"
        style={{ paddingBottom: 16 + insets.bottom }}
      >
        <GradientButton
          label={`Add ${selected.size || ''} Design${selected.size === 1 ? '' : 's'}`.trim()}
          disabled={!canAssign}
          loading={assign.isPending}
          onPress={() => assign.mutate()}
        />
      </View>
    </View>
  )
}
