import { useState, useCallback, memo } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, MapPin } from 'lucide-react-native'
import { productApi } from '../../src/lib/api'
import { formatPriceRange } from '@kanchuki/shared'

type Product = {
  id: string
  category: string | null
  primary_color: string | null
  price_min: number | null
  price_max: number | null
  status: string
  primary_photo_url: string | null
  section: { name: string } | null
  location_notes: string | null
  ai_tagged: boolean
}

type SearchResult = { data: Product[]; query_interpretation: unknown }
type ListResult = { data: Product[]; pagination: { cursor: string | null; has_more: boolean } }

// Blurhash placeholder for product images (neutral grey)
const BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4'

// ── Memoized Product Card ──────────────────────────────────────────

const ProductCard = memo(function ProductCard({
  product,
  onPress,
  onMarkSold,
}: {
  product: Product
  onPress: () => void
  onMarkSold: () => void
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-1 bg-white rounded-2xl overflow-hidden border border-gray-100"
      style={{ elevation: 1 }}
    >
      {/* Photo */}
      <View className="aspect-[3/4] w-full bg-gray-100">
        {product.primary_photo_url ? (
          <Image
            source={{ uri: product.primary_photo_url }}
            className="w-full h-full"
            contentFit="cover"
            placeholder={{ blurhash: BLURHASH }}
            transition={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View className="w-full h-full items-center justify-center">
            <Text className="text-gray-300 text-3xl">📦</Text>
          </View>
        )}
        {/* Status badge */}
        {product.status !== 'AVAILABLE' && (
          <View className="absolute top-2 left-2 bg-red-500 px-2 py-0.5 rounded-full">
            <Text className="text-white text-xs font-semibold">{product.status}</Text>
          </View>
        )}
        {/* AI tag indicator */}
        {!product.ai_tagged && (
          <View className="absolute top-2 right-2 bg-amber-400 w-2 h-2 rounded-full" />
        )}
      </View>

      {/* Info */}
      <View className="p-2.5">
        <Text className="text-xs text-gray-500 truncate">
          {product.category ?? 'Product'}
          {product.primary_color ? ` · ${product.primary_color}` : ''}
        </Text>
        <Text className="text-sm font-bold text-gray-900 mt-0.5">
          {formatPriceRange(product.price_min, product.price_max)}
        </Text>
        {product.section && (
          <View className="flex-row items-center gap-1 mt-1">
            <MapPin size={10} color="#9CA3AF" />
            <Text className="text-xs text-gray-400">{product.section.name}</Text>
          </View>
        )}

        {product.status === 'AVAILABLE' && (
          <TouchableOpacity
            onPress={onMarkSold}
            className="mt-2 bg-gray-100 py-1.5 rounded-lg items-center"
          >
            <Text className="text-xs text-gray-600 font-medium">Mark Sold</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  )
})

// ── Catalog Screen ─────────────────────────────────────────────────

export default function CatalogScreen() {
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Product[] | null>(null)

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['products', 'list'],
    queryFn: () => productApi.list({ limit: 50 }),
    enabled: !isSearching,
    staleTime: 30_000,
    gcTime: 300_000,
  })

  const products: Product[] = isSearching && searchResults
    ? searchResults
    : ((listData as ListResult | undefined)?.data ?? [])

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (query.trim().length < 2) {
      setIsSearching(false)
      setSearchResults(null)
      return
    }
    setIsSearching(true)
    try {
      const result = (await productApi.search(query)) as SearchResult
      setSearchResults(result.data)
    } catch {
      setSearchResults([])
    }
  }, [])

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setIsSearching(false)
    setSearchResults(null)
  }, [])

  const queryClient = useQueryClient()

  const handleMarkSold = useCallback(async (productId: string) => {
    await productApi.updateStatus(productId, 'SOLD')
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }, [queryClient])

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <ProductCard
        product={item}
        onPress={() => router.push(`/product/${item.id}`)}
        onMarkSold={() => void handleMarkSold(item.id)}
      />
    ),
    [handleMarkSold],
  )

  const keyExtractor = useCallback((item: Product) => item.id, [])

  const listEmpty = useCallback(
    () => (
      <View className="items-center py-16">
        <Text className="text-gray-400 text-sm">
          {isSearching ? 'No matching products' : 'No products yet'}
        </Text>
        {!isSearching && (
          <TouchableOpacity
            onPress={() => router.push('/product/add')}
            className="mt-3 bg-violet-600 px-5 py-2.5 rounded-xl"
          >
            <Text className="text-white text-sm font-semibold">Add First Product</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [isSearching],
  )

  return (
    <View className="flex-1 bg-gray-50">
      {/* Search Bar */}
      <View className="bg-white px-4 py-3 border-b border-gray-100">
        <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-2.5 gap-2">
          <Search size={16} color="#9CA3AF" />
          <TextInput
            value={searchQuery}
            onChangeText={(text) => void handleSearch(text)}
            placeholder="Pink cotton wedding suit under ₹2500..."
            placeholderTextColor="#9CA3AF"
            className="flex-1 text-sm text-gray-900"
            returnKeyType="search"
          />
          {isSearching && searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch}>
              <Text className="text-violet-600 text-xs font-medium">Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        {isSearching && (
          <Text className="text-xs text-violet-600 mt-1.5 px-1">
            AI search — try natural language
          </Text>
        )}
      </View>

      {/* Product Grid */}
      {listLoading && products.length === 0 ? (
        <ActivityIndicator className="mt-16" color="#7C3AED" />
      ) : (
        <FlatList
          data={products}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={listEmpty}
          // ── Performance props ──
          windowSize={7}
          maxToRenderPerBatch={10}
          removeClippedSubviews={true}
          initialNumToRender={6}
        />
      )}

      {/* FAB — short tap: single product, long press: bulk import */}
      <View className="absolute bottom-6 right-4 items-end gap-2">
        <TouchableOpacity
          onPress={() => router.push('/product/add')}
          className="w-14 h-14 bg-violet-600 rounded-full items-center justify-center shadow-lg"
          style={{ elevation: 6 }}
          activeOpacity={0.8}
        >
          <Plus size={24} color="white" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/product/bulk')}
          className="bg-white/90 px-3 py-1.5 rounded-full border border-gray-200 shadow-sm flex-row items-center gap-1.5"
          style={{ elevation: 3 }}
          activeOpacity={0.7}
        >
          <Text className="text-xs text-gray-500">Bulk</Text>
          <Text className="text-xs">📷</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
