import { useState, useEffect } from 'react'
import { normalizeIndianPhone, COLORS } from '@kanchuki/shared'
import { View, Text, ScrollView, FlatList, Image, Linking, ActivityIndicator, Alert, Modal, TextInput } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Eye, Heart, MessageCircle, Link2, Users, Edit, Trash2, Search, Check, ChevronLeft } from 'lucide-react-native'
import { collectionApi, customerApi, retailerApi } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { CollectionDetailSkeleton } from '../../src/components/Skeleton'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

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
  const { colors } = useTheme()
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
    const parsedExpiryDays = expiryDays ? parseInt(expiryDays, 10) : undefined
    if (expiryDays && (!Number.isFinite(parsedExpiryDays) || (parsedExpiryDays as number) < 1)) {
      Alert.alert('Invalid expiry', 'Enter a whole number of days (1 or more).')
      return
    }
    setSaving(true)
    try {
      await collectionApi.update(collection.id, {
        title: title.trim(),
        ...(parsedExpiryDays !== undefined ? { expires_days: parsedExpiryDays } : {}),
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
  const apiConfigured = waApiData?.data?.configured ?? false

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
      showError(err, 'Bulk send failed')
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
        <View className="bg-white rounded-t-3xl max-h-[85%] p-5 border-t border-lavender-200">
          {bulkResult ? (
            <View className="items-center py-6 gap-3">
              <Text
                style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                className="text-base font-bold text-spaceCadet-900"
              >
                Sent via WhatsApp Business API
              </Text>
              <Text className="text-sm text-heliotrope-600">{bulkResult.sent} delivered</Text>
              {bulkResult.failed_count > 0 && (
                <Text className="text-sm text-red-500">{bulkResult.failed_count} failed</Text>
              )}
              <AnimatedPressable onPress={handleClose} className="bg-lavender-100 px-6 py-3 rounded-2xl mt-2 border border-lavender-200">
                <Text className="text-spaceCadet-900 font-bold text-xs uppercase tracking-wider">Done</Text>
              </AnimatedPressable>
            </View>
          ) : queue ? (
            <View className="items-center py-6 gap-3">
              <Text
                style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                className="text-base font-bold text-spaceCadet-900"
              >
                Message {queueIndex + 1} of {queue.length}
              </Text>
              <Text className="text-sm text-spaceCadet-900 font-bold">{queue[queueIndex]!.name}</Text>
              <Text className="text-xs text-heliotrope-500 text-center px-4">
                WhatsApp opened with the message pre-filled. Tap Send in WhatsApp, then come back and tap Next.
              </Text>
              <AnimatedPressable onPress={sendNext} className="bg-spaceCadet-900 px-6 py-3 rounded-2xl mt-2">
                <Text className="text-white text-xs font-bold uppercase tracking-wider">
                  {queueIndex + 1 >= queue.length ? 'Done' : 'Next Customer'}
                </Text>
              </AnimatedPressable>
              <AnimatedPressable onPress={handleClose} className="mt-1">
                <Text className="text-heliotrope-500 text-xs">Cancel</Text>
              </AnimatedPressable>
            </View>
          ) : (
            <>
              <Text
                style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                className="text-lg font-bold text-spaceCadet-900 mb-3"
              >
                Share with Customers
              </Text>
              <View className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-3.5 py-2.5 gap-2 mb-3">
                <Search size={16} color="#6B4773" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search by name or phone..."
                  placeholderTextColor="#928EB2"
                  className="flex-1 text-sm font-bold text-spaceCadet-900"
                />
              </View>
              {isLoading ? (
                <ActivityIndicator color="#BB3F95" className="py-8" />
              ) : (
                <FlatList
                  data={customers}
                  keyExtractor={(c) => c.id}
                  style={{ maxHeight: 320 }}
                  ListEmptyComponent={
                    <Text className="text-heliotrope-500 text-sm text-center py-8">No customers saved yet</Text>
                  }
                  renderItem={({ item }) => {
                    const isSelected = selected.has(item.id)
                    return (
                      <AnimatedPressable
                        onPress={() => toggle(item.id)}
                        className="flex-row items-center gap-3 py-3 border-b border-lavender-100"
                      >
                        <View
                          className={`w-5 h-5 rounded-md border items-center justify-center ${
                            isSelected ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-lavender-300'
                          }`}
                        >
                          {isSelected && <Check size={12} color="white" />}
                        </View>
                        <View className="flex-1">
                          <Text className="text-sm font-bold text-spaceCadet-900">{item.name}</Text>
                          <Text className="text-xs text-heliotrope-500">{item.phone}</Text>
                        </View>
                      </AnimatedPressable>
                    )
                  }}
                />
              )}
              {apiConfigured && (
                <View className="mt-4">
                  <GradientButton
                    label={`Send via WhatsApp Business API (${selected.size})`}
                    disabled={selected.size === 0}
                    loading={bulkSending}
                    onPress={() => void handleBulkSend()}
                  />
                </View>
              )}
              <AnimatedPressable
                disabled={selected.size === 0}
                onPress={startSending}
                className={`${apiConfigured ? 'mt-2' : 'mt-4'} py-3.5 rounded-2xl items-center ${selected.size > 0 ? 'bg-spaceCadet-900' : 'bg-lavender-200'}`}
              >
                <Text className={`text-xs font-bold uppercase tracking-wider ${selected.size > 0 ? 'text-white' : 'text-heliotrope-500'}`}>
                  {apiConfigured ? 'Or send one-by-one' : 'Share via WhatsApp'} ({selected.size})
                </Text>
              </AnimatedPressable>
              <AnimatedPressable onPress={handleClose} className="items-center py-3">
                <Text className="text-heliotrope-500 text-xs font-bold">Cancel</Text>
              </AnimatedPressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

export default function CollectionDetailScreen() {
  const insets = useSafeAreaInsets()
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
    return <CollectionDetailSkeleton />
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
              router.back()
            } catch (err) {
              showError(err, 'Failed to delete')
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
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-5 pb-3 bg-white border-b border-lavender-200"
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
          className="text-lg font-bold text-spaceCadet-900 truncate max-w-[200px]"
          numberOfLines={1}
        >
          {collection.title}
        </Text>

        <View className="flex-row gap-2">
          <AnimatedPressable
            onPress={() => setShowEditModal(true)}
            className="w-10 h-10 bg-lavender-100 border border-lavender-200 rounded-full items-center justify-center"
            accessibilityLabel="Edit collection"
            accessibilityRole="button"
          >
            <Edit size={16} color="#231F48" />
          </AnimatedPressable>
          <AnimatedPressable
            onPress={handleDelete}
            className="w-10 h-10 bg-red-50 border border-red-200 rounded-full items-center justify-center"
            accessibilityLabel="Delete collection"
            accessibilityRole="button"
          >
            <Trash2 size={16} color="#DC2626" />
          </AnimatedPressable>
        </View>
      </View>

      <ScrollView className="flex-1 bg-[#F8F7FC]">
        {/* Stats — all 4 in a single row (#6) */}
        <View className="flex-row px-4 pt-4 gap-2">
          <Stat icon={<Eye size={16} color="#BB3F95" />} label="Views" value={collection.view_count} />
          <Stat icon={<Users size={16} color="#560A39" />} label="Visitors" value={collection.unique_viewer_count} />
          <Stat icon={<Heart size={16} color="#DC2626" />} label="Favorites" value={collection.favorite_count} />
          <Stat icon={<MessageCircle size={16} color="#BB3F95" />} label="Enquiries" value={collection.enquiry_count} />
        </View>

        {/* Share */}
        {collection.status === 'ACTIVE' && (
          <View className="px-4 pt-4">
            <GradientButton
              label="Share on WhatsApp"
              onPress={() => setShowShareModal(true)}
              accentBadge={<Link2 size={16} color="white" />}
            />
          </View>
        )}

        {/* Enquiries */}
        {collection.enquiries.length > 0 && (
          <View className="px-4 pt-5">
            <Text className="text-xs font-bold text-heliotrope-600 uppercase tracking-wide mb-2">
              Customer Enquiries
            </Text>
            <View className="gap-2.5">
              {collection.enquiries.map((e) => (
                <View key={e.id} className="bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm">
                  <View className="flex-row justify-between items-center">
                    <Text className="text-sm font-bold text-spaceCadet-900">
                      {e.customer_name ?? e.customer_phone ?? 'Anonymous'}
                    </Text>
                    <Text className="text-xs text-heliotrope-500">
                      {new Date(e.created_at).toLocaleDateString('en-IN')}
                    </Text>
                  </View>
                  {e.message && (
                    <Text className="text-xs text-spaceCadet-900 mt-1.5 font-medium">{e.message}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Products */}
        <View className="px-4 pt-5 pb-12">
          <Text className="text-xs font-bold text-heliotrope-600 uppercase tracking-wide mb-2.5">
            Products ({collection.products.length})
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {collection.products.map((cp) => (
              <AnimatedPressable
                key={cp.id}
                onPress={() => router.push(`/product/${cp.product.id}`)}
                className="w-[31%] bg-white rounded-3xl overflow-hidden border border-lavender-200 shadow-sm"
              >
                {cp.product.photos[0]?.url ? (
                  <Image
                    source={{ uri: cp.product.photos[0].url }}
                    className="w-full h-28 bg-lavender-100"
                    resizeMode="cover"
                  />
                ) : (
                  <View className="w-full h-28 bg-lavender-100 items-center justify-center">
                    <Text className="text-xl">👗</Text>
                  </View>
                )}
                <Text className="text-[10px] font-bold text-spaceCadet-900 p-2 truncate" numberOfLines={1}>
                  {cp.product.category ?? 'Product'} · {cp.product.primary_color ?? '—'}
                </Text>
              </AnimatedPressable>
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
    </View>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <View
      className="bg-white rounded-3xl p-3 border border-lavender-200 flex-1 shadow-sm"
      style={{
        shadowColor: '#231F48',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
      }}
    >
      <View className="w-7 h-7 rounded-xl bg-lavender-100 items-center justify-center mb-1">
        {icon}
      </View>
      <Text
        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
        className="text-base font-bold text-spaceCadet-900"
      >
        {value.toLocaleString('en-IN')}
      </Text>
      <Text className="text-[10px] text-heliotrope-500 font-medium mt-0.5">{label}</Text>
    </View>
  )
}
