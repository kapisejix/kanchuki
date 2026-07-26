import { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft } from 'lucide-react-native'
import ProductCard from '../../src/components/ProductCard'
import { ProductGridSkeleton } from '../../src/components/Skeleton'
import { productApi, collectionApi } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { formatPriceRange } from '@kanchuki/shared'

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
    <View className="flex-1 bg-cyan-50">
      <View
        className="flex-row items-center px-4 pb-4 bg-white border-b border-gray-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900 ml-3">New Collection</Text>
      </View>
      <View className="flex-1">
        <View className="bg-white px-4 py-3 border-b border-gray-100 gap-3">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Collection title (e.g. Wedding Specials)"
            placeholderTextColor="#9CA3AF"
            className="bg-gray-100 rounded-xl px-3 py-2.5 text-sm text-gray-900"
            maxLength={200}
          />
          <View className="flex-row gap-2">
            {EXPIRY_OPTIONS.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setExpiresDays(d)}
                className={`px-3 py-1.5 rounded-full border ${
                  expiresDays === d
                    ? 'bg-cyan-600 border-cyan-600'
                    : 'bg-white border-gray-200'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    expiresDays === d ? 'text-white' : 'text-gray-600'
                  }`}
                >
                  {d} days
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {isLoading ? (
          <ProductGridSkeleton />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            numColumns={2}
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
                  style={isSelected ? { borderWidth: 2, borderColor: '#0891B2' } : undefined}
                  placeholderIcon="📷"
                  footer={
                    <View className="p-2.5">
                      <Text className="text-xs font-semibold text-gray-900" numberOfLines={1}>
                        {item.category ?? 'Product'} · {item.primary_color ?? '—'}
                      </Text>
                      <Text className="text-xs text-gray-500 mt-0.5">
                        {formatPriceRange(item.price_min, item.price_max)}
                      </Text>
                    </View>
                  }
                />
              )
            }}
            ListEmptyComponent={
              <Text className="text-gray-400 text-sm text-center mt-16">
                No available products. Add products first.
              </Text>
            }
          />
        )}

        <View
          className="bg-white px-4 pt-3 border-t border-gray-100"
          style={{ paddingBottom: 12 + insets.bottom }}
        >
          <TouchableOpacity
            disabled={!canCreate}
            onPress={() => create.mutate()}
            className={`py-3.5 rounded-xl items-center ${
              canCreate ? 'bg-cyan-600' : 'bg-gray-200'
            }`}
          >
            <Text className={`font-semibold ${canCreate ? 'text-white' : 'text-gray-400'}`}>
              {create.isPending
                ? 'Creating…'
                : `Create & Share (${selected.size} selected)`}
            </Text>
          </TouchableOpacity>
          {!canCreate && !create.isPending && (
            <Text className="text-xs text-gray-400 text-center mt-2">
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
