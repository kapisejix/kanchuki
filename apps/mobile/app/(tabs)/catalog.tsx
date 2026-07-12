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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, MapPin } from 'lucide-react-native'
import ProductCard from '../../src/components/ProductCard'
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

// ── Memoized Product Card Wrap ──────────────────────────────────────

const CatalogCard = memo(function CatalogCard({
  product,
  onPress,
  onMarkSold,
}: {
  product: Product
  onPress: () => void
  onMarkSold: () => void
}) {
  return (
    <ProductCard
      imageUrl={product.primary_photo_url}
      onPress={onPress}
      statusBadge={product.status !== 'AVAILABLE' ? product.status : null}
      showAIDot={!product.ai_tagged}
      footer={
        <View className="p-2.5 gap-1">
          <Text className="text-xs text-gray-500 truncate" numberOfLines={1}>
            {product.category ?? 'Product'}
            {product.primary_color ? ` · ${product.primary_color}` : ''}
          </Text>
          <Text className="text-sm font-bold text-gray-900">
            {formatPriceRange(product.price_min, product.price_max)}
          </Text>
          {product.section && (
            <View className="flex-row items-center gap-1">
              <MapPin size={10} color="#9CA3AF" />
              <Text className="text-xs text-gray-400" numberOfLines={1}>{product.section.name}</Text>
            </View>
          )}
          {product.status === 'AVAILABLE' && (
            <TouchableOpacity
              onPress={onMarkSold}
              className="mt-1.5 bg-gray-100 py-1.5 rounded-lg items-center active:bg-gray-200"
            >
              <Text className="text-xs text-gray-600 font-medium">Mark Sold</Text>
            </TouchableOpacity>
          )}
        </View>
      }
    />
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
      <CatalogCard
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
            className="mt-3 bg-cyan-600 px-5 py-2.5 rounded-xl"
          >
            <Text className="text-white text-sm font-semibold">Add First Product</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [isSearching],
  )

  return (
    <View className="flex-1 bg-cyan-50">
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
              <Text className="text-cyan-600 text-xs font-medium">Clear</Text>
            </TouchableOpacity>
          )}
        </View>
        {isSearching && (
          <Text className="text-xs text-cyan-600 mt-1.5 px-1">
            AI search — try natural language
          </Text>
        )}
      </View>

      {/* Product Grid */}
      {listLoading && products.length === 0 ? (
        <ActivityIndicator className="mt-16" color="#0891B2" />
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

      {/* FAB — quick import menu */}
      <View className="absolute bottom-6 right-4 items-end gap-2">
        <TouchableOpacity
          onPress={() => router.push('/product/add')}
          className="w-14 h-14 bg-cyan-600 rounded-full items-center justify-center shadow-lg"
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
        <TouchableOpacity
          onPress={() => router.push('/product/catalog-import')}
          className="bg-white/90 px-3 py-1.5 rounded-full border border-gray-200 shadow-sm flex-row items-center gap-1.5"
          style={{ elevation: 3 }}
          activeOpacity={0.7}
        >
          <Text className="text-xs text-gray-500">Catalog</Text>
          <Text className="text-xs">📋</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
