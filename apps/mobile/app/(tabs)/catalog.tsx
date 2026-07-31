import { useState, useCallback, useEffect, memo } from 'react'
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, MapPin, SlidersHorizontal, X, Trash2 } from 'lucide-react-native'
import ProductCard from '../../src/components/ProductCard'
import { ProductGridSkeleton } from '../../src/components/Skeleton'
import { productApi, retailerApi } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { prefetchProductImages } from '../../src/lib/image-prefetch'
import { enqueueStatusMutation } from '../../src/lib/mutation-queue'
import { formatPriceRange } from '@kanchuki/shared'

const SCREEN_WIDTH = Dimensions.get('window').width
const BANNER_HEIGHT = SCREEN_WIDTH * 0.35 // 16:5.6 aspect ratio

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
      <Text className="text-xs text-sand-500 mb-1.5">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        <TouchableOpacity
          onPress={() => onSelect(null)}
          className={`px-3 py-1.5 rounded-full border ${
            selected === null ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
          }`}
        >
          <Text className={`text-xs font-medium ${selected === null ? 'text-white' : 'text-sand-600'}`}>
            All
          </Text>
        </TouchableOpacity>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            onPress={() => onSelect(selected === opt ? null : opt)}
            className={`px-3 py-1.5 rounded-full border ${
              selected === opt ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
            }`}
          >
            <Text className={`text-xs font-medium ${selected === opt ? 'text-white' : 'text-sand-600'}`}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

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
          <Text className="text-xs text-sand-500 truncate" numberOfLines={1}>
            {product.category ?? 'Product'}
            {product.primary_color ? ` · ${product.primary_color}` : ''}
          </Text>
          <Text className="text-sm font-bold text-sand-900">
            {formatPriceRange(product.price_min, product.price_max)}
          </Text>
          {product.section && (
            <View className="flex-row items-center gap-1">
              <MapPin size={10} color="#ABA39C" />
              <Text className="text-xs text-sand-400" numberOfLines={1}>{product.section.name}</Text>
            </View>
          )}
          {product.status === 'AVAILABLE' && (
            <TouchableOpacity
              onPress={onMarkSold}
              className="mt-1.5 bg-sand-100 py-1.5 rounded-lg items-center"
            >
              <Text className="text-xs text-sand-600 font-medium">Mark Sold</Text>
            </TouchableOpacity>
          )}
        </View>
      }
    />
  )
})

// ── Catalog Screen ─────────────────────────────────────────────────

export default function CatalogScreen() {
  // Fetch retailer profile for banner
  const { data: retailerData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
    staleTime: 60_000,
  })
  const retailerProfile = (retailerData as { data: Record<string, any> } | undefined)?.data as Record<string, any> | undefined
  const bannerUrl = retailerProfile?.banner_url as string | undefined

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectionMode = selectedIds.size > 0
  const [deleting, setDeleting] = useState(false)

  const [showFilters, setShowFilters] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
  const [filterOccasion, setFilterOccasion] = useState<string | null>(null)
  const [filterPrice, setFilterPrice] = useState<string | null>(null)
  const [filterColor, setFilterColor] = useState<string | null>(null)
  const [filterNewArrival, setFilterNewArrival] = useState(false)

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['products', 'list', { is_new_arrival: filterNewArrival }],
    queryFn: () => productApi.list({ limit: 50, ...(filterNewArrival ? { is_new_arrival: true } : {}) }),
    // A-2: catalog is stable — favor offline browsing over refetch churn
    staleTime: 10 * 60_000,
    gcTime: 24 * 60 * 60_000,
  })

  const unfilteredProducts: Product[] = (listData as ListResult | undefined)?.data ?? []

  // A-4: warm expo-image's disk cache so photos render offline after first load
  useEffect(() => {
    if (unfilteredProducts.length) {
      prefetchProductImages(unfilteredProducts).catch(() => {})
    }
  }, [unfilteredProducts])

  const categoryOptions = Array.from(
    new Set(unfilteredProducts.map((p) => p.category).filter((c): c is string => !!c)),
  )
  const occasionOptions = Array.from(new Set(unfilteredProducts.flatMap((p) => p.occasions)))
  const colorOptions = Array.from(
    new Set(unfilteredProducts.map((p) => p.primary_color).filter((c): c is string => !!c)),
  )
  const activeFilterCount = [filterCategory, filterOccasion, filterPrice, filterColor, filterNewArrival ? 'New Arrivals' : null].filter(Boolean).length

  // Category shortcut row — one circle per category, thumbnail borrowed from
  // that category's first photographed product (no separate icon asset needed).
  const categoryImages = categoryOptions.map((cat) => ({
    category: cat,
    photoUrl: unfilteredProducts.find((p) => p.category === cat && p.primary_photo_url)?.primary_photo_url ?? null,
  }))

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

  const queryClient = useQueryClient()

  const handleMarkSold = useCallback(async (productId: string) => {
    try {
      await productApi.updateStatus(productId, 'SOLD')
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch {
      // A-5: offline (or a transient failure) — queue for replay on reconnect
      // and patch the cached list so the retailer sees the change now instead
      // of a silent no-op.
      await enqueueStatusMutation(productId, 'SOLD')
      queryClient.setQueriesData<ListResult>({ queryKey: ['products', 'list'] }, (old) =>
        old
          ? { ...old, data: old.data.map((p) => (p.id === productId ? { ...p, status: 'SOLD' } : p)) }
          : old,
      )
    }
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
              showError(err, 'Try again.', 'Delete failed')
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
        <Text className="text-sand-400 text-sm">
          {activeFilterCount > 0 ? 'No products match the filter' : 'No products yet'}
        </Text>
        {activeFilterCount > 0 && (
          <TouchableOpacity onPress={clearFilters} className="mt-2">
            <Text className="text-ink-600 text-xs font-medium underline">Clear filters</Text>
          </TouchableOpacity>
        )}
        {activeFilterCount === 0 && (
          <TouchableOpacity
            onPress={() => router.push('/product/add')}
            className="mt-3 bg-ink-600 px-5 py-2.5 rounded-xl"
          >
            <Text className="text-white text-sm font-semibold">Add First Product</Text>
          </TouchableOpacity>
        )}
      </View>
    ),
    [activeFilterCount, clearFilters],
  )

  return (
    <View className="flex-1 bg-ink-50">
      {/* Hero Banner with text overlay */}
      {bannerUrl ? (
        <View style={{ width: SCREEN_WIDTH, height: BANNER_HEIGHT }} className="relative">
          <Image
            source={{ uri: bannerUrl }}
            style={{ width: SCREEN_WIDTH, height: BANNER_HEIGHT }}
            resizeMode="cover"
          />
          {/* Dark gradient overlay at bottom for text readability */}
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: BANNER_HEIGHT * 0.5,
              backgroundColor: 'rgba(0,0,0,0.45)',
            }}
          />
          {/* Shop name overlay */}
          <View
            style={{
              position: 'absolute',
              bottom: 14,
              left: 16,
              right: 16,
            }}
          >
            <Text className="text-white/80 text-xs font-semibold uppercase tracking-wider" numberOfLines={1}>
              {retailerProfile?.shop_name ?? 'My Store'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Header — filter icon only, top right */}
      <View className="bg-white px-4 py-3 border-b border-sand-100 flex-row items-center justify-end">
        <TouchableOpacity
          onPress={() => setShowFilters((v) => !v)}
          className={`w-10 h-10 rounded-xl items-center justify-center border ${
            activeFilterCount > 0 ? 'bg-ink-600 border-ink-600' : 'bg-sand-100 border-sand-100'
          }`}
          accessibilityLabel="Filters"
          accessibilityRole="button"
        >
          <SlidersHorizontal size={16} color={activeFilterCount > 0 ? 'white' : '#847B75'} />
        </TouchableOpacity>
      </View>

      {/* Product Grid — category shortcuts + filter panel scroll away with it, not sticky */}
      {listLoading && products.length === 0 ? (
        <ProductGridSkeleton />
      ) : (
        <FlatList
          data={products}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={listEmpty}
          ListHeaderComponent={
            (categoryImages.length > 0 || showFilters) ? (
              <View className="bg-white rounded-2xl px-4 py-3 mb-3">
                {/* Category shortcuts — medium circles, horizontal scroll */}
                {categoryImages.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 px-4">
                    <View className="flex-row gap-4">
                      {categoryImages.map(({ category, photoUrl }) => {
                        const isActive = filterCategory === category
                        return (
                          <TouchableOpacity
                            key={category}
                            onPress={() => setFilterCategory(isActive ? null : category)}
                            className="items-center gap-1"
                            style={{ width: 64 }}
                          >
                            <View
                              className={`w-16 h-16 rounded-full overflow-hidden bg-sand-100 border-2 ${
                                isActive ? 'border-ink-600' : 'border-sand-200'
                              }`}
                            >
                              {photoUrl ? (
                                <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                              ) : (
                                <View className="flex-1 items-center justify-center">
                                  <Text className="text-sand-300 text-xl">👗</Text>
                                </View>
                              )}
                            </View>
                            <Text
                              className={`text-[10px] text-center ${isActive ? 'text-ink-700 font-semibold' : 'text-sand-600'}`}
                              numberOfLines={1}
                            >
                              {category}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </ScrollView>
                )}

                {/* Filter panel — Category, Occasion, Price, Color */}
                {showFilters && (
                  <View className={categoryImages.length > 0 ? 'mt-3 pt-3 border-t border-sand-100' : ''}>
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">Filters</Text>
                      <View className="flex-row items-center gap-3">
                        {activeFilterCount > 0 && (
                          <TouchableOpacity onPress={clearFilters}>
                            <Text className="text-ink-600 text-xs font-medium">Clear all</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={() => setShowFilters(false)} accessibilityLabel="Close filters" accessibilityRole="button">
                          <X size={16} color="#ABA39C" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <ChipRow label="Category" options={categoryOptions} selected={filterCategory} onSelect={setFilterCategory} />
                    <ChipRow label="Occasion" options={occasionOptions} selected={filterOccasion} onSelect={setFilterOccasion} />
                    <ChipRow label="Price"
                      options={PRICE_BUCKETS.map((b) => b.label)}
                      selected={filterPrice}
                      onSelect={setFilterPrice}
                    />
                    <ChipRow label="Color" options={colorOptions} selected={filterColor} onSelect={setFilterColor} />
                    {/* New Arrivals — derived flag, no cron, auto-expires at 30 days */}
                    <View className="mb-2.5">
                      <Text className="text-xs text-sand-500 mb-1.5">Age</Text>
                      <TouchableOpacity
                        onPress={() => setFilterNewArrival((v) => !v)}
                        className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 self-start ${
                          filterNewArrival ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                        }`}
                      >
                        {filterNewArrival && <Text className="text-white text-xs font-medium">✓ </Text>}
                        <Text className={`text-xs font-medium ${filterNewArrival ? 'text-white' : 'text-sand-600'}`}>
                          New Arrivals (30d)
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ) : null
          }
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
          className="absolute bottom-6 left-4 right-4 bg-sand-900 rounded-2xl px-4 py-3 flex-row items-center justify-between shadow-lg"
          style={{ elevation: 6 }}
        >
          <TouchableOpacity onPress={clearSelection} disabled={deleting}>
            <Text className="text-sand-300 text-sm">Cancel</Text>
          </TouchableOpacity>
          <Text className="text-white text-sm font-semibold">{selectedIds.size} selected</Text>
          <TouchableOpacity
            onPress={handleBulkDelete}
            disabled={deleting}
            className="flex-row items-center gap-1.5 bg-rust-600 px-3 py-2 rounded-xl"
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
            className="w-14 h-14 bg-ink-600 rounded-full items-center justify-center shadow-lg"
            style={{ elevation: 6 }}
            activeOpacity={0.8}
            accessibilityLabel="Add product"
            accessibilityRole="button"
          >
            <Plus size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/product/bulk')}
            className="bg-white/90 px-3 py-1.5 rounded-full border border-sand-200 shadow-sm flex-row items-center gap-1.5"
            style={{ elevation: 3 }}
            activeOpacity={0.7}
          >
            <Text className="text-xs text-sand-500">Bulk</Text>
            <Text className="text-xs">📷</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/product/catalog-import')}
            className="bg-white/90 px-3 py-1.5 rounded-full border border-sand-200 shadow-sm flex-row items-center gap-1.5"
            style={{ elevation: 3 }}
            activeOpacity={0.7}
          >
            <Text className="text-xs text-sand-500">Catalog</Text>
            <Text className="text-xs">📋</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}
