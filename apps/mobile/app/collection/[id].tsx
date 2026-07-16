import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Image, Share, ActivityIndicator, Alert, Modal, TextInput } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Heart, MessageCircle, Link2, Users, Edit, Trash2 } from 'lucide-react-native'
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

// ── Edit Collection Modal ──────────────────────────────────────────

function EditModal({
  visible,
  collection,
  onClose,
  onSaved,
}: {
  visible: boolean
  collection: CollectionDetail | null
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

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [showEditModal, setShowEditModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['collections', id],
    queryFn: () => collectionApi.get(id),
    enabled: !!id,
  })
  const collection = (data as { data: CollectionDetail } | undefined)?.data

  if (isLoading || !collection) {
    return (
      <View className="flex-1 items-center justify-center bg-cyan-50">
        <ActivityIndicator color="#0891B2" />
      </View>
    )
  }

  const handleShare = () =>
    void Share.share({
      message: `Check out ${collection.title}: ${collection.url}`,
      url: collection.url,
    })

  const handleDelete = () => {
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
  }

  const handleEditSaved = () => {
    void queryClient.invalidateQueries({ queryKey: ['collections', id] })
    void queryClient.invalidateQueries({ queryKey: ['collections'] })
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: collection.title,
          headerShown: true,
          headerRight: () => (
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setShowEditModal(true)}
                className="w-9 h-9 bg-blue-50 rounded-full items-center justify-center"
              >
                <Edit size={16} color="#2563EB" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                className="w-9 h-9 bg-red-50 rounded-full items-center justify-center"
              >
                <Trash2 size={16} color="#DC2626" />
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <ScrollView className="flex-1 bg-cyan-50">
        {/* Stats */}
        <View className="flex-row flex-wrap px-4 pt-4 gap-3">
          <Stat icon={<Eye size={16} color="#0891B2" />} label="Views" value={collection.view_count} />
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

        {/* Action buttons row */}
        <View className="px-4 pt-3 flex-row gap-3">
          <TouchableOpacity
            onPress={() => setShowEditModal(true)}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-blue-50 border border-blue-100 py-3 rounded-xl"
          >
            <Edit size={16} color="#2563EB" />
            <Text className="text-blue-700 text-sm font-semibold">Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleDelete}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-red-50 border border-red-100 py-3 rounded-xl"
          >
            <Trash2 size={16} color="#DC2626" />
            <Text className="text-red-600 text-sm font-semibold">Delete</Text>
          </TouchableOpacity>
        </View>

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

      {/* Edit Modal */}
      <EditModal
        visible={showEditModal}
        collection={collection}
        onClose={() => setShowEditModal(false)}
        onSaved={handleEditSaved}
      />
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
