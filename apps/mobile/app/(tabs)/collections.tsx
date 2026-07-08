import { useCallback, memo } from 'react'
import { View, Text, FlatList, TouchableOpacity, Share, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { Plus, Eye, MessageCircle, Link2, Clock } from 'lucide-react-native'
import { collectionApi } from '../../src/lib/api'

type Collection = {
  id: string
  title: string
  slug: string
  url: string
  status: string
  view_count: number
  enquiry_count: number
  product_count: number
  expires_at: string | null
  created_at: string
}

function daysUntil(dateStr: string | null): string {
  if (!dateStr) return 'No expiry'
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
  if (diff < 0) return 'Expired'
  if (diff === 0) return 'Expires today'
  return `${diff}d left`
}

// ── Memoized Collection Card ───────────────────────────────────────

const CollectionCard = memo(function CollectionCard({
  item,
  onPress,
  onShare,
}: {
  item: Collection
  onPress: () => void
  onShare: () => void
}) {
  return (
    <TouchableOpacity onPress={onPress} className="bg-white rounded-2xl p-4 border border-gray-100">
      {/* Title + status */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text className="text-sm font-bold text-gray-900">{item.title}</Text>
          <Text className="text-xs text-gray-400 mt-0.5">{item.product_count} products</Text>
        </View>
        <View
          className={`px-2 py-0.5 rounded-full ${
            item.status === 'ACTIVE' ? 'bg-green-100' : 'bg-gray-100'
          }`}
        >
          <Text
            className={`text-xs font-medium ${
              item.status === 'ACTIVE' ? 'text-green-700' : 'text-gray-500'
            }`}
          >
            {item.status}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View className="flex-row gap-4 mb-3">
        <View className="flex-row items-center gap-1">
          <Eye size={14} color="#9CA3AF" />
          <Text className="text-xs text-gray-500">{item.view_count} views</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <MessageCircle size={14} color="#9CA3AF" />
          <Text className="text-xs text-gray-500">{item.enquiry_count} enquiries</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Clock size={14} color="#9CA3AF" />
          <Text className="text-xs text-gray-400">{daysUntil(item.expires_at)}</Text>
        </View>
      </View>

      {/* Share button */}
      {item.status === 'ACTIVE' && (
        <TouchableOpacity
          onPress={onShare}
          className="flex-row items-center justify-center gap-2 bg-green-50 border border-green-100 py-2.5 rounded-xl"
        >
          <Link2 size={14} color="#16A34A" />
          <Text className="text-green-700 text-sm font-semibold">Share on WhatsApp</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  )
})

// ── Collections Screen ─────────────────────────────────────────────

export default function CollectionsScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['collections'],
    queryFn: () => collectionApi.list(),
    staleTime: 30_000,
    gcTime: 300_000,
  })

  const collections = ((data as { data: Collection[] } | undefined)?.data ?? [])

  const handleShare = useCallback(
    async (collection: Collection) => {
      await Share.share({
        message: `Check out ${collection.title}: ${collection.url}`,
        url: collection.url,
      })
    },
    [],
  )

  const renderItem = useCallback(
    ({ item }: { item: Collection }) => (
      <CollectionCard
        item={item}
        onPress={() =>
          router.push({ pathname: '/collection/[id]', params: { id: item.id } })
        }
        onShare={() => void handleShare(item)}
      />
    ),
    [handleShare],
  )

  const keyExtractor = useCallback((item: Collection) => item.id, [])

  const listEmpty = useCallback(
    () => (
      <View className="items-center py-16">
        <Link2 size={40} color="#D1D5DB" />
        <Text className="text-gray-400 text-sm mt-4 text-center">
          No collections yet.{'\n'}Create one to share products with customers.
        </Text>
        <TouchableOpacity
          onPress={() => router.push('/collection/new')}
          className="mt-4 bg-violet-600 px-5 py-2.5 rounded-xl"
        >
          <Text className="text-white text-sm font-semibold">Create Collection</Text>
        </TouchableOpacity>
      </View>
    ),
    [],
  )

  return (
    <View className="flex-1 bg-gray-50">
      {isLoading && collections.length === 0 ? (
        <ActivityIndicator className="mt-16" color="#7C3AED" />
      ) : (
        <FlatList
          data={collections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }}
          ListEmptyComponent={listEmpty}
          // ── Performance props ──
          windowSize={5}
          maxToRenderPerBatch={10}
          removeClippedSubviews={true}
          initialNumToRender={8}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        onPress={() => router.push('/collection/new')}
        className="absolute bottom-6 right-4 w-14 h-14 bg-violet-600 rounded-full items-center justify-center shadow-lg"
        style={{ elevation: 6 }}
      >
        <Plus size={24} color="white" />
      </TouchableOpacity>
    </View>
  )
}
