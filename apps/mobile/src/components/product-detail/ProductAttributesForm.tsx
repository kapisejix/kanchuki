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
      {/* Price input */}
      <View className="bg-white rounded-2xl p-4 border border-sand-100">
        <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
          Price (₹)
        </Text>
        <TextInput
          value={price}
          onChangeText={dirty(setPrice)}
          placeholder="e.g. 1500"
          keyboardType="numeric"
          className="text-lg font-bold text-sand-900"
          placeholderTextColor={colors.sand[400]}
        />
        <Text className="text-xs text-sand-400 mt-1.5">
          Selling price — AI handles the tags. Edit below only if needed.
        </Text>
      </View>

      {/* Color variants swatches */}
      <View className="bg-white rounded-2xl p-4 border border-sand-100">
        <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
          Colors · Same Design
        </Text>
        {product.variants.length === 0 ? (
          <View className="bg-sand-50 rounded-xl px-4 py-3">
            <Text className="text-xs text-sand-400 text-center">
              No color variants yet. Add photos of the same design in different colors.
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-3">
              {product.variants.map((variant) => {
                const variantPhotoIndex = variant.photo_url
                  ? displayPhotos.findIndex((p) => p.url === variant.photo_url)
                  : -1
                const isActive = variantPhotoIndex === selectedPhotoIndex
                return (
                  <AnimatedPressable
                    key={variant.id}
                    onPress={() => {
                      if (variantPhotoIndex >= 0) {
                        goToPhoto(isActive ? 0 : variantPhotoIndex)
                      }
                    }}
                    className={`items-center gap-1.5 ${isActive ? 'opacity-100' : 'opacity-80'}`}
                  >
                    <View
                      className={`w-9 h-9 rounded-full border-2 ${
                        isActive ? 'border-ink-600' : 'border-sand-200'
                      }`}
                      style={{ backgroundColor: resolveFashionColor(variant.color) }}
                    />
                    <View className="flex-row items-center gap-1">
                      {isActive && <Check size={10} color={primaryColor} />}
                      <Text
                        className={`text-xs font-medium ${isActive ? 'text-ink-700' : 'text-sand-500'}`}
                      >
                        {variant.color}
                      </Text>
                    </View>
                  </AnimatedPressable>
                )
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* AI Summary card */}
      <View className="bg-white rounded-2xl p-4 border border-sand-100">
        <View className="flex-row items-center gap-2 mb-2">
          <Sparkles size={14} color={primaryColor} />
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
            AI Summary
          </Text>
        </View>
        {product.name ? (
          <Text className="text-sm font-semibold text-sand-700">{product.name}</Text>
        ) : null}
        <Text className="text-base font-bold text-sand-900">
          {product.subtype ?? product.category ?? 'Uncategorized'}
          {product.primary_color ? ` · ${product.primary_color}` : ''}
        </Text>
        <Text className="text-sm text-sand-500 mt-0.5">
          {[product.fabric_estimate, product.pattern].filter(Boolean).join(' · ') ||
            'AI details pending'}
        </Text>
      </View>

      {/* Editable Fields Container */}
      <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-4">
        {/* Product Title / Name */}
        <View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
            Product Title
          </Text>
          <TextInput
            value={editedName}
            onChangeText={dirty(setEditedName)}
            placeholder="e.g. Pink Embroidered Anarkali Suit"
            placeholderTextColor={colors.sand[400]}
            className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3 py-2.5"
          />
        </View>

        {/* Subtype / Garment Type */}
        <View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
            Garment Subtype
          </Text>
          <TextInput
            value={editedSubtype}
            onChangeText={dirty(setEditedSubtype)}
            placeholder="e.g. Anarkali Suit, Kurta Set, Lehenga Choli"
            placeholderTextColor={colors.sand[400]}
            className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3 py-2.5"
          />
        </View>

        {/* Category */}
        <View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
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
                    className={`px-3 py-2 rounded-xl border ${
                      isSelected
                        ? 'bg-ink-600 border-ink-600'
                        : 'bg-sand-50 border-sand-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        isSelected ? 'text-white' : 'text-sand-700'
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
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
            Primary Color
          </Text>
          <View className="flex-row items-center gap-2">
            {editedColor ? (
              <View
                className="w-7 h-7 rounded-full border border-sand-200"
                style={{ backgroundColor: resolveFashionColor(editedColor) }}
              />
            ) : null}
            <TextInput
              value={editedColor}
              onChangeText={dirty(setEditedColor)}
              placeholder="e.g. Rani Pink, Mustard, Navy Blue"
              placeholderTextColor={colors.sand[400]}
              className="flex-1 text-sm text-sand-900 bg-sand-50 rounded-xl px-3 py-2.5"
            />
          </View>
        </View>

        {/* Pattern */}
        <View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
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
                    className={`px-3 py-2 rounded-xl border ${
                      isSelected
                        ? 'bg-ink-600 border-ink-600'
                        : 'bg-sand-50 border-sand-200'
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        isSelected ? 'text-white' : 'text-sand-700'
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
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
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
                      className={`px-3 py-2 rounded-xl border ${
                        isSelected
                          ? 'bg-ink-600 border-ink-600'
                          : 'bg-sand-50 border-sand-200'
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          isSelected ? 'text-white' : 'text-sand-700'
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
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
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
                      className={`px-3 py-2 rounded-xl border ${
                        isSelected
                          ? 'bg-ink-600 border-ink-600'
                          : 'bg-sand-50 border-sand-200'
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium ${
                          isSelected ? 'text-white' : 'text-sand-700'
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
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
            Available Sizes
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {SIZE_OPTIONS.map((size) => {
              const isSelected = selectedSizes.includes(size)
              return (
                <AnimatedPressable
                  key={size}
                  onPress={() => toggleSize(size)}
                  className={`px-4 py-2 rounded-xl border ${
                    isSelected
                      ? 'bg-ink-600 border-ink-600'
                      : 'bg-sand-50 border-sand-200'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? 'text-white' : 'text-sand-700'
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
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
              SKU / Product Code
            </Text>
            <AnimatedPressable
              onPress={onOpenSkuTagModal}
              className="flex-row items-center gap-1 bg-ink-50 px-2 py-1 rounded-lg"
            >
              <Tag size={12} color={primaryColor} />
              <Text className="text-ink-700 text-[10px] font-semibold">Print Price Tag</Text>
            </AnimatedPressable>
          </View>
          <TextInput
            value={editedSku}
            onChangeText={dirty(setEditedSku)}
            placeholder="e.g. KUR-001 or scan barcode"
            placeholderTextColor={colors.sand[400]}
            className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3 py-2.5"
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

