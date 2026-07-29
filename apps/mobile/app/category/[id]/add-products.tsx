import { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import ProductCard from '../../../src/components/ProductCard'
import { ProductGridSkeleton } from '../../../src/components/Skeleton'
import { productApi, categoryApi } from '../../../src/lib/api'
import { showError } from '../../../src/lib/errors'
import { useTheme } from '../../../src/lib/theme'
import { formatPriceRange } from '@kanchuki/shared'

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
  const { primaryColor } = useTheme()
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
    <View className="flex-1 bg-ink-50">
      <View
        className="flex-row items-center px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color="#4B4039" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-sand-900 ml-3">Add Products</Text>
      </View>
      {isLoading ? (
          <ProductGridSkeleton />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={{ padding: 12, gap: 10 }}
            columnWrapperStyle={{ gap: 10 }}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id)
              return (
                <ProductCard
                  imageUrl={item.primary_photo_url}
                  onPress={() => toggle(item.id)}
                  selected={isSelected}
                  elevation={isSelected ? 3 : 1}
                  imageHeight={144}
                  style={isSelected ? { borderWidth: 2, borderColor: primaryColor } : undefined}
                  placeholderIcon="📷"
                  footer={
                    <View className="p-2.5">
                      <Text className="text-xs font-semibold text-sand-900" numberOfLines={1}>
                        {item.category ?? 'Product'} · {item.primary_color ?? '—'}
                      </Text>
                      <Text className="text-xs text-sand-500 mt-0.5">
                        {formatPriceRange(item.price_min, item.price_max)}
                      </Text>
                    </View>
                  }
                />
              )
            }}
            ListEmptyComponent={
              <Text className="text-sand-400 text-sm text-center mt-16">
                No available products. Add products first.
              </Text>
            }
          />
        )}

        <View
          className="bg-white px-4 pt-3 border-t border-sand-100"
          style={{ paddingBottom: 12 + insets.bottom }}
        >
          <TouchableOpacity
            disabled={!canAssign}
            onPress={() => assign.mutate()}
            className={`py-3.5 rounded-xl items-center ${canAssign ? 'bg-ink-600' : 'bg-sand-200'}`}
          >
            <Text className={`font-semibold ${canAssign ? 'text-white' : 'text-sand-400'}`}>
              {assign.isPending ? 'Adding…' : `Add ${selected.size || ''} Product${selected.size === 1 ? '' : 's'}`.trim()}
            </Text>
          </TouchableOpacity>
        </View>
    </View>
  )
}
