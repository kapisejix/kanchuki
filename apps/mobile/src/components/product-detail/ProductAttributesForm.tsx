import React from 'react'
import { View, Text, TextInput, ScrollView } from 'react-native'
import {
  Sparkles,
  Check,
  Tag,
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
      {/* Product Display Header & Price */}
      <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
        <Text className="text-xl font-bold text-spaceCadet-900 font-marcellus">
          {editedName || product.name || 'Luxury Ensemble'}
        </Text>
        <Text className="text-xs text-heliotrope-500 font-medium mt-0.5">
          {[product.subtype ?? product.category, product.fabric_estimate].filter(Boolean).join(' · ') || 'Handcrafted Design'}
        </Text>

        <View className="mt-4 pt-3 border-t border-lavender-200 flex-row items-center justify-between">
          <View>
            <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider">Selling Price</Text>
            <View className="flex-row items-center gap-1 mt-0.5">
              <Text className="text-xl font-bold text-spaceCadet-900 font-marcellus">₹</Text>
              <TextInput
                value={price}
                onChangeText={dirty(setPrice)}
                placeholder="1500"
                keyboardType="numeric"
                className="text-2xl font-bold text-spaceCadet-900 font-marcellus p-0"
                placeholderTextColor="#928EB2"
              />
            </View>
          </View>

          <View className="px-3 py-1.5 rounded-full bg-lavender-100 border border-lavender-200">
            <Text className="text-[11px] font-bold text-fuchsia-600">In Stock</Text>
          </View>
        </View>
      </View>

      {/* Color swatches with checkmarks */}
      <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
            Color Variants
          </Text>
          <Text className="text-xs text-heliotrope-500">
            {editedColor || 'Select'}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3 items-center py-1">
            {product.variants.map((variant) => {
              const variantPhotoIndex = variant.photo_url
                ? displayPhotos.findIndex((p) => p.url === variant.photo_url)
                : -1
              const isActive = variantPhotoIndex === selectedPhotoIndex
              const hex = resolveFashionColor(variant.color)
              return (
                <AnimatedPressable
                  key={variant.id}
                  onPress={() => {
                    if (variantPhotoIndex >= 0) {
                      goToPhoto(isActive ? 0 : variantPhotoIndex)
                    }
                  }}
                  className={`w-11 h-11 rounded-full items-center justify-center border-2 ${
                    isActive ? 'border-fuchsia-500 scale-105' : 'border-lavender-200'
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {isActive && <Check size={14} color="#ffffff" strokeWidth={3} />}
                </AnimatedPressable>
              )
            })}
          </View>
        </ScrollView>
      </View>

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
            placeholder="e.g. Pink Embroidered Anarkali Suit"
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

        {/* Category */}
        <View>
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
            Category
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {categories.map((c) => {
                const isSelected =
                  editedCategoryId === c.id || (!editedCategoryId && editedCategory === c.name)
                return (
                  <AnimatedPressable
                    key={c.id}
                    onPress={() => {
                      dirty(setEditedCategoryId)(c.id)
                      dirty(setEditedCategory)(c.name)
                    }}
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
                      {c.name}
                    </Text>
                  </AnimatedPressable>
                )
              })}
            </View>
          </ScrollView>
        </View>

        {/* Primary Color */}
        <View>
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-1.5">
            Primary Color
          </Text>
          <View className="flex-row items-center gap-2">
            {editedColor ? (
              <View
                className="w-8 h-8 rounded-full border-2 border-lavender-200"
                style={{ backgroundColor: resolveFashionColor(editedColor) }}
              />
            ) : null}
            <TextInput
              value={editedColor}
              onChangeText={dirty(setEditedColor)}
              placeholder="e.g. Rani Pink, Mustard, Navy Blue"
              placeholderTextColor="#928EB2"
              className="flex-1 text-sm text-spaceCadet-900 bg-lavender-50 rounded-2xl border border-lavender-200 px-4 py-3"
            />
          </View>
        </View>

        {/* Pattern */}
        <View>
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
            Pattern / Work
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
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
          </ScrollView>
        </View>

        {/* Style Silhouettes */}
        {availableStyles.length > 0 && (
          <View>
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
              Styles / Silhouettes
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
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
            </ScrollView>
          </View>
        )}

        {/* Fabrics */}
        {availableFabrics.length > 0 && (
          <View>
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
              Fabrics
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
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
            </ScrollView>
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
                      ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm'
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
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
            Rack / Shelf Location
          </Text>
          <TextInput
            value={location}
            onChangeText={dirty(setLocation)}
            placeholder="e.g. Rack 3, Shelf B"
            placeholderTextColor={colors.sand[400]}
            className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3 py-2.5"
          />
        </View>

        {/* Internal store notes */}
        <View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
            Store Notes (Private)
          </Text>
          <TextInput
            value={notes}
            onChangeText={dirty(setNotes)}
            placeholder="Wholesale price, supplier info, restock reminders..."
            placeholderTextColor={colors.sand[400]}
            multiline
            numberOfLines={3}
            className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3 py-2.5"
            style={{ textAlignVertical: 'top' }}
          />
        </View>
      </View>
    </View>
  )
}

