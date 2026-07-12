import { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Check, Plus, Trash2, MapPin, Sparkles } from 'lucide-react-native'
import { productApi } from '../../src/lib/api'
import {
  OCCASION_TYPES,
  PRODUCT_CATEGORIES,
  FABRIC_TYPES,
  PATTERN_TYPES,
  PIECE_TAGGABLE_CATEGORIES,
  formatPriceRange,
} from '@kanchuki/shared'

type Photo = { id: string; url: string; is_primary: boolean; piece_type: 'upper' | 'lower' | null }
type Variant = { id: string; color: string; photo_url: string | null }
type Product = {
  id: string
  category: string | null
  product_type: string | null
  primary_color: string | null
  fabric_estimate: string | null
  pattern: string | null
  occasions: string[]
  price_min: number | null
  price_max: number | null
  status: 'AVAILABLE' | 'SOLD' | 'RESERVED' | 'NOT_SURE'
  location_notes: string | null
  notes: string | null
  ai_tagged: boolean
  ai_tag_error: string | null
  photos: Photo[]
  variants: Variant[]
  section: { name: string } | null
}

const STATUS_OPTIONS: Array<{ value: Product['status']; label: string }> = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'NOT_SURE', label: 'Not Sure' },
]

export default function ProductDetailScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['products', id],
    queryFn: () => productApi.get(id),
    // Poll while AI tagging is still running so the spinner clears itself
    // instead of requiring the user to leave and re-enter the screen.
    refetchInterval: (query) => {
      const p = (query.state.data as { data: Product } | undefined)?.data
      if (!p || (!p.ai_tagged && !p.ai_tag_error)) return 3_000
      return false
    },
  })
  const product = (data as { data: Product } | undefined)?.data

  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)

  // Editable AI fields
  const [editedCategory, setEditedCategory] = useState<string | null>(null)
  const [editedColor, setEditedColor] = useState('')
  const [editedFabric, setEditedFabric] = useState<string | null>(null)
  const [editedPattern, setEditedPattern] = useState<string | null>(null)

  useEffect(() => {
    if (!product) return
    setPrice(product.price_min ? String(product.price_min / 100) : '')
    setLocation(product.location_notes ?? '')
    setNotes(product.notes ?? '')
    setSelectedOccasions(product.occasions ?? [])
    setEditedCategory(product.category)
    setEditedColor(product.primary_color ?? '')
    setEditedFabric(product.fabric_estimate)
    setEditedPattern(product.pattern)
  }, [product])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const handleSave = async () => {
    if (!product) return
    setSaving(true)
    try {
      const priceInPaise = price ? Math.round(parseFloat(price) * 100) : undefined
      await productApi.update(product.id, {
        price_min: priceInPaise,
        price_max: priceInPaise,
        category: editedCategory ?? undefined,
        primary_color: editedColor || undefined,
        fabric_estimate: editedFabric ?? undefined,
        pattern: editedPattern ?? undefined,
        location_notes: location || undefined,
        notes: notes || undefined,
        occasions: selectedOccasions,
      })
      invalidate()
      Alert.alert('Saved', 'Product updated.')
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (status: Product['status']) => {
    if (!product) return
    setStatusUpdating(true)
    try {
      await productApi.updateStatus(product.id, status)
      invalidate()
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setStatusUpdating(false)
    }
  }

  const isPieceTaggable = (category: string | null): boolean =>
    !!category && (PIECE_TAGGABLE_CATEGORIES as readonly string[]).includes(category)

  const handleSetPieceType = async (photoId: string, pieceType: 'upper' | 'lower') => {
    if (!product) return
    // Tapping the already-active piece clears it; only one photo per piece per product.
    const current = product.photos.find((p) => p.id === photoId)?.piece_type
    const next = current === pieceType ? null : pieceType
    try {
      await productApi.setPhotoPieceType(product.id, photoId, next)
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to tag photo')
    }
  }

  const handleDelete = () => {
    if (!product) return
    Alert.alert('Delete Product', 'This removes it from your catalog. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await productApi.delete(product.id)
          invalidate()
          router.back()
        },
      },
    ])
  }

  if (isLoading || !product) {
    return (
      <View className="flex-1 bg-cyan-50 items-center justify-center">
        <ActivityIndicator color="#0891B2" />
      </View>
    )
  }

  return (
    <ScrollView className="flex-1 bg-cyan-50">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-gray-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <X size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">Product Details</Text>
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saving}
          className="bg-cyan-600 px-4 py-2 rounded-xl"
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-semibold text-sm">Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Photos */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="bg-white">
        {product.photos.map((photo) => (
          <View key={photo.id}>
            <Image
              source={{ uri: photo.url }}
              style={{ width: 320, height: 320 }}
              contentFit="cover"
            />
            {isPieceTaggable(product.category) && (
              <View className="flex-row gap-2 px-3 py-2 bg-white">
                {(['upper', 'lower'] as const).map((piece) => {
                  const selected = photo.piece_type === piece
                  return (
                    <TouchableOpacity
                      key={piece}
                      onPress={() => void handleSetPieceType(photo.id, piece)}
                      className={`px-3 py-1 rounded-full border flex-row items-center gap-1 ${
                        selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                      }`}
                    >
                      {selected && <Check size={12} color="white" />}
                      <Text className={`text-xs font-medium capitalize ${selected ? 'text-white' : 'text-gray-600'}`}>
                        {piece} piece
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      {isPieceTaggable(product.category) && (
        <View className="mx-4 mt-3 bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2">
          <Text className="text-cyan-700 text-xs">
            Tag one photo "Upper piece" and one "Lower piece" for a better try-on match on this 2-piece outfit.
          </Text>
        </View>
      )}

      {!product.ai_tagged && !product.ai_tag_error && (
        <View className="mx-4 mt-3 bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2 flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#0891B2" />
          <Text className="text-cyan-700 text-xs">AI tagging in progress...</Text>
        </View>
      )}
      {product.ai_tag_error && (
        <View className="mx-4 mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          <Text className="text-amber-700 text-xs">AI tagging failed — fields below are manual.</Text>
        </View>
      )}

      <View className="px-4 py-4 gap-4">
        {/* Try-On */}
        <TouchableOpacity
          onPress={() =>
            router.push({ pathname: '/tryon/in-store', params: { productId: product.id } })
          }
          className="flex-row items-center justify-center gap-2 bg-cyan-600 py-3.5 rounded-2xl"
          activeOpacity={0.8}
        >
          <Sparkles size={18} color="white" />
          <Text className="text-white font-bold">Try-On with Customer Photo</Text>
        </TouchableOpacity>

        {/* AI-read attributes (read-only summary) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <View className="flex-row items-center gap-2 mb-2">
            <Sparkles size={14} color="#0891B2" />
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              AI Summary
            </Text>
          </View>
          <Text className="text-base font-bold text-gray-900">
            {product.category ?? 'Uncategorized'}
            {product.primary_color ? ` · ${product.primary_color}` : ''}
          </Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {[product.fabric_estimate, product.pattern].filter(Boolean).join(' · ') || 'AI details pending'}
          </Text>
          {product.ai_tag_error && (
            <Text className="text-xs text-amber-600 mt-1">
              AI failed — edit fields below manually
            </Text>
          )}
          <Text className="text-lg font-bold text-cyan-600 mt-2">
            {formatPriceRange(product.price_min, product.price_max)}
          </Text>
        </View>

        {/* Category (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Category *
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PRODUCT_CATEGORIES.map((cat) => {
              const selected = editedCategory === cat
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setEditedCategory(selected ? null : cat)}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Color (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Color
          </Text>
          <TextInput
            value={editedColor}
            onChangeText={setEditedColor}
            placeholder="e.g. Bottle Green, Navy Blue, Rani Pink"
            className="text-sm text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Fabric (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Fabric
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {FABRIC_TYPES.map((fab) => {
              const selected = editedFabric === fab
              return (
                <TouchableOpacity
                  key={fab}
                  onPress={() => setEditedFabric(selected ? null : fab)}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>
                    {fab}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Pattern (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Pattern
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PATTERN_TYPES.map((pat) => {
              const selected = editedPattern === pat
              return (
                <TouchableOpacity
                  key={pat}
                  onPress={() => setEditedPattern(selected ? null : pat)}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>
                    {pat}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Color variants */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Colors · Same Design
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-3">
              {product.variants.map((variant) => (
                <View key={variant.id} className="items-center gap-1">
                  <View className="w-16 h-20 rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                    {variant.photo_url && (
                      <Image
                        source={{ uri: variant.photo_url }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    )}
                  </View>
                  <Text className="text-xs text-gray-600">{variant.color}</Text>
                </View>
              ))}
              <TouchableOpacity
                onPress={() => router.push(`/product/${product.id}/add-color`)}
                className="w-16 h-20 rounded-xl border-2 border-dashed border-cyan-300 items-center justify-center"
              >
                <Plus size={18} color="#0891B2" />
                <Text className="text-cyan-600 text-[10px] mt-1 text-center">Add{'\n'}Color</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Status */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Status
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const selected = product.status === opt.value
              return (
                <TouchableOpacity
                  key={opt.value}
                  disabled={statusUpdating}
                  onPress={() => void handleStatusChange(opt.value)}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Price */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Price (₹)
          </Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="e.g. 1500"
            keyboardType="numeric"
            className="text-lg font-bold text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Location */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <View className="flex-row items-center gap-1.5 mb-2">
            <MapPin size={12} color="#6B7280" />
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Store Location
            </Text>
          </View>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Rack B · Shelf 3 · Stack 2"
            className="text-sm text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Occasion */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Occasion
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {OCCASION_TYPES.map((occ) => {
              const selected = selectedOccasions.includes(occ)
              return (
                <TouchableOpacity
                  key={occ}
                  onPress={() =>
                    setSelectedOccasions((prev) =>
                      selected ? prev.filter((o) => o !== occ) : [...prev, occ],
                    )
                  }
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>
                    {occ}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Notes */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Notes (private)
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Any additional notes for your staff..."
            multiline
            numberOfLines={2}
            className="text-sm text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Delete */}
        <TouchableOpacity
          onPress={handleDelete}
          className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-red-100 bg-red-50"
        >
          <Trash2 size={16} color="#DC2626" />
          <Text className="text-red-600 font-semibold text-sm">Delete Product</Text>
        </TouchableOpacity>
      </View>

      <View className="h-12" />
    </ScrollView>
  )
}
