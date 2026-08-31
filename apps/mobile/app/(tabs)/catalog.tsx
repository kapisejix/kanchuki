import { useState, useCallback, useEffect, useMemo, memo } from 'react'
import { formatPriceRange, COLORS } from '@kanchuki/shared'
import {
  View,
  Text,
  TextInput,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Plus,
  MapPin,
  SlidersHorizontal,
  X,
  Trash2,
  ScanLine,
  Camera,
  Search,
} from 'lucide-react-native'
import ProductCard from '../../src/components/ProductCard'
import { useGridColumns } from '../../src/hooks/useIsTablet'
import { ProductGridSkeleton } from '../../src/components/Skeleton'
import { productApi, retailerApi, whatsappCatalogApi } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { prefetchProductImages } from '../../src/lib/image-prefetch'
import { enqueueStatusMutation } from '../../src/lib/mutation-queue'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

const SCREEN_WIDTH = Dimensions.get('window').width

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
    <View className="mb-3">
      <Text className="text-[11px] font-bold text-heliotrope-600 uppercase tracking-wider mb-1.5">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        <AnimatedPressable
          onPress={() => onSelect(null)}
          className={`px-3.5 py-1.5 rounded-full border ${
            selected === null ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'bg-white border-lavender-200'
          }`}
        >
          <Text className={`text-xs font-bold ${selected === null ? 'text-white' : 'text-spaceCadet-900'}`}>
            All
          </Text>
        </AnimatedPressable>
        {options.map((opt) => (
          <AnimatedPressable
            key={opt}
            onPress={() => onSelect(selected === opt ? null : opt)}
            className={`px-3.5 py-1.5 rounded-full border ${
              selected === opt ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'bg-white border-lavender-200'
            }`}
          >
            <Text className={`text-xs font-bold ${selected === opt ? 'text-white' : 'text-spaceCadet-900'}`}>
              {opt}
            </Text>
          </AnimatedPressable>
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
  catalogSyncStatus,
}: {
  product: Product
  onPress: () => void
  onLongPress: () => void
  onMarkSold: () => void
  selected: boolean
  catalogSyncStatus?: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'IN_PROGRESS' | null
}) {
  const { colors } = useTheme()
  return (
    <ProductCard
      imageUrl={product.primary_photo_url}
      onPress={onPress}
      onLongPress={onLongPress}
      selected={selected}
      statusBadge={product.status !== 'AVAILABLE' ? product.status : null}
      showAIDot={!product.ai_tagged}
      catalogSyncStatus={catalogSyncStatus}
      footer={
        <View className="py-1 gap-1">
          <Text className="text-xs text-heliotrope-500 font-medium truncate" numberOfLines={1}>
            {product.category ?? 'Product'}
            {product.primary_color ? ` · ${product.primary_color}` : ''}
          </Text>
          <Text className="text-sm font-bold text-spaceCadet-900 font-marcellus">
            {formatPriceRange(product.price_min, product.price_max)}
          </Text>
          {product.section && (
            <View className="flex-row items-center gap-1">
              <MapPin size={10} color="#6B4773" />
              <Text className="text-[11px] text-heliotrope-400" numberOfLines={1}>{product.section.name}</Text>
            </View>
          )}
          {product.status === 'AVAILABLE' && (
            <AnimatedPressable
              onPress={onMarkSold}
              className="mt-2 bg-lavender-100 py-1.5 rounded-xl items-center border border-lavender-200"
            >
              <Text className="text-[11px] text-spaceCadet-900 font-bold">Mark Sold</Text>
            </AnimatedPressable>
          )}
        </View>
      }
    />
  )
})

// ── Catalog Screen ─────────────────────────────────────────────────

export default function CatalogScreen() {
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()
  const columns = useGridColumns()

  // Fetch retailer profile for the header (logo, shop name, city)
  const { data: retailerData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
    staleTime: 60_000,
  })
  const retailerProfile = (retailerData as { data: Record<string, any> } | undefined)?.data as Record<string, any> | undefined

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const selectionMode = selectedIds.size > 0
  const [deleting, setDeleting] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string | null>(null)
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

  // Phase II F7 — WhatsApp catalog sync badges. The status query returns
  // { data: null } when the plan feature is off; items only load once the
  // retailer is actually connected, so a non-Growth retailer pays nothing here.
  const { data: waStatusData } = useQuery({
    queryKey: ['whatsapp-catalog', 'status'],
    queryFn: () => whatsappCatalogApi.getStatus(),
    staleTime: 60_000,
  })
  const waConfigured = waStatusData?.data?.configured ?? false
  const { data: waItemsData } = useQuery({
    queryKey: ['whatsapp-catalog', 'items'],
    queryFn: () => whatsappCatalogApi.getItems(),
    enabled: waConfigured,
    staleTime: 60_000,
  })
  const waSyncStatusByProduct = useMemo(() => {
    const map = new Map<string, 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'IN_PROGRESS'>()
    for (const item of waItemsData?.data ?? []) map.set(item.product_id, item.status)
    return map
  }, [waItemsData])

  const categoryOptions = Array.from(
    new Set(unfilteredProducts.map((p) => p.category).filter((c): c is string => !!c)),
  )
  const colorOptions = Array.from(
    new Set(unfilteredProducts.map((p) => p.primary_color).filter((c): c is string => !!c)),
  )
  const activeFilterCount = [
    filterCategory,
    filterPrice,
    filterColor,
    filterNewArrival ? 'New Arrivals' : null,
    searchQuery.trim() ? 'Search' : null,
  ].filter(Boolean).length

  // Category shortcut row — one circle per category, thumbnail borrowed from
  // that category's first photographed product (no separate icon asset needed).
  const categoryImages = categoryOptions.map((cat) => ({
    category: cat,
    photoUrl: unfilteredProducts.find((p) => p.category === cat && p.primary_photo_url)?.primary_photo_url ?? null,
  }))

  const products = unfilteredProducts.filter((p) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const matchCat = (p.category ?? '').toLowerCase().includes(q)
      const matchColor = (p.primary_color ?? '').toLowerCase().includes(q)
      const matchSection = (p.section?.name ?? '').toLowerCase().includes(q)
      const matchNotes = (p.location_notes ?? '').toLowerCase().includes(q)
      if (!matchCat && !matchColor && !matchSection && !matchNotes) return false
    }
    if (filterCategory && p.category !== filterCategory) return false
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
    setSearchQuery('')
    setFilterCategory(null)
    setFilterPrice(null)
    setFilterColor(null)
    setFilterNewArrival(false)
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
        catalogSyncStatus={waSyncStatusByProduct.get(item.id) ?? null}
      />
    ),
    [handleMarkSold, selectionMode, selectedIds, toggleSelect, waSyncStatusByProduct],
  )

  const keyExtractor = useCallback((item: Product) => item.id, [])

  const listEmpty = useCallback(
    () => (
      <View className="items-center py-16 px-8">
        {activeFilterCount > 0 ? (
          <>
            <Text className="text-heliotrope-500 text-sm font-medium">
              No products match the filter
            </Text>
            <AnimatedPressable onPress={clearFilters} className="mt-3 bg-spaceCadet-900 px-5 py-2.5 rounded-2xl">
              <Text className="text-white text-xs font-bold uppercase tracking-wider">Clear Filters</Text>
            </AnimatedPressable>
          </>
        ) : (
          <>
            <View className="w-16 h-16 bg-lavender-100 rounded-3xl items-center justify-center mb-4 border border-lavender-200 shadow-sm">
              <Camera size={28} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-spaceCadet-900 text-lg font-bold text-center"
            >
              No products yet
            </Text>
            <Text className="text-heliotrope-500 text-xs text-center mt-1 leading-5">
              Take a photo of any product — AI tags it{'\n'}with category, color, and fabric in seconds.
            </Text>
            <View className="mt-5 w-full max-w-xs">
              <GradientButton
                label="Add First Product"
                onPress={() => router.push('/product/add')}
              />
            </View>
          </>
        )}
      </View>
    ),
    [activeFilterCount, clearFilters],
  )

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header — Discovery Greeting + Scan/Filter icons */}
      <View
        className="bg-white px-5 pb-3 border-b border-lavender-200 flex-row items-center justify-between"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <View className="w-10 h-10 rounded-2xl overflow-hidden bg-lavender-100 items-center justify-center border border-lavender-200 shadow-sm">
            {retailerProfile?.logo_url ? (
              <Image
                source={{ uri: retailerProfile.logo_url }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            ) : (
              <Text className="font-bold text-spaceCadet-900 font-marcellus text-sm">
                {(retailerProfile?.shop_name ?? 'K').slice(0, 2).toUpperCase()}
              </Text>
            )}
          </View>
          <View>
            <Text className="text-sm font-bold text-spaceCadet-900">
              Hi, {retailerProfile?.shop_name ?? 'Store'}!
            </Text>
            <Text className="text-[10px] uppercase tracking-wider text-heliotrope-500 font-bold">
              {retailerProfile?.city ?? 'Catalog'} • {products.length} Products
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <AnimatedPressable
            onPress={() => router.push('/product/scan')}
            className="w-10 h-10 rounded-2xl items-center justify-center bg-white border border-lavender-200 shadow-sm"
            accessibilityLabel="Scan product SKU to mark sold"
            accessibilityRole="button"
          >
            <ScanLine size={18} color="#231F48" />
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => setShowFilters((v) => !v)}
            className={`w-10 h-10 rounded-2xl items-center justify-center border ${
              activeFilterCount > 0
                ? 'bg-spaceCadet-900 border-spaceCadet-900'
                : 'bg-white border-lavender-200 shadow-sm'
            }`}
            accessibilityLabel="Filters"
            accessibilityRole="button"
          >
            <SlidersHorizontal size={18} color={activeFilterCount > 0 ? 'white' : '#231F48'} />
            {activeFilterCount > 0 && (
              <View className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-fuchsia-600 items-center justify-center shadow-sm">
                <Text className="text-white text-[9px] font-extrabold">{activeFilterCount}</Text>
              </View>
            )}
          </AnimatedPressable>
        </View>
      </View>

      {/* Product Grid */}
      {listLoading && products.length === 0 ? (
        <ProductGridSkeleton />
      ) : (
        <FlatList
          key={columns}
          data={products}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          numColumns={columns}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 14, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={listEmpty}
          ListHeaderComponent={
            <View className="gap-3 mb-1">
              {/* Discovery Search Bar Card */}
              <View className="w-full bg-white rounded-2xl py-2.5 pl-11 pr-12 border border-lavender-200 shadow-sm flex-row items-center relative">
                <Search size={18} color="#928EB2" style={{ position: 'absolute', left: 14 }} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by category, color, rack..."
                  placeholderTextColor="#928EB2"
                  className="w-full text-xs font-semibold text-spaceCadet-900 py-1"
                />
                {searchQuery ? (
                  <AnimatedPressable
                    onPress={() => setSearchQuery('')}
                    className="w-7 h-7 rounded-xl bg-lavender-100 flex items-center justify-center absolute right-3 border border-lavender-200"
                  >
                    <X size={14} color="#231F48" />
                  </AnimatedPressable>
                ) : (
                  <AnimatedPressable
                    onPress={() => setShowFilters((v) => !v)}
                    className="w-7 h-7 rounded-xl bg-[#F8F7FC] flex items-center justify-center absolute right-3 border border-lavender-200"
                  >
                    <SlidersHorizontal size={14} color="#231F48" />
                  </AnimatedPressable>
                )}
              </View>

              {(categoryImages.length > 0 || showFilters || waSyncStatusByProduct.size > 0) && (
                <View className="bg-white rounded-3xl px-4 py-3.5 border border-lavender-200 shadow-sm">
                  {/* WhatsApp sync status legend */}
                  {waSyncStatusByProduct.size > 0 && (
                    <View className="flex-row items-center gap-3 mb-2.5">
                      <Text className="text-[10px] font-extrabold text-heliotrope-500 uppercase tracking-wide">
                        WhatsApp sync
                      </Text>
                      <LegendDot color="#059669" label="Synced" />
                      <LegendDot color="#d97706" label="Pending" />
                      <LegendDot color="#dc2626" label="Error" />
                    </View>
                  )}
                  {/* Category shortcuts */}
                  {categoryImages.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 px-4">
                      <View className="flex-row gap-3 py-1">
                        {categoryImages.map(({ category, photoUrl }) => {
                          const isActive = filterCategory === category
                          return (
                            <AnimatedPressable
                              key={category}
                              onPress={() => setFilterCategory(isActive ? null : category)}
                              className="items-center gap-1.5"
                              style={{ width: 68 }}
                            >
                              <View
                                className={`w-16 h-16 rounded-3xl overflow-hidden bg-lavender-100 border-2 ${
                                  isActive ? 'border-fuchsia-500' : 'border-lavender-200'
                                }`}
                              >
                                {photoUrl ? (
                                  <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                ) : (
                                  <View className="flex-1 items-center justify-center">
                                    <Text className="text-heliotrope-400 text-xl">👗</Text>
                                  </View>
                                )}
                              </View>
                              <Text
                                className={`text-[10px] text-center font-bold ${isActive ? 'text-fuchsia-600' : 'text-spaceCadet-900'}`}
                                numberOfLines={1}
                              >
                                {category}
                              </Text>
                            </AnimatedPressable>
                          )
                        })}
                      </View>
                    </ScrollView>
                  )}

                {/* Filter panel — Category, Price, Color */}
                {showFilters && (
                  <View className={categoryImages.length > 0 ? 'mt-3 pt-3 border-t border-lavender-200' : ''}>
                    <View className="flex-row items-center justify-between mb-2">
                      <Text className="text-xs font-bold text-heliotrope-600 uppercase tracking-wide">Filters</Text>
                      <View className="flex-row items-center gap-3">
                        {activeFilterCount > 0 && (
                          <AnimatedPressable onPress={clearFilters}>
                            <Text className="text-fuchsia-600 text-xs font-bold">Clear all</Text>
                          </AnimatedPressable>
                        )}
                        <AnimatedPressable onPress={() => setShowFilters(false)} accessibilityLabel="Close filters" accessibilityRole="button">
                          <X size={16} color="#6B4773" />
                        </AnimatedPressable>
                      </View>
                    </View>
                    <ChipRow label="Category" options={categoryOptions} selected={filterCategory} onSelect={setFilterCategory} />
                    <ChipRow label="Price"
                      options={PRICE_BUCKETS.map((b) => b.label)}
                      selected={filterPrice}
                      onSelect={setFilterPrice}
                    />
                    <ChipRow label="Color" options={colorOptions} selected={filterColor} onSelect={setFilterColor} />
                    {/* New Arrivals — derived flag, auto-expires at 30 days */}
                    <View className="mb-2.5">
                      <Text className="text-xs font-bold text-heliotrope-600 mb-1.5 uppercase tracking-wide">Age</Text>
                      <AnimatedPressable
                        onPress={() => setFilterNewArrival((v) => !v)}
                        className={`px-3.5 py-1.5 rounded-full border flex-row items-center gap-1 self-start ${
                          filterNewArrival ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'bg-white border-lavender-200'
                        }`}
                      >
                        {filterNewArrival && <Text className="text-white text-xs font-bold">✓ </Text>}
                        <Text className={`text-xs font-bold ${filterNewArrival ? 'text-white' : 'text-spaceCadet-900'}`}>
                          New Arrivals (30d)
                        </Text>
                      </AnimatedPressable>
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        }
        // ── Performance props ──
          windowSize={7}
          maxToRenderPerBatch={10}
          removeClippedSubviews={true}
          initialNumToRender={6}
        />
      )}
      {/* Selection action bar — appears only while items are selected */}
      {selectionMode && (
        <View
          className="absolute bottom-4 left-4 right-4 bg-spaceCadet-900 rounded-3xl px-5 py-3.5 flex-row items-center justify-between shadow-lg border border-white/20"
          style={{
            shadowColor: '#231F48',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 12,
            elevation: 8,
            zIndex: 50,
          }}
        >
          <AnimatedPressable onPress={clearSelection} disabled={deleting}>
            <Text className="text-lavender-200 text-xs font-bold uppercase tracking-wider">Cancel</Text>
          </AnimatedPressable>
          <Text className="text-white text-sm font-bold font-marcellus">{selectedIds.size} Selected</Text>
          <AnimatedPressable
            onPress={handleBulkDelete}
            disabled={deleting}
            className="flex-row items-center gap-1.5 bg-red-600 px-3.5 py-2 rounded-2xl"
          >
            {deleting ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Trash2 size={14} color="white" />
                <Text className="text-white text-xs font-bold">Delete</Text>
              </>
            )}
          </AnimatedPressable>
        </View>
      )}
    </View>
  )
}

// ── F7 legend dot ─────────────────────────────────────────────────
function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <View className="w-2 h-2 rounded-full border border-white" style={{ backgroundColor: color }} />
      <Text className="text-[10px] text-sand-500">{label}</Text>
    </View>
  )
}
