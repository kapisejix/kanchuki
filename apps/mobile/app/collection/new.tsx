import { useState } from 'react'
import { formatPriceRange, COLORS } from '@kanchuki/shared'
import {
  View,
  Text,
  FlatList,
  TextInput,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import ProductCard from '../../src/components/ProductCard'
import { ProductGridSkeleton } from '../../src/components/Skeleton'
import { useGridColumns } from '../../src/hooks/useIsTablet'
import { GradientButton } from '../../src/components/GradientButton'
import { productApi, collectionApi } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

type Product = {
  id: string
  category: string | null
  primary_color: string | null
  price_min: number | null
  price_max: number | null
  status: string
  primary_photo_url: string | null
}

const EXPIRY_OPTIONS = [7, 30, 90] as const

export default function NewCollectionScreen() {
  const columns = useGridColumns()
  const { primaryColor, colors } = useTheme()
  const [title, setTitle] = useState('')
  const [expiresDays, setExpiresDays] = useState<number>(30)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'list', 'available'],
    queryFn: () => productApi.list({ status: 'AVAILABLE', limit: 50 }),
  })
  const products = ((data as { data: Product[] } | undefined)?.data ?? [])

  const create = useMutation({
    mutationFn: () =>
      collectionApi.create({
        title: title.trim(),
        product_ids: [...selected],
        expires_days: expiresDays,
      }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['collections'] })
      router.replace(`/collection/${res.data.id as string}`)
    },
    onError: (err: Error) => showError(err, 'Please try again.', 'Could not create collection'),
  })

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 50) next.add(id)
      return next
    })
  }

  const canCreate = title.trim().length > 0 && selected.size > 0 && !create.isPending

  return (
    <View className="flex-1 bg-ink-50">
      <View
        className="flex-row items-center px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <AnimatedPressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
          <ChevronLeft size={24} color={colors.sand[700]} />
        </AnimatedPressable>
        <Text className="text-base font-bold text-sand-900 ml-3">New Collection</Text>
      </View>
      <View className="flex-1">
        <View className="bg-white px-4 py-3 border-b border-sand-100 gap-3">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Collection title (e.g. Wedding Specials)"
            placeholderTextColor={colors.sand[400]}
            className="bg-sand-100 rounded-xl px-3 py-2.5 text-sm text-sand-900"
            maxLength={200}
          />
          <View className="flex-row gap-2">
            {EXPIRY_OPTIONS.map((d) => (
              <AnimatedPressable
                key={d}
                onPress={() => setExpiresDays(d)}
                className={`px-3 py-1.5 rounded-full border ${
                  expiresDays === d
                    ? 'bg-ink-600 border-ink-600'
                    : 'bg-white border-sand-200'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    expiresDays === d ? 'text-white' : 'text-sand-600'
                  }`}
                >
                  {d} days
                </Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>

        {isLoading ? (
          <ProductGridSkeleton />
        ) : (
          <FlatList
            key={columns}
            data={products}
            keyExtractor={(item) => item.id}
            numColumns={columns}
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
          <GradientButton
            label={`Create & Share (${selected.size} selected)`}
            disabled={!canCreate}
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
          {!canCreate && !create.isPending && (
            <Text className="text-xs text-sand-400 text-center mt-2">
              {title.trim().length === 0
                ? 'Enter a title above to continue'
                : selected.size === 0
                  ? 'Select at least 1 product'
                  : ''}
            </Text>
          )}
        </View>
      </View>
    </View>
  )
}
