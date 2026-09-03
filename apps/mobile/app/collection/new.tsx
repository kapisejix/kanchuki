import { useState } from 'react'
import { formatPriceRange } from '@kanchuki/shared'
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
    <View className="flex-1 bg-[#F8F7FC]">
      <View
        className="flex-row items-center px-5 pb-3 bg-white border-b border-lavender-200"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <AnimatedPressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={20} color="#231F48" />
        </AnimatedPressable>
        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-base font-bold text-spaceCadet-900 ml-3"
        >
          New Collection
        </Text>
      </View>
      <View className="flex-1">
        <View className="bg-white px-4 py-3.5 border-b border-lavender-200 gap-3">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Collection title (e.g. Wedding Specials)"
            placeholderTextColor="#928EB2"
            className="bg-lavender-50 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 border border-lavender-200"
            maxLength={200}
          />
          <View className="flex-row gap-2.5">
            {EXPIRY_OPTIONS.map((d) => {
              const active = expiresDays === d
              return (
                <AnimatedPressable
                  key={d}
                  onPress={() => setExpiresDays(d)}
                  // #8: className toggles, not inline style — inline style on
                  // css-interop components drops the background (white on white).
                  className={`flex-1 py-2.5 rounded-2xl border items-center justify-center ${
                    active
                      ? 'bg-spaceCadet-900 border-spaceCadet-900'
                      : 'bg-white border-lavender-200'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold text-center ${
                      active ? 'text-white' : 'text-spaceCadet-900'
                    }`}
                  >
                    {d} days
                  </Text>
                </AnimatedPressable>
              )
            })}
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
            contentContainerStyle={{ padding: 14, gap: 12 }}
            columnWrapperStyle={{ gap: 12 }}
            renderItem={({ item }) => {
              const isSelected = selected.has(item.id)
              return (
                <ProductCard
                  imageUrl={item.primary_photo_url}
                  onPress={() => toggle(item.id)}
                  selected={isSelected}
                  elevation={isSelected ? 4 : 1}
                  imageHeight={144}
                  style={isSelected ? { borderWidth: 2, borderColor: '#BB3F95' } : undefined}
                  placeholderIcon="📷"
                  footer={
                    <View className="p-2 gap-0.5">
                      <Text className="text-xs font-semibold text-spaceCadet-900 truncate" numberOfLines={1}>
                        {item.category ?? 'Product'} · {item.primary_color ?? '—'}
                      </Text>
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                        className="text-xs font-bold text-spaceCadet-900"
                      >
                        {formatPriceRange(item.price_min, item.price_max)}
                      </Text>
                    </View>
                  }
                />
              )
            }}
            ListEmptyComponent={
              <Text className="text-heliotrope-500 text-sm font-medium text-center mt-16">
                No available products. Add products first.
              </Text>
            }
          />
        )}

        <View
          className="bg-white px-4 pt-3.5 border-t border-lavender-200"
          style={{ paddingBottom: 14 + insets.bottom }}
        >
          <GradientButton
            label={`Create & Share (${selected.size} selected)`}
            disabled={!canCreate}
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
          {!canCreate && !create.isPending && (
            <Text className="text-xs text-heliotrope-500 text-center mt-2 font-medium">
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
