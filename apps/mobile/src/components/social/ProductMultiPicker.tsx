import { useQuery } from '@tanstack/react-query'
import { formatPriceRange } from '@kanchuki/shared'
import { Check, Plus, Search } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Image, Text, TextInput, View } from 'react-native'
import { productApi } from '../../lib/api'
import { useTheme } from '../../lib/theme'
import { AnimatedPressable } from '../AnimatedPressable'
import type { ComposeProduct } from './types'

export const CAROUSEL_CAP = 10 // IG hard cap (R-16)

/** Build the picker's minimal product shape from a list or detail payload. */
export function toComposeProduct(p: {
  id: string
  name: string | null
  primary_photo_url: string | null
  price_min: number | null
  price_max: number | null
}): ComposeProduct {
  return {
    id: p.id,
    name: p.name,
    primary_photo_url: p.primary_photo_url,
    price_min: p.price_min,
    price_max: p.price_max,
  }
}

export function ProductMultiPicker({
  maxItems,
  selected,
  onToggle,
  selectedOrder,
}: {
  maxItems: number // 1 for Single, 2..10 for Carousel
  selected: ComposeProduct[]
  onToggle: (product: ComposeProduct) => void
  /** id → ordinal, so a carousel previews in pick order, not API order. */
  selectedOrder: (productId: string) => number | null
}) {
  const { colors } = useTheme()
  const [query, setQuery] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'social-picker'],
    queryFn: () => productApi.list({ status: 'AVAILABLE', limit: 200 }),
    staleTime: 30_000,
  })

  const all = useMemo<ComposeProduct[]>(
    () =>
      ((data as { data: unknown[] } | undefined)?.data ?? [])
        .map((p) => toComposeProduct(p as Parameters<typeof toComposeProduct>[0]))
        .filter((p) => p.name || p.primary_photo_url),
    [data],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      (p) =>
        (p.name ?? '').toLowerCase().includes(q) ||
        String(p.price_min ?? '').includes(q.replace(/[^0-9]/g, '')),
    )
  }, [all, query])

  const atCap = maxItems > 1 && selected.length >= maxItems

  return (
    <View>
      <View className="flex-row items-center bg-white rounded-2xl border border-sand-100 px-3.5 mb-3">
        <Search size={15} color={colors.sand[400]} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={maxItems === 1 ? 'Search products…' : 'Search products to add…'}
          placeholderTextColor={colors.sand[400]}
          className="flex-1 py-3 pl-2.5 text-sm text-sand-900"
          accessibilityLabel="Search products"
        />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.sand[400]} className="py-8" />
      ) : filtered.length === 0 ? (
        <Text className="text-xs text-sand-400 py-6 text-center">
          {query ? 'No products match that search' : 'No available products yet'}
        </Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ItemSeparatorComponent={() => <View className="h-2" />}
          renderItem={({ item }) => {
            const isSelected = selected.some((s) => s.id === item.id)
            const order = selectedOrder(item.id)
            const disabled = !isSelected && atCap
            return (
              <AnimatedPressable
                onPress={() => onToggle(item)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled }}
                accessibilityLabel={item.name ?? 'Untitled product'}
                className={`flex-row items-center bg-white rounded-2xl border px-3 py-2.5 ${
                  isSelected ? 'border-ink-600' : disabled ? 'border-sand-100 opacity-50' : 'border-sand-100'
                }`}
              >
                <View className="w-11 h-11 rounded-xl bg-sand-100 overflow-hidden mr-3">
                  {item.primary_photo_url ? (
                    <Image source={{ uri: item.primary_photo_url }} className="w-full h-full" resizeMode="cover" />
                  ) : null}
                </View>
                <View className="flex-1 mr-2">
                  <Text className="text-sm font-semibold text-sand-900" numberOfLines={1}>
                    {item.name ?? 'Untitled product'}
                  </Text>
                  <Text className="text-[11px] text-sand-500">
                    {formatPriceRange(item.price_min, item.price_max)}
                  </Text>
                </View>
                {isSelected ? (
                  <View className="w-6 h-6 rounded-full bg-ink-600 items-center justify-center">
                    {order !== null && maxItems > 1 ? (
                      <Text className="text-white text-[11px] font-bold">{order + 1}</Text>
                    ) : (
                      <Check size={13} color="#fff" />
                    )}
                  </View>
                ) : (
                  <Plus size={17} color={colors.sand[500]} />
                )}
              </AnimatedPressable>
            )
          }}
        />
      )}
    </View>
  )
}
