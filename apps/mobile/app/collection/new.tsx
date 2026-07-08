import { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  Share,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { Stack, router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react-native'
import { productApi, collectionApi } from '../../src/lib/api'
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
      await Share.share({
        message: `Check out ${title.trim()}: ${res.data.url}`,
        url: res.data.url,
      })
      router.back()
    },
    onError: (err: Error) => Alert.alert('Could not create collection', err.message),
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
    <>
      <Stack.Screen options={{ title: 'New Collection' }} />
      <View className="flex-1 bg-gray-50">
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
                    ? 'bg-violet-600 border-violet-600'
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
          <ActivityIndicator className="mt-16" color="#7C3AED" />
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
                <TouchableOpacity
                  onPress={() => toggle(item.id)}
                  className={`flex-1 bg-white rounded-2xl overflow-hidden border-2 ${
                    isSelected ? 'border-violet-600' : 'border-gray-100'
                  }`}
                >
                  {item.primary_photo_url ? (
                    <Image
                      source={{ uri: item.primary_photo_url }}
                      className="w-full h-36 bg-gray-100"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="w-full h-36 bg-gray-100" />
                  )}
                  {isSelected && (
                    <View className="absolute top-2 right-2 w-6 h-6 bg-violet-600 rounded-full items-center justify-center">
                      <Check size={14} color="white" />
                    </View>
                  )}
                  <View className="p-2.5">
                    <Text className="text-xs font-semibold text-gray-900" numberOfLines={1}>
                      {item.category ?? 'Product'} · {item.primary_color ?? '—'}
                    </Text>
                    <Text className="text-xs text-gray-500 mt-0.5">
                      {formatPriceRange(item.price_min, item.price_max)}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            }}
            ListEmptyComponent={
              <Text className="text-gray-400 text-sm text-center mt-16">
                No available products. Add products first.
              </Text>
            }
          />
        )}

        <View className="bg-white px-4 py-3 border-t border-gray-100">
          <TouchableOpacity
            disabled={!canCreate}
            onPress={() => create.mutate()}
            className={`py-3.5 rounded-xl items-center ${
              canCreate ? 'bg-violet-600' : 'bg-gray-200'
            }`}
          >
            <Text className={`font-semibold ${canCreate ? 'text-white' : 'text-gray-400'}`}>
              {create.isPending
                ? 'Creating…'
                : `Create & Share (${selected.size} selected)`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  )
}
