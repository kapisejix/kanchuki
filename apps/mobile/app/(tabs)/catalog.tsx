import { useState, useCallback, memo } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, MapPin, SlidersHorizontal, X, Trash2 } from 'lucide-react-native'
import ProductCard from '../../src/components/ProductCard'
import { productApi } from '../../src/lib/api'
import { formatPriceRange } from '@kanchuki/shared'

type Product = {
  id: string
  category: string | null
  primary_color: string | null
  price_min: number | null
  price_max: number | null
  occasions: string[]
  status: string
  primary_photo_url: string | null
  section: { name: string } | null
  location_notes: string | null
  ai_tagged: boolean
}

// ── Price buckets (paise, matches formatPriceRange units) ──────────
const PRICE_BUCKETS = [
  { label: 'Under ₹1000', max: 100_000 },
  { label: '₹1000–2500', min: 100_000, max: 250_000 },
  { label: '₹2500–5000', min: 250_000, max: 500_000 },
  { label: 'Above ₹5000', min: 500_000 },
] as const

// ── Filter chip row ──────────────────────────────────────────────
function ChipRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string
  options: string[]
  selected: string | null
  onSelect: (value: string | null) => void
}) {
  if (options.length === 0) return null
  return (
    <View className="mb-2.5">
      <Text className="text-xs text-gray-500 mb-1.5">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        <TouchableOpacity
          onPress={() => onSelect(null)}
          className={`px-3 py-1.5 rounded-full border ${
            selected === null ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
          }`}
        >
          <Text className={`text-xs font-medium ${selected === null ? 'text-white' : 'text-gray-600'}`}>
            All
          </Text>
        </TouchableOpacity>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            onPress={() => onSelect(selected === opt ? null : opt)}
            className={`px-3 py-1.5 rounded-full border ${
              selected === opt ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
            }`}
          >
            <Text className={`text-xs font-medium ${selected === opt ? 'text-white' : 'text-gray-600'}`}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

type SearchResult = { data: Product[]; query_interpretation: unknown }
type ListResult = { data: Product[]; pagination: { cursor: string | null; has_more: boolean } }

// ── Memoized Product Card Wrap ──────────────────────────────────────

const CatalogCard = memo(function CatalogCard({
  product,
  onPress,
  onLongPress,
  onMarkSold,
  selected,
}: {
  product: Product
  onPress: () => void
  onLongPress: () => void
  onMarkSold: () => void
  selected: boolean
}) {
  return (
    <ProductCard
      imageUrl={product.primary_photo_url}
      onPress={onPress}
      onLongPress={onLongPress}
      selected={selected}
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
              className="mt-1.5 bg-gray-100 py-1.5 rounded-lg items-center"
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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectionMode = selectedIds.size > 0
  const [deleting, setDeleting] = useState(false)

  const [showFilters, setShowFilters] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [filterOccasion, setFilterOccasion] = useState<string | null>(null)
  const [filterPrice, setFilterPrice] = useState<string | null>(null)
  const [filterColor, setFilterColor] = useState<string | null>(null)

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['products', 'list'],
    queryFn: () => productApi.list({ limit: 50 }),
    enabled: !isSearching,
    staleTime: 30_000,
    gcTime: 300_000,
  })

  const unfilteredProducts: Product[] = isSearching && searchResults
    ? searchResults
    : ((listData as ListResult | undefined)?.data ?? [])

  const categoryOptions = Array.from(
    new Set(unfilteredProducts.map((p) => p.category).filter((c): c is string => !!c)),
  )
  const occasionOptions = Array.from(new Set(unfilteredProducts.flatMap((p) => p.occasions)))
  const colorOptions = Array.from(
    new Set(unfilteredProducts.map((p) => p.primary_color).filter((c): c is string => !!c)),
  )
  const activeFilterCount = [filterCategory, filterOccasion, filterPrice, filterColor].filter(Boolean).length

  const products = unfilteredProducts.filter((p) => {
    if (filterCategory && p.category !== filterCategory) return false
    if (filterOccasion && !p.occasions.includes(filterOccasion)) return false
    if (filterColor && p.primary_color !== filterColor) return false
    if (filterPrice) {
      const bucket = PRICE_BUCKETS.find((b) => b.label === filterPrice)
      const price = p.price_min ?? 0
      if (bucket) {
        if ('min' in bucket && price < bucket.min) return false
        if ('max' in bucket && price >= bucket.max) return false
      }
    }
    return true
  })

  const clearFilters = useCallback(() => {
    setFilterCategory(null)
    setFilterOccasion(null)
    setFilterPrice(null)
    setFilterColor(null)
  }, [])

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

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleBulkDelete = useCallback(() => {
    const count = selectedIds.size
    Alert.alert(
      `Delete ${count} product${count !== 1 ? 's' : ''}?`,
      'This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            try {
              await productApi.bulkDelete([...selectedIds])
              clearSelection()
              void queryClient.invalidateQueries({ queryKey: ['products'] })
            } catch (err) {
              Alert.alert('Delete failed', err instanceof Error ? err.message : 'Try again.')
            } finally {
              setDeleting(false)
            }
          },
        },
      ],
    )
  }, [selectedIds, clearSelection, queryClient])

  const renderItem = useCallback(
    ({ item }: { item: Product }) => (
      <CatalogCard
        product={item}
        selected={selectedIds.has(item.id)}
        onPress={() =>
          selectionMode ? toggleSelect(item.id) : router.push(`/product/${item.id}`)
        }
        onLongPress={() => toggleSelect(item.id)}
        onMarkSold={() => void handleMarkSold(item.id)}
      />
    ),
    [handleMarkSold, selectionMode, selectedIds, toggleSelect],
  )

  const keyExtractor = useCallback((item: Product) => item.id, [])

  const listEmpty = useCallback(
    () => (
      <View className="items-center py-16">
        <Text className="text-gray-400 text-sm">
          {isSearching
            ? 'No matching products'
            : activeFilterCount > 0
              ? 'No products match the filter'
              : 'No products yet'}
        </Text>
        {!isSearching && activeFilterCount > 0 && (
          <TouchableOpacity onPress={clearFilters} className="mt-2">
            <Text className="text-cyan-600 text-xs font-medium underline">Clear filters</Text>
          </TouchableOpacity>
        )}
        {!isSearching && activeFilterCount === 0 && (
          <TouchableOpacity
            onPress={() => router.push('/product/add')}
            className="mt-3 bg-cyan-600 px-5 py-2.5 rounded-xl"
          >
            <Text className="text-white text-sm font-semibold">Add First Product</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [isSearching, activeFilterCount, clearFilters],
  )

  return (
    <View className="flex-1 bg-cyan-50">
      {/* Search Bar */}
      <View className="bg-white px-4 py-3 border-b border-gray-100">
        <View className="flex-row items-center gap-2">
          <View className="flex-1 flex-row items-center bg-gray-100 rounded-xl px-3 py-2.5 gap-2">
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
          <TouchableOpacity
            onPress={() => setShowFilters((v) => !v)}
            className={`w-10 h-10 rounded-xl items-center justify-center border ${
              activeFilterCount > 0 ? 'bg-cyan-600 border-cyan-600' : 'bg-gray-100 border-gray-100'
            }`}
          >
            <SlidersHorizontal size={16} color={activeFilterCount > 0 ? 'white' : '#6B7280'} />
          </TouchableOpacity>
        </View>
        {isSearching && (
          <Text className="text-xs text-cyan-600 mt-1.5 px-1">
            AI search — try natural language
          </Text>
        )}

        {/* Filter panel — Category, Occasion, Price, Color, then the list below */}
        {showFilters && (
          <View className="mt-3 pt-3 border-t border-gray-100">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Filters</Text>
              <View className="flex-row items-center gap-3">
                {activeFilterCount > 0 && (
                  <TouchableOpacity onPress={clearFilters}>
                    <Text className="text-cyan-600 text-xs font-medium">Clear all</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setShowFilters(false)}>
                  <X size={16} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            </View>
            <ChipRow label="Category" options={categoryOptions} selected={filterCategory} onSelect={setFilterCategory} />
            <ChipRow label="Occasion" options={occasionOptions} selected={filterOccasion} onSelect={setFilterOccasion} />
            <ChipRow
              label="Price"
              options={PRICE_BUCKETS.map((b) => b.label)}
              selected={filterPrice}
              onSelect={setFilterPrice}
            />
            <ChipRow label="Color" options={colorOptions} selected={filterColor} onSelect={setFilterColor} />
          </View>
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

      {/* Selection action bar — replaces the FAB while items are selected */}
      {selectionMode ? (
        <View
          className="absolute bottom-6 left-4 right-4 bg-gray-900 rounded-2xl px-4 py-3 flex-row items-center justify-between shadow-lg"
          style={{ elevation: 6 }}
        >
          <TouchableOpacity onPress={clearSelection} disabled={deleting}>
            <Text className="text-gray-300 text-sm">Cancel</Text>
          </TouchableOpacity>
          <Text className="text-white text-sm font-semibold">{selectedIds.size} selected</Text>
          <TouchableOpacity
            onPress={handleBulkDelete}
            disabled={deleting}
            className="flex-row items-center gap-1.5 bg-red-600 px-3 py-2 rounded-xl"
          >
            {deleting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Trash2 size={14} color="white" />
                <Text className="text-white text-sm font-semibold">Delete</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        /* FAB — quick import menu */
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
      )}
    </View>
  )
}
