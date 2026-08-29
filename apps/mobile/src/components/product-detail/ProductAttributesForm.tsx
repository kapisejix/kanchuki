import React from 'react'
import { View, Text, TextInput } from 'react-native'
import { Image } from 'expo-image'
import {
  Check,
  Tag,
  Sparkles,
} from 'lucide-react-native'
import {
  PATTERN_TYPES,
  SIZE_OPTIONS,
  resolveFashionColor,
} from '@kanchuki/shared'
import { AnimatedPressable } from '../AnimatedPressable'
import type { ProductDetail } from '@kanchuki/shared'

interface ProductAttributesFormProps {
  product: ProductDetail
  price: string
  setPrice: (p: string) => void
  location: string
  setLocation: (l: string) => void
  notes: string
  setNotes: (n: string) => void
  selectedStyles: string[]
  setSelectedStyles: React.Dispatch<React.SetStateAction<string[]>>
  selectedFabrics: string[]
  setSelectedFabrics: React.Dispatch<React.SetStateAction<string[]>>
  selectedSizes: string[]
  setSelectedSizes: React.Dispatch<React.SetStateAction<string[]>>
  selectedCategoryIds: string[]
  setSelectedCategoryIds: React.Dispatch<React.SetStateAction<string[]>>
  editedCategory: string | null
  setEditedCategory: (c: string | null) => void
  editedColor: string
  setEditedColor: (c: string) => void
  editedPattern: string | null
  setEditedPattern: (p: string | null) => void
  editedCategoryId: string | null
  setEditedCategoryId: (id: string | null) => void
  editedName: string
  setEditedName: (n: string) => void
  editedSku: string
  setEditedSku: (s: string) => void
  editedDescription: string
  setEditedDescription: (d: string) => void
  editedSubtype: string
  setEditedSubtype: (s: string) => void
  dirty: <T>(setter: (v: T) => void) => (val: T) => void
  primaryColor: string
  colors: any
  categories: any[]
  availableStyles: any[]
  availableFabrics: any[]
  displayPhotos: any[]
  selectedPhotoIndex: number
  goToPhoto: (idx: number) => void
  onOpenSkuTagModal: () => void
}

export function ProductAttributesForm({
  product,
  price,
  setPrice,
  location,
  setLocation,
  notes,
  setNotes,
  selectedStyles,
  setSelectedStyles,
  selectedFabrics,
  setSelectedFabrics,
  selectedSizes,
  setSelectedSizes,
  selectedCategoryIds,
  setSelectedCategoryIds,
  editedCategory,
  setEditedCategory,
  editedColor,
  setEditedColor,
  editedPattern,
  setEditedPattern,
  editedCategoryId,
  setEditedCategoryId,
  editedName,
  setEditedName,
  editedSku,
  setEditedSku,
  editedDescription,
  setEditedDescription,
  editedSubtype,
  setEditedSubtype,
  dirty,
  primaryColor,
  colors,
  categories,
  availableStyles,
  availableFabrics,
  displayPhotos,
  selectedPhotoIndex,
  goToPhoto,
  onOpenSkuTagModal,
}: ProductAttributesFormProps) {
  const createdDate = product.created_at ? new Date(product.created_at) : new Date()
  const daysAgo = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
  const isNewArrival = daysAgo >= 0 && daysAgo <= 21
  const daysLeft = Math.max(0, 21 - daysAgo)

  const toggleStyle = (s: string) => {
    dirty(setSelectedStyles)(
      selectedStyles.includes(s)
        ? selectedStyles.filter((item) => item !== s)
        : [...selectedStyles, s],
    )
  }

  const toggleFabric = (f: string) => {
    dirty(setSelectedFabrics)(
      selectedFabrics.includes(f)
        ? selectedFabrics.filter((item) => item !== f)
        : [...selectedFabrics, f],
    )
  }

  const toggleSize = (size: string) => {
    dirty(setSelectedSizes)(
      selectedSizes.includes(size)
        ? selectedSizes.filter((s) => s !== size)
        : [...selectedSizes, size],
    )
  }

  return (
    <View className="px-4 py-4 gap-4">
      {/* ── Top Title & Price Card ── */}
      <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
        {/* Title & Price in single row */}
        <View className="flex-row items-start justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-xl font-bold text-spaceCadet-900 font-marcellus">
              {editedName || product.name || 'Luxury Ensemble'}
            </Text>
            <Text className="text-xs text-heliotrope-500 font-medium mt-0.5">
              {[product.subtype ?? product.category, product.fabric_estimate].filter(Boolean).join(' · ') || 'Handcrafted Design'}
            </Text>
          </View>
          <View className="items-end">
            <View className="flex-row items-center gap-0.5">
              <Text className="text-xl font-bold text-spaceCadet-900 font-marcellus">₹</Text>
              <TextInput
                value={price}
                onChangeText={dirty(setPrice)}
                placeholder="1500"
                keyboardType="numeric"
                className="text-xl font-bold text-spaceCadet-900 font-marcellus p-0 min-w-[50px] text-right"
                placeholderTextColor="#928EB2"
              />
            </View>
            <View className="px-2 py-0.5 rounded-full bg-lavender-100 border border-lavender-200 mt-1">
              <Text className="text-[10px] font-bold text-fuchsia-600">In Stock</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── AI Generated Product Summary Card ── */}
      {(editedDescription || product.description) ? (
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm gap-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5">
              <Sparkles size={16} color="#BB3F95" />
              <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
                AI Product Summary
              </Text>
            </View>
            <View className="px-2.5 py-0.5 rounded-full bg-fuchsia-50 border border-fuchsia-100">
              <Text className="text-[10px] font-bold text-fuchsia-600">AI Generated</Text>
            </View>
          </View>
          <TextInput
            value={editedDescription}
            onChangeText={dirty(setEditedDescription)}
            placeholder="AI generated product summary..."
            placeholderTextColor="#928EB2"
            multiline
            numberOfLines={3}
            className="text-xs text-spaceCadet-900 leading-relaxed font-medium mt-1 bg-lavender-50 rounded-2xl border border-lavender-200 p-3.5"
            style={{ textAlignVertical: 'top' }}
          />
        </View>
      ) : null}

      {/* Editable Fields Container */}
      <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm gap-4">
        {/* Product Title / Name */}
        <View>
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-1.5">
            Product Title
          </Text>
          <TextInput
            value={editedName}
            onChangeText={dirty(setEditedName)}
            placeholder="Product title / name"
            placeholderTextColor="#928EB2"
            className="text-sm text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
          />
        </View>

        {/* Subtype / Garment Type */}
        <View>
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-1.5">
            Garment Subtype
          </Text>
          <TextInput
            value={editedSubtype}
            onChangeText={dirty(setEditedSubtype)}
            placeholder="e.g. Anarkali Suit, Kurta Set, Lehenga Choli"
            placeholderTextColor="#928EB2"
            className="text-sm text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
          />
        </View>

        {/* Categories (Multi-Select with New Arrivals status) */}
        <View>
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
              Categories (Multi-Select)
            </Text>
            <Text className="text-[10px] text-heliotrope-500 font-medium">
              Multi-choice supported
            </Text>
          </View>
          <Text className="text-[11px] text-heliotrope-500 mb-2.5 leading-4">
            New Arrivals auto-checked for 21 days · Select categories for this item
          </Text>

          <View className="flex-row flex-wrap gap-2">
            {/* New Arrivals virtual category status pill */}
            <View
              className={`px-3 py-1.5 rounded-2xl border flex-row items-center gap-1.5 ${
                isNewArrival
                  ? 'bg-fuchsia-50 border-fuchsia-300'
                  : 'bg-lavender-50 border-lavender-200 opacity-60'
              }`}
            >
              <Sparkles size={13} color={isNewArrival ? '#BB3F95' : '#928EB2'} />
              <Text
                className={`text-xs font-bold ${
                  isNewArrival ? 'text-fuchsia-800' : 'text-spaceCadet-400'
                }`}
              >
                New Arrivals
              </Text>
              <View
                className={`px-1.5 py-0.5 rounded-full ${
                  isNewArrival ? 'bg-fuchsia-200' : 'bg-lavender-200'
                }`}
              >
                <Text
                  className={`text-[9px] font-extrabold ${
                    isNewArrival ? 'text-fuchsia-900' : 'text-spaceCadet-500'
                  }`}
                >
                  {isNewArrival ? `${daysLeft}d left` : 'Expired (21d)'}
                </Text>
              </View>
            </View>

            {/* Store Categories */}
            {categories.map((c) => {
              const isSelected =
                selectedCategoryIds.includes(c.id) ||
                editedCategoryId === c.id ||
                (!editedCategoryId && editedCategory === c.name)
              return (
                <AnimatedPressable
                  key={c.id}
                  onPress={() => {
                    const newIds = isSelected
                      ? selectedCategoryIds.filter((id) => id !== c.id)
                      : [...selectedCategoryIds, c.id]
                    dirty(setSelectedCategoryIds)(newIds)
                    if (newIds.length > 0) {
                      dirty(setEditedCategoryId)(newIds[0]!)
                      dirty(setEditedCategory)(
                        categories.find((cat) => cat.id === newIds[0])?.name ?? null,
                      )
                    } else {
                      dirty(setEditedCategoryId)(null)
                      dirty(setEditedCategory)(null)
                    }
                  }}
                  className={`px-3 py-1.5 rounded-2xl border flex-row items-center gap-1.5 ${
                    isSelected
                      ? 'bg-spaceCadet-900 border-spaceCadet-900'
                      : 'bg-lavender-50 border-lavender-200'
                  }`}
                >
                  {isSelected && <Check size={12} color="white" />}
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? 'text-white' : 'text-spaceCadet-900'
                    }`}
                  >
                    {c.name}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Primary Color */}
        <View>
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
            Primary Color
          </Text>
          <View className="flex-row flex-wrap items-center gap-3">
            <View className="items-center">
              <View
                className="w-10 h-10 rounded-full border-2 border-lavender-200"
                style={{ backgroundColor: resolveFashionColor(editedColor || '#6B4773') }}
              />
              <Text
                className="text-[11px] font-bold text-spaceCadet-900 mt-1 capitalize"
                numberOfLines={1}
              >
                {editedColor || 'Not set'}
              </Text>
            </View>
            {displayPhotos
              .filter((p) => !p.is_video)
              .slice(0, 6)
              .map((photo) => (
                <AnimatedPressable
                  key={photo.id}
                  onPress={() => {
                    const idx = displayPhotos.findIndex((p) => p.id === photo.id)
                    if (idx >= 0) goToPhoto(idx)
                  }}
                  className="w-12 h-14 rounded-xl overflow-hidden border border-lavender-200"
                >
                  <Image
                    source={{ uri: photo.url }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                </AnimatedPressable>
              ))}
          </View>
        </View>

        {/* Pattern */}
        <View>
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
            Pattern / Work
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PATTERN_TYPES.map((p) => {
                const isSelected = editedPattern === p
                return (
                  <AnimatedPressable
                    key={p}
                    onPress={() => dirty(setEditedPattern)(isSelected ? null : p)}
                    className={`px-3.5 py-2 rounded-2xl border ${
                      isSelected
                        ? 'bg-spaceCadet-900 border-spaceCadet-900'
                        : 'bg-lavender-50 border-lavender-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isSelected ? 'text-white' : 'text-spaceCadet-900'
                      }`}
                    >
                      {p}
                    </Text>
                  </AnimatedPressable>
                )
              })}
          </View>
        </View>

        {/* Style Silhouettes */}
        {availableStyles.length > 0 && (
          <View>
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
              Styles / Silhouettes
            </Text>
            <View className="flex-row flex-wrap gap-2">
                {availableStyles.map((s) => {
                  const isSelected = selectedStyles.includes(s.name)
                  return (
                    <AnimatedPressable
                      key={s.id}
                      onPress={() => toggleStyle(s.name)}
                      className={`px-3.5 py-2 rounded-2xl border ${
                        isSelected
                          ? 'bg-spaceCadet-900 border-spaceCadet-900'
                          : 'bg-lavender-50 border-lavender-200'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? 'text-white' : 'text-spaceCadet-900'
                        }`}
                      >
                        {s.name}
                      </Text>
                    </AnimatedPressable>
                  )
                })}
            </View>
          </View>
        )}

        {/* Fabrics */}
        {availableFabrics.length > 0 && (
          <View>
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
              Fabrics
            </Text>
            <View className="flex-row flex-wrap gap-2">
                {availableFabrics.map((f) => {
                  const isSelected = selectedFabrics.includes(f.name)
                  return (
                    <AnimatedPressable
                      key={f.id}
                      onPress={() => toggleFabric(f.name)}
                      className={`px-3.5 py-2 rounded-2xl border ${
                        isSelected
                          ? 'bg-spaceCadet-900 border-spaceCadet-900'
                          : 'bg-lavender-50 border-lavender-200'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          isSelected ? 'text-white' : 'text-spaceCadet-900'
                        }`}
                      >
                        {f.name}
                      </Text>
                    </AnimatedPressable>
                  )
                })}
            </View>
          </View>
        )}

        {/* Available Sizes */}
        <View>
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
            Available Sizes
          </Text>
          <View className="flex-row flex-wrap gap-2.5">
            {SIZE_OPTIONS.map((size) => {
              const isSelected = selectedSizes.includes(size)
              return (
                <AnimatedPressable
                  key={size}
                  onPress={() => toggleSize(size)}
                  className={`w-12 h-12 rounded-full border items-center justify-center ${
                    isSelected
                      ? 'bg-spaceCadet-900 border-spaceCadet-900'
                      : 'bg-white border-lavender-200'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? 'text-white' : 'text-spaceCadet-900'
                    }`}
                  >
                    {size}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* SKU & Barcode Tag */}
        <View>
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
              SKU / Product Code
            </Text>
            <AnimatedPressable
              onPress={onOpenSkuTagModal}
              className="flex-row items-center gap-1.5 bg-lavender-100 px-3 py-1 rounded-full border border-lavender-200"
            >
              <Tag size={12} color="#BB3F95" />
              <Text className="text-spaceCadet-900 text-[10px] font-bold">Print Price Tag</Text>
            </AnimatedPressable>
          </View>
          <TextInput
            value={editedSku}
            onChangeText={dirty(setEditedSku)}
            placeholder="e.g. KUR-001 or scan barcode"
            placeholderTextColor="#928EB2"
            className="text-sm text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
          />
        </View>

        {/* Rack / Location in store */}
        <View>
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-1.5">
            Rack / Shelf Location
          </Text>
          <TextInput
            value={location}
            onChangeText={dirty(setLocation)}
            placeholder="e.g. Rack 3, Shelf B"
            placeholderTextColor="#928EB2"
            className="text-sm text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
          />
        </View>

        {/* Internal store notes */}
        <View>
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-1.5">
            Store Notes (Private)
          </Text>
          <TextInput
            value={notes}
            onChangeText={dirty(setNotes)}
            placeholder="Wholesale price, supplier info, restock reminders..."
            placeholderTextColor="#928EB2"
            multiline
            numberOfLines={3}
            className="text-sm text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
            style={{ textAlignVertical: 'top' }}
          />
        </View>
      </View>
    </View>
  )
}

