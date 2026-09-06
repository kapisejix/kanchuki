import { formatPriceRange } from '@kanchuki/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, RefreshCw, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Text, TextInput, View } from 'react-native';
import { productApi } from '../../lib/api';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../AnimatedPressable';
import { CAROUSEL_CAP, type ComposeProduct } from './types';

export { CAROUSEL_CAP };

/** Build the picker's minimal product shape from a list or detail payload. */
export function toComposeProduct(p: {
  id: string;
  name: string | null;
  sku?: string | null;
  primary_photo_url: string | null;
  price_min: number | null;
  price_max: number | null;
}): ComposeProduct {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku ?? null,
    primary_photo_url: p.primary_photo_url,
    price_min: p.price_min,
    price_max: p.price_max,
  };
}

/**
 * Grid product picker for the Create Post composer. Shows every AVAILABLE
 * product up-front (no search required); the search box is an optional filter
 * over name + SKU. Tap to select — 1 for a Single post, up to CAROUSEL_CAP for
 * a Carousel. A failed load says so instead of rendering a silent empty grid.
 */
export function ProductGridPicker({
  maxItems,
  selected,
  onToggle,
  selectedOrder,
}: {
  maxItems: number; // 1 for Single, 2..10 for Carousel
  selected: ComposeProduct[];
  onToggle: (product: ComposeProduct) => void;
  /** id → ordinal, so a carousel previews in pick order, not API order. */
  selectedOrder: (productId: string) => number | null;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['products', 'social-picker'],
    // API caps limit at 100 (ListProductsQuerySchema). Covers every current
    // store; wire the /search endpoint here if a catalog outgrows it.
    queryFn: () => productApi.list({ status: 'AVAILABLE', limit: 100 }),
    staleTime: 30_000,
  });

  const all = useMemo<ComposeProduct[]>(
    () =>
      ((data as { data: unknown[] } | undefined)?.data ?? [])
        .map((p) => toComposeProduct(p as Parameters<typeof toComposeProduct>[0]))
        .filter((p) => p.name || p.primary_photo_url),
    [data],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    const digits = q.replace(/[^0-9]/g, '');
    return all.filter(
      (p) =>
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (digits.length > 0 && String(p.price_min ?? '').includes(digits)),
    );
  }, [all, query]);

  const atCap = maxItems > 1 && selected.length >= maxItems;

  return (
    <View>
      <View className="flex-row items-center bg-white rounded-2xl border border-sand-100 px-3.5 mb-3">
        <Search size={15} color={colors.sand[400]} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Filter by name or SKU…"
          placeholderTextColor={colors.sand[400]}
          className="flex-1 py-3 pl-2.5 text-sm text-sand-900"
          accessibilityLabel="Filter products"
          autoCapitalize="none"
        />
      </View>

      {isLoading ? (
        <ActivityIndicator color={colors.sand[400]} className="py-8" />
      ) : isError ? (
        <AnimatedPressable
          onPress={() => void refetch()}
          accessibilityRole="button"
          accessibilityLabel="Retry loading products"
          className="flex-row items-center justify-center gap-2 bg-white rounded-2xl border border-sand-100 py-6"
        >
          <RefreshCw size={15} color={colors.rust[500]} />
          <Text className="text-xs text-rust-600 font-semibold">
            Couldn't load products — tap to retry
          </Text>
        </AnimatedPressable>
      ) : filtered.length === 0 ? (
        <Text className="text-xs text-sand-400 py-6 text-center">
          {all.length === 0 ? 'No available products yet' : 'No products match that filter'}
        </Text>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={3}
          scrollEnabled={false}
          columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
          renderItem={({ item }) => {
            const isSelected = selected.some((s) => s.id === item.id);
            const order = selectedOrder(item.id);
            const disabled = !isSelected && atCap;
            return (
              <AnimatedPressable
                onPress={() => onToggle(item)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled }}
                accessibilityLabel={item.name ?? item.sku ?? 'Untitled product'}
                className={`flex-1 rounded-2xl border overflow-hidden bg-white ${
                  isSelected
                    ? 'border-ink-600'
                    : disabled
                      ? 'border-sand-100 opacity-40'
                      : 'border-sand-100'
                }`}
              >
                <View className="aspect-square bg-sand-100">
                  {item.primary_photo_url ? (
                    <Image
                      source={{ uri: item.primary_photo_url }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  ) : null}
                  {isSelected ? (
                    <View className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-ink-600 items-center justify-center">
                      {order !== null && maxItems > 1 ? (
                        <Text className="text-white text-[11px] font-bold">{order + 1}</Text>
                      ) : (
                        <Check size={13} color="#fff" />
                      )}
                    </View>
                  ) : null}
                </View>
                <View className="px-2 py-1.5">
                  <Text className="text-[11px] font-semibold text-sand-900" numberOfLines={1}>
                    {item.name ?? item.sku ?? 'Untitled'}
                  </Text>
                  <Text className="text-[10px] text-sand-500" numberOfLines={1}>
                    {formatPriceRange(item.price_min, item.price_max)}
                  </Text>
                </View>
              </AnimatedPressable>
            );
          }}
          ListFooterComponent={
            isFetching && !isLoading ? (
              <ActivityIndicator color={colors.sand[300]} className="py-3" />
            ) : null
          }
        />
      )}
    </View>
  );
}
