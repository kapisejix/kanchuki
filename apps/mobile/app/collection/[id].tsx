import { useState, useEffect } from 'react'
import { View, Text, ScrollView, FlatList, TouchableOpacity, Image, Linking, ActivityIndicator, Alert, Modal, TextInput } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Heart, MessageCircle, Link2, Users, Edit, Trash2, Search, Check } from 'lucide-react-native'
import { normalizeIndianPhone } from '@kanchuki/shared'
import { collectionApi, customerApi, retailerApi } from '../../src/lib/api'

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

// ── Share via WhatsApp Modal (customer picker, one-by-one send) ─────

type CustomerLite = { id: string; name: string; phone: string }

function ShareModal({
  visible,
  collection,
  onClose,
}: {
  visible: boolean
  collection: CollectionDetail | null
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [queue, setQueue] = useState<CustomerLite[] | null>(null)
  const [queueIndex, setQueueIndex] = useState(0)
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ sent: number; failed_count: number } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['customers', 'picker', search],
    queryFn: () => customerApi.list(search || undefined),
    enabled: visible,
    staleTime: 30_000,
  })
  const customers = ((data as { data: CustomerLite[] } | undefined)?.data ?? [])

  const { data: waApiData } = useQuery({
    queryKey: ['retailer', 'whatsapp-api'],
    queryFn: () => retailerApi.getWhatsAppApiConfig(),
    enabled: visible,
    staleTime: 60_000,
  })
  const apiConfigured = waApiData?.data.configured ?? false

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openChat = (customer: CustomerLite) => {
    if (!collection) return
    const message = `Hi ${customer.name}! Check out our collection "${collection.title}": ${collection.url}`
    const digits = `91${normalizeIndianPhone(customer.phone)}`
    void Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`)
  }

  const startSending = () => {
    const picked = customers.filter((c) => selected.has(c.id))
    if (picked.length === 0) return
    setQueue(picked)
    setQueueIndex(0)
    openChat(picked[0]!)
  }

  const sendNext = () => {
    if (!queue) return
    const next = queueIndex + 1
    if (next >= queue.length) {
      handleClose()
      return
    }
    setQueueIndex(next)
    openChat(queue[next]!)
  }

  const handleBulkSend = async () => {
    const picked = customers.filter((c) => selected.has(c.id))
    if (picked.length === 0 || !collection) return
    setBulkSending(true)
    try {
      const res = await collectionApi.bulkSend(collection.id, picked.map((c) => c.id))
      setBulkResult({ sent: res.data.sent, failed_count: res.data.failed_count })
      setSelected(new Set())
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Bulk send failed')
    } finally {
      setBulkSending(false)
    }
  }

  const handleClose = () => {
    setQueue(null)
    setQueueIndex(0)
    setSelected(new Set())
    setSearch('')
    setBulkResult(null)
    onClose()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white rounded-t-3xl max-h-[85%] p-5">
          {bulkResult ? (
            <View className="items-center py-6 gap-3">
              <Text className="text-base font-bold text-gray-900">Sent via WhatsApp Business API</Text>
              <Text className="text-sm text-gray-600">{bulkResult.sent} delivered</Text>
              {bulkResult.failed_count > 0 && (
                <Text className="text-sm text-red-500">{bulkResult.failed_count} failed</Text>
              )}
              <TouchableOpacity onPress={handleClose} className="bg-gray-100 px-6 py-3 rounded-xl mt-2">
                <Text className="text-gray-700 font-semibold">Done</Text>
              </TouchableOpacity>
            </View>
          ) : queue ? (
            <View className="items-center py-6 gap-3">
              <Text className="text-base font-bold text-gray-900">
                Message {queueIndex + 1} of {queue.length}
              </Text>
              <Text className="text-sm text-gray-500">{queue[queueIndex]!.name}</Text>
              <Text className="text-xs text-gray-400 text-center px-4">
                WhatsApp opened with the message pre-filled. Tap Send in WhatsApp, then come back and tap Next.
              </Text>
              <TouchableOpacity onPress={sendNext} className="bg-green-600 px-6 py-3 rounded-xl mt-2">
                <Text className="text-white font-semibold">
                  {queueIndex + 1 >= queue.length ? 'Done' : 'Next Customer'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose} className="mt-1">
                <Text className="text-gray-400 text-xs">Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text className="text-lg font-bold text-gray-900 mb-3">Share with Customers</Text>
              <View className="flex-row items-center bg-gray-100 rounded-xl px-3 py-2.5 gap-2 mb-3">
                <Search size={16} color="#9CA3AF" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by name or phone..."
                  placeholderTextColor="#9CA3AF"
                  className="flex-1 text-sm text-gray-900"
                />
              </View>
              {isLoading ? (
                <ActivityIndicator color="#0891B2" className="py-8" />
              ) : (
                <FlatList
                  data={customers}
                  keyExtractor={(c) => c.id}
                  style={{ maxHeight: 320 }}
                  ListEmptyComponent={
                    <Text className="text-gray-400 text-sm text-center py-8">No customers saved yet</Text>
                  }
                  renderItem={({ item }) => {
                    const isSelected = selected.has(item.id)
                    return (
                      <TouchableOpacity
                        onPress={() => toggle(item.id)}
                        className="flex-row items-center gap-3 py-2.5 border-b border-gray-50"
                      >
                        <View
                          className={`w-5 h-5 rounded-md border items-center justify-center ${
                            isSelected ? 'bg-cyan-600 border-cyan-600' : 'border-gray-300'
                          }`}
                        >
                          {isSelected && <Check size={12} color="white" />}
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-medium text-gray-900">{item.name}</Text>
                          <Text className="text-xs text-gray-400">{item.phone}</Text>
                        </View>
                      </TouchableOpacity>
                    )
                  }}
                />
              )}
              {apiConfigured && (
                <TouchableOpacity
                  disabled={selected.size === 0 || bulkSending}
                  onPress={() => void handleBulkSend()}
                  className={`mt-4 py-3.5 rounded-xl items-center ${selected.size > 0 ? 'bg-cyan-600' : 'bg-gray-200'}`}
                >
                  {bulkSending ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text className={`font-semibold ${selected.size > 0 ? 'text-white' : 'text-gray-400'}`}>
                      Send via WhatsApp Business API ({selected.size})
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                disabled={selected.size === 0}
                onPress={startSending}
                className={`${apiConfigured ? 'mt-2' : 'mt-4'} py-3.5 rounded-xl items-center ${selected.size > 0 ? 'bg-green-600' : 'bg-gray-200'}`}
              >
                <Text className={`font-semibold ${selected.size > 0 ? 'text-white' : 'text-gray-400'}`}>
                  {apiConfigured ? 'Or send one-by-one' : 'Share via WhatsApp'} ({selected.size})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose} className="items-center py-3">
                <Text className="text-gray-400 text-sm">Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

export default function CollectionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [showEditModal, setShowEditModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)

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
              onPress={() => setShowShareModal(true)}
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

      <ShareModal
        visible={showShareModal}
        collection={collection}
        onClose={() => setShowShareModal(false)}
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
