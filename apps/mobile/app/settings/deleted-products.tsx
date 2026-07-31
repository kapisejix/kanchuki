import { useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, Image,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { RotateCcw, Trash2, PackageX, ChevronLeft } from 'lucide-react-native'
import { formatPriceRange } from '@kanchuki/shared'
import { CustomerListSkeleton } from '../../src/components/Skeleton'
import { productApi } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

type DeletedProduct = {
  id: string
  name: string | null
  category: string | null
  price_min: number | null
  price_max: number | null
  deleted_at: string
  photos: { url: string }[]
}

export default function DeletedProductsScreen() {
  const { primaryColor } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'deleted'],
    queryFn: () => productApi.listDeleted(),
  })
  const products = ((data as { data: DeletedProduct[] } | undefined)?.data ?? [])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['products', 'deleted'] })
    void queryClient.invalidateQueries({ queryKey: ['products', 'list'] })
  }

  const restore = useMutation({
    mutationFn: (id: string) => productApi.restore(id),
    onSuccess: invalidate,
    onError: (err: Error) => showError(err, 'Failed to restore product'),
  })

  const purge = useMutation({
    mutationFn: (id: string) => productApi.purge(id),
    onSuccess: invalidate,
    onError: (err: Error) => showError(err, 'Failed to delete permanently'),
  })

  const handlePurge = useCallback(
    (product: DeletedProduct) => {
      Alert.alert(
        'Delete Permanently',
        `Permanently delete "${product.name ?? 'this product'}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete Forever', style: 'destructive', onPress: () => purge.mutate(product.id) },
        ],
      )
    },
    [purge],
  )

  const renderItem = useCallback(
    ({ item }: { item: DeletedProduct }) => (
      <View className="bg-white rounded-2xl p-3 border border-sand-100 flex-row items-center">
        {item.photos[0] ? (
          <Image source={{ uri: item.photos[0].url }} className="w-14 h-14 rounded-xl mr-3" resizeMode="cover" />
        ) : (
          <View className="w-14 h-14 rounded-xl bg-sand-100 items-center justify-center mr-3">
            <PackageX size={20} color="#ABA39C" />
          </View>
        )}
        <View className="flex-1">
          <Text className="text-sm font-semibold text-sand-900" numberOfLines={1}>
            {item.name ?? 'Untitled product'}
          </Text>
          <Text className="text-xs text-sand-400 mt-0.5">
            {formatPriceRange(item.price_min, item.price_max)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => restore.mutate(item.id)}
          disabled={restore.isPending}
          className="w-9 h-9 rounded-full bg-ink-50 items-center justify-center mr-2"
          accessibilityLabel="Restore product"
          accessibilityRole="button"
        >
          <RotateCcw size={16} color={primaryColor} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handlePurge(item)}
          disabled={purge.isPending}
          className="w-9 h-9 rounded-full bg-rust-50 items-center justify-center"
          accessibilityLabel="Permanently delete"
          accessibilityRole="button"
        >
          <Trash2 size={16} color="#A24854" />
        </TouchableOpacity>
      </View>
    ),
    [restore, purge, handlePurge, primaryColor],
  )

  return (
    <View className="flex-1 bg-ink-50">
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
            <ChevronLeft size={24} color="#4B4039" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-sand-900">Recently Deleted</Text>
        </View>
      </View>

      <View className="flex-1 px-4 pt-4">
        {isLoading ? (
          <CustomerListSkeleton />
        ) : products.length === 0 ? (
          <View className="items-center py-16">
            <PackageX size={40} color="#CDC6BF" />
            <Text className="text-sand-400 text-sm mt-4 text-center">
              No deleted products.{'\n'}Items removed by you or your team show up here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
            ListHeaderComponent={
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1">
                {products.length} deleted item{products.length !== 1 ? 's' : ''}
              </Text>
            }
          />
        )}
      </View>
    </View>
  )
}
