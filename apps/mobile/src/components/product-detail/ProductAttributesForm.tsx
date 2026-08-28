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
      {/* ── Top Title, Price, Color & Size Card (Point 10 PDP Specification) ── */}
      <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm gap-4">
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

        {/* 2-Column Row for Color & Size (Point 10 PDP) */}
        <View className="flex-row gap-4 pt-3 border-t border-lavender-100">
          {/* Left Column: Color dots */}
          <View className="flex-1">
            <Text className="text-xs font-bold text-heliotrope-600 block mb-2">Color</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row items-center gap-2 py-1">
                {product.variants.length > 0 ? (
                  product.variants.map((variant) => {
                    const variantPhotoIndex = variant.photo_url
                      ? displayPhotos.findIndex((p) => p.url === variant.photo_url)
                      : -1
                    const isActive = variantPhotoIndex === selectedPhotoIndex || editedColor === variant.color
                    const hex = resolveFashionColor(variant.color)
                    return (
                      <AnimatedPressable
                        key={variant.id}
                        onPress={() => {
                          dirty(setEditedColor)(variant.color)
                          if (variantPhotoIndex >= 0) {
                            goToPhoto(variantPhotoIndex)
                          }
                        }}
                        className={`w-8 h-8 rounded-full items-center justify-center border-2 ${
                          isActive ? 'border-spaceCadet-900 scale-105 shadow-sm' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: hex }}
                      >
                        {isActive && <Check size={13} color="#ffffff" strokeWidth={3} />}
                      </AnimatedPressable>
                    )
                  })
                ) : (
                  <View className="flex-row items-center gap-2">
                    <View
                      className="w-8 h-8 rounded-full border-2 border-spaceCadet-900 items-center justify-center"
                      style={{ backgroundColor: resolveFashionColor(editedColor || '#6B4773') }}
                    >
                      <Check size={13} color="#ffffff" strokeWidth={3} />
                    </View>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>

          {/* Right Column: Size circles */}
          <View className="flex-1">
            <Text className="text-xs font-bold text-heliotrope-600 block mb-2">Size</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row items-center gap-2 py-1">
                {['XS', 'S', 'M', 'L', 'XL', 'XXL'].map((size) => {
                  const isSelected = selectedSizes.includes(size)
                  return (
                    <AnimatedPressable
                      key={size}
                      onPress={() => toggleSize(size)}
                      className={`w-8 h-8 rounded-full items-center justify-center ${
                        isSelected
                          ? 'bg-spaceCadet-900 shadow-sm'
                          : 'bg-lavender-100'
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-extrabold ${
                          isSelected ? 'text-white' : 'text-spaceCadet-900'
                        }`}
                      >
                        {size}
                      </Text>
                    </AnimatedPressable>
                  )
                })}
              </View>
            </ScrollView>
          </View>
        </View>
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

