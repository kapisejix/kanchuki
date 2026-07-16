import { useCallback, memo, useState, useEffect } from 'react'
import { View, Text, FlatList, TouchableOpacity, Share, ActivityIndicator, Alert, Modal, TextInput } from 'react-native'
import { router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, MessageCircle, Link2, Clock, Edit, Trash2 } from 'lucide-react-native'
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

// ── Edit Collection Modal ──────────────────────────────────────────

function EditCollectionModal({
  visible,
  collection,
  onClose,
  onSaved,
}: {
  visible: boolean
  collection: Collection | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(collection?.title ?? '')
  const [expiryDays, setExpiryDays] = useState('30')
  const [saving, setSaving] = useState(false)

  // Sync form fields when modal opens with a different collection
  useEffect(() => {
    if (visible && collection) {
      setTitle(collection.title)
      // Calculate remaining days from expires_at
      if (collection.expires_at) {
        const remaining = Math.ceil(
          (new Date(collection.expires_at).getTime() - Date.now()) / 86_400_000,
        )
        setExpiryDays(String(Math.max(1, remaining)))
      } else {
        setExpiryDays('30')
      }
    }
  }, [visible, collection])

  const handleSave = async () => {
    if (!collection || !title.trim()) return
    setSaving(true)
    try {
      await collectionApi.update(collection.id, {
        title: title.trim(),
        ...(expiryDays ? { expires_days: parseInt(expiryDays, 10) } : {}),
      })
      onSaved()
      onClose()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-white rounded-3xl w-full p-6 gap-4">
          <Text className="text-lg font-bold text-gray-900">Edit Collection</Text>

          <View>
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Title
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Collection name"
              className="bg-gray-50 px-4 py-3 rounded-xl text-sm text-gray-900"
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
          </View>

          <View>
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Expires in (days)
            </Text>
            <TextInput
              value={expiryDays}
              onChangeText={setExpiryDays}
              placeholder="30"
              keyboardType="numeric"
              className="bg-gray-50 px-4 py-3 rounded-xl text-sm text-gray-900"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View className="flex-row gap-3 mt-2">
            <TouchableOpacity
              onPress={onClose}
              disabled={saving}
              className="flex-1 bg-gray-100 py-3.5 rounded-2xl items-center"
            >
              <Text className="text-gray-700 font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleSave()}
              disabled={saving || !title.trim()}
              className="flex-1 bg-cyan-600 py-3.5 rounded-2xl items-center"
            >
              {saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-semibold">Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ── Memoized Collection Card ───────────────────────────────────────

const CollectionCard = memo(function CollectionCard({
  item,
  onPress,
  onShare,
  onEdit,
  onDelete,
}: {
  item: Collection
  onPress: () => void
  onShare: () => void
  onEdit: () => void
  onDelete: () => void
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

      {/* Action buttons row */}
      <View className="flex-row gap-2">
        {/* Share */}
        {item.status === 'ACTIVE' && (
          <TouchableOpacity
            onPress={onShare}
            className="flex-1 flex-row items-center justify-center gap-2 bg-green-50 border border-green-100 py-2.5 rounded-xl"
          >
            <Link2 size={14} color="#16A34A" />
            <Text className="text-green-700 text-sm font-semibold">Share</Text>
          </TouchableOpacity>
        )}

        {/* Edit */}
        <TouchableOpacity
          onPress={onEdit}
          className="flex-row items-center justify-center gap-1.5 bg-blue-50 border border-blue-100 px-3 py-2.5 rounded-xl"
        >
          <Edit size={14} color="#2563EB" />
        </TouchableOpacity>

        {/* Delete */}
        <TouchableOpacity
          onPress={onDelete}
          className="flex-row items-center justify-center bg-red-50 border border-red-100 px-3 py-2.5 rounded-xl"
        >
          <Trash2 size={14} color="#DC2626" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
})

// ── Collections Screen ─────────────────────────────────────────────

export default function CollectionsScreen() {
  const queryClient = useQueryClient()
  const [editTarget, setEditTarget] = useState<Collection | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)

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

  const handleEdit = useCallback((collection: Collection) => {
    setEditTarget(collection)
    setShowEditModal(true)
  }, [])

  const handleDelete = useCallback((collection: Collection) => {
    Alert.alert(
      'Delete Collection',
      `Permanently delete "${collection.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await collectionApi.delete(collection.id)
              void queryClient.invalidateQueries({ queryKey: ['collections'] })
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete')
            }
          },
        },
      ],
    )
  }, [queryClient])

  const handleEditSaved = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['collections'] })
  }, [queryClient])

  const renderItem = useCallback(
    ({ item }: { item: Collection }) => (
      <CollectionCard
        item={item}
        onPress={() =>
          router.push({ pathname: '/collection/[id]', params: { id: item.id } })
        }
        onShare={() => void handleShare(item)}
        onEdit={() => handleEdit(item)}
        onDelete={() => handleDelete(item)}
      />
    ),
    [handleShare, handleEdit, handleDelete],
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
          className="mt-4 bg-cyan-600 px-5 py-2.5 rounded-xl"
        >
          <Text className="text-white text-sm font-semibold">Create Collection</Text>
        </TouchableOpacity>
      </View>
    ),
    [],
  )

  return (
    <View className="flex-1 bg-cyan-50">
      {isLoading && collections.length === 0 ? (
        <ActivityIndicator className="mt-16" color="#0891B2" />
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
        className="absolute bottom-6 right-4 w-14 h-14 bg-cyan-600 rounded-full items-center justify-center shadow-lg"
        style={{ elevation: 6 }}
      >
        <Plus size={24} color="white" />
      </TouchableOpacity>

      {/* Edit Modal */}
      <EditCollectionModal
        visible={showEditModal}
        collection={editTarget}
        onClose={() => {
          setShowEditModal(false)
          setEditTarget(null)
        }}
        onSaved={handleEditSaved}
      />
    </View>
  )
}
