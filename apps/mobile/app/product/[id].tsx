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
import { X, Check, Plus, Trash2, MapPin } from 'lucide-react-native'
import { productApi } from '../../src/lib/api'
import { OCCASION_TYPES, formatPriceRange } from '@kanchuki/shared'

type Photo = { id: string; url: string; is_primary: boolean }
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
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['products', id],
    queryFn: () => productApi.get(id),
  })
  const product = (data as { data: Product } | undefined)?.data

  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)

  useEffect(() => {
    if (!product) return
    setPrice(product.price_min ? String(product.price_min / 100) : '')
    setLocation(product.location_notes ?? '')
    setNotes(product.notes ?? '')
    setSelectedOccasions(product.occasions ?? [])
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
      <View className="flex-1 bg-gray-50 items-center justify-center">
        <ActivityIndicator color="#7C3AED" />
      </View>
    )
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()}>
          <X size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">Product Details</Text>
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saving}
          className="bg-violet-600 px-4 py-2 rounded-xl"
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
          <Image
            key={photo.id}
            source={{ uri: photo.url }}
            style={{ width: 320, height: 320 }}
            contentFit="cover"
          />
        ))}
      </ScrollView>

      {!product.ai_tagged && !product.ai_tag_error && (
        <View className="mx-4 mt-3 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2 flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#7C3AED" />
          <Text className="text-violet-700 text-xs">AI tagging in progress...</Text>
        </View>
      )}
      {product.ai_tag_error && (
        <View className="mx-4 mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          <Text className="text-amber-700 text-xs">AI tagging failed — fields below are manual.</Text>
        </View>
      )}

      <View className="px-4 py-4 gap-4">
        {/* AI-read attributes (read-only) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Details
          </Text>
          <Text className="text-base font-bold text-gray-900">
            {product.category ?? 'Uncategorized'}
            {product.primary_color ? ` · ${product.primary_color}` : ''}
          </Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {[product.fabric_estimate, product.pattern].filter(Boolean).join(' · ') || 'AI details pending'}
          </Text>
          <Text className="text-lg font-bold text-violet-600 mt-2">
            {formatPriceRange(product.price_min, product.price_max)}
          </Text>
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
                className="w-16 h-20 rounded-xl border-2 border-dashed border-violet-300 items-center justify-center"
              >
                <Plus size={18} color="#7C3AED" />
                <Text className="text-violet-600 text-[10px] mt-1 text-center">Add{'\n'}Color</Text>
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
                    selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'
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
                    selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'
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
