import { View, Text, ScrollView, TouchableOpacity, Image, Share, ActivityIndicator } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Eye, Heart, MessageCircle, Link2, Users } from 'lucide-react-native'
import { collectionApi } from '../../src/lib/api'

type CollectionDetail = {
  id: string
  title: string
  description: string | null
  slug: string
  status: string
  url: string
  view_count: number
  unique_viewer_count: number
  enquiry_count: number
  favorite_count: number
  expires_at: string | null
  products: {
    id: string
    product: {
      id: string
      category: string | null
      primary_color: string | null
      photos: { url: string }[]
    }
  }[]
  enquiries: {
    id: string
    customer_name: string | null
    customer_phone: string | null
    message: string | null
    status: string
    created_at: string
  }[]
}

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  const { data, isLoading } = useQuery({
    queryKey: ['collections', id],
    queryFn: () => collectionApi.get(id),
    enabled: !!id,
  })
  const collection = (data as { data: CollectionDetail } | undefined)?.data

  if (isLoading || !collection) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator color="#7C3AED" />
      </View>
    )
  }

  const handleShare = () =>
    void Share.share({
      message: `Check out ${collection.title}: ${collection.url}`,
      url: collection.url,
    })

  return (
    <>
      <Stack.Screen options={{ title: collection.title }} />
      <ScrollView className="flex-1 bg-gray-50">
        {/* Stats */}
        <View className="flex-row flex-wrap px-4 pt-4 gap-3">
          <Stat icon={<Eye size={16} color="#7C3AED" />} label="Views" value={collection.view_count} />
          <Stat icon={<Users size={16} color="#3B82F6" />} label="Visitors" value={collection.unique_viewer_count} />
          <Stat icon={<Heart size={16} color="#EF4444" />} label="Favorites" value={collection.favorite_count} />
          <Stat icon={<MessageCircle size={16} color="#10B981" />} label="Enquiries" value={collection.enquiry_count} />
        </View>

        {/* Share */}
        {collection.status === 'ACTIVE' && (
          <View className="px-4 pt-4">
            <TouchableOpacity
              onPress={handleShare}
              className="flex-row items-center justify-center gap-2 bg-green-600 py-3 rounded-xl"
            >
              <Link2 size={16} color="white" />
              <Text className="text-white font-semibold">Share on WhatsApp</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Enquiries */}
        {collection.enquiries.length > 0 && (
          <View className="px-4 pt-5">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Enquiries
            </Text>
            <View className="gap-2">
              {collection.enquiries.map((e) => (
                <View key={e.id} className="bg-white rounded-xl p-3 border border-gray-100">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-sm font-semibold text-gray-900">
                      {e.customer_name ?? e.customer_phone ?? 'Anonymous'}
                    </Text>
                    <Text className="text-xs text-gray-400">
                      {new Date(e.created_at).toLocaleDateString('en-IN')}
                    </Text>
                  </View>
                  {e.message && (
                    <Text className="text-sm text-gray-600 mt-1">{e.message}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Products */}
        <View className="px-4 pt-5 pb-8">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Products ({collection.products.length})
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {collection.products.map((cp) => (
              <View key={cp.id} className="w-[31%] bg-white rounded-xl overflow-hidden border border-gray-100">
                {cp.product.photos[0]?.url ? (
                  <Image
                    source={{ uri: cp.product.photos[0].url }}
                    className="w-full h-24 bg-gray-100"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="w-full h-24 bg-gray-100" />
                )}
                <Text className="text-[10px] text-gray-600 p-1.5" numberOfLines={1}>
                  {cp.product.category ?? 'Product'} · {cp.product.primary_color ?? '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <View className="bg-white rounded-xl p-3 border border-gray-100 flex-1 min-w-[45%]">
      <View className="flex-row items-center gap-1.5">
        {icon}
        <Text className="text-lg font-bold text-gray-900">{value.toLocaleString('en-IN')}</Text>
      </View>
      <Text className="text-xs text-gray-500 mt-0.5">{label}</Text>
    </View>
  )
}
