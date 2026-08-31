import { useCallback, memo, useState, useEffect } from 'react'
import { View, Text, FlatList, Share, ActivityIndicator, Alert, Modal, TextInput } from 'react-native'
import { router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Eye, MessageCircle, Link2, Clock, Edit, Trash2 } from 'lucide-react-native'
import { collectionApi } from '../../src/lib/api'
import { CollectionListSkeleton } from '../../src/components/Skeleton'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

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
  const { colors } = useTheme()
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
      showError(err, 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-white rounded-3xl w-full p-6 gap-4 border border-lavender-200 shadow-xl">
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-lg font-bold text-spaceCadet-900"
          >
            Edit Collection
          </Text>

          <View>
            <Text className="text-xs font-bold text-heliotrope-600 uppercase tracking-wide mb-1.5">
              Title
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Collection name"
              placeholderTextColor="#928EB2"
              className="bg-lavender-50 px-4 py-3 rounded-2xl text-sm font-bold text-spaceCadet-900 border border-lavender-200"
              autoFocus
            />
          </View>

          <View>
            <Text className="text-xs font-bold text-heliotrope-600 uppercase tracking-wide mb-1.5">
              Expires in (days)
            </Text>
            <TextInput
              value={expiryDays}
              onChangeText={setExpiryDays}
              placeholder="30"
              placeholderTextColor="#928EB2"
              keyboardType="numeric"
              className="bg-lavender-50 px-4 py-3 rounded-2xl text-sm font-bold text-spaceCadet-900 border border-lavender-200"
            />
          </View>

          <View className="flex-row gap-3 mt-2">
            <AnimatedPressable
              onPress={onClose}
              disabled={saving}
              className="flex-1 bg-lavender-100 py-3.5 rounded-2xl items-center border border-lavender-200"
            >
              <Text className="text-spaceCadet-900 font-bold text-xs uppercase tracking-wider">Cancel</Text>
            </AnimatedPressable>
            <View className="flex-1">
              <GradientButton
                label="Save"
                onPress={() => void handleSave()}
                disabled={saving || !title.trim()}
                loading={saving}
              />
            </View>
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
    <AnimatedPressable
      onPress={onPress}
      className="bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm"
      style={{
        shadowColor: '#231F48',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 10,
        elevation: 2,
      }}
    >
      {/* Title + status */}
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-base font-bold text-spaceCadet-900"
          >
            {item.title}
          </Text>
          <Text className="text-xs text-heliotrope-500 font-medium mt-0.5">
            {item.product_count} {item.product_count === 1 ? 'product' : 'products'}
          </Text>
        </View>
        <View
          className={`px-2.5 py-0.5 rounded-full border ${
            item.status === 'ACTIVE'
              ? 'bg-fuchsia-500/10 border-fuchsia-500/30'
              : 'bg-lavender-100 border-lavender-200'
          }`}
        >
          <Text
            className={`text-[10px] font-bold uppercase tracking-wider ${
              item.status === 'ACTIVE' ? 'text-fuchsia-600' : 'text-heliotrope-500'
            }`}
          >
            {item.status}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View className="flex-row gap-4 mb-3.5 py-2 px-3 bg-lavender-50 rounded-2xl border border-lavender-200/60">
        <View className="flex-row items-center gap-1.5">
          <Eye size={13} color="#BB3F95" />
          <Text className="text-xs font-bold text-spaceCadet-900">{item.view_count} views</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <MessageCircle size={13} color="#BB3F95" />
          <Text className="text-xs font-bold text-spaceCadet-900">{item.enquiry_count} enquiries</Text>
        </View>
        <View className="flex-row items-center gap-1.5">
          <Clock size={13} color="#6B4773" />
          <Text className="text-xs font-medium text-heliotrope-500">{daysUntil(item.expires_at)}</Text>
        </View>
      </View>

      {/* Action buttons row */}
      <View className="flex-row gap-2">
        {/* Share on WhatsApp */}
        {item.status === 'ACTIVE' && (
          <AnimatedPressable
            onPress={onShare}
            className="flex-1 flex-row items-center justify-center gap-2 bg-spaceCadet-900 py-2.5 rounded-2xl border border-spaceCadet-900"
          >
            <Link2 size={14} color="#E0E1F6" />
            <Text className="text-white text-xs font-bold uppercase tracking-wider">Share Link</Text>
          </AnimatedPressable>
        )}

        {/* Edit */}
        <AnimatedPressable
          onPress={onEdit}
          className="flex-row items-center justify-center bg-lavender-100 border border-lavender-200 px-3.5 py-2.5 rounded-2xl"
          accessibilityLabel="Edit collection"
          accessibilityRole="button"
        >
          <Edit size={14} color="#231F48" />
        </AnimatedPressable>

        {/* Delete */}
        <AnimatedPressable
          onPress={onDelete}
          className="flex-row items-center justify-center bg-red-50 border border-red-200 px-3.5 py-2.5 rounded-2xl"
          accessibilityLabel="Delete collection"
          accessibilityRole="button"
        >
          <Trash2 size={14} color="#DC2626" />
        </AnimatedPressable>
      </View>
    </AnimatedPressable>
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
              showError(err, 'Failed to delete')
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
      <View className="items-center py-16 px-8">
        <View className="w-16 h-16 bg-lavender-100 rounded-3xl items-center justify-center mb-4 border border-lavender-200 shadow-sm">
          <Link2 size={28} color="#BB3F95" />
        </View>
        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-spaceCadet-900 text-lg font-bold text-center"
        >
          No collections yet
        </Text>
        <Text className="text-heliotrope-500 text-xs text-center mt-1 leading-5">
          Create a collection and share it on WhatsApp{'\n'}so customers can browse and enquire.
        </Text>
        <View className="mt-5 w-full max-w-xs">
          <GradientButton
            label="Create Collection"
            onPress={() => router.push('/collection/new')}
          />
        </View>
      </View>
    ),
    [],
  )

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {isLoading && collections.length === 0 ? (
        <CollectionListSkeleton />
      ) : (
        <FlatList
          data={collections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 14, gap: 12, flexGrow: 1 }}
          ListEmptyComponent={listEmpty}
          windowSize={5}
          maxToRenderPerBatch={10}
          removeClippedSubviews={true}
          initialNumToRender={8}
        />
      )}

      {/* FAB */}
      <AnimatedPressable
        onPress={() => router.push('/collection/new')}
        className="absolute bottom-6 right-5 w-14 h-14 bg-fuchsia-600 rounded-full items-center justify-center shadow-lg border border-white/20"
        style={{
          shadowColor: '#BB3F95',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.45,
          shadowRadius: 10,
          elevation: 6,
        }}
        accessibilityLabel="New collection"
        accessibilityRole="button"
      >
        <Plus size={24} color="white" strokeWidth={2.5} />
      </AnimatedPressable>

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
