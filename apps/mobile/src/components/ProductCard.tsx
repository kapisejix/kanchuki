/**
 * Reusable ProductCard component.
 *
 * Encapsulates the Android elevation + rounded-corner fix (elevation on outer
 * node, overflow-hidden rounded-2xl on inner node so the Image renders).
 *
 * Usage:
 *   <ProductCard
 *     imageUrl={product.primary_photo_url}
 *     onPress={() => router.push(`/product/${product.id}`)}
 *     footer={
 *       <View>
 *         <Text>{product.category}</Text>
 *         <Text>{formatPriceRange(product.price_min, product.price_max)}</Text>
 *       </View>
 *     }
 *   />
 */

import React, { memo, useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'

// Blurhash placeholder for product images (neutral grey)
const BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4'

export interface ProductCardProps {
  /** Product photo URL (nullable — shows placeholder fallback) */
  imageUrl: string | null
  /** Tap handler */
  onPress: () => void
  /** Optional: long-press handler (e.g. enter bulk-selection mode) */
  onLongPress?: () => void
  /** Footer content rendered below the image */
  footer: React.ReactNode
  /** Elevation level (default 2) */
  elevation?: number
  /** Override the outer container style (e.g. width) */
  style?: ViewStyle
  /** Whether to use flex-1 layout (for grid) */
  flex?: boolean
  /** Optional: Top-left status badge text (e.g. "SOLD", "RESERVED") */
  statusBadge?: string | null
  /** Optional: Small dot indicator when AI tagging is pending */
  showAIDot?: boolean
  /** Optional: Selected state overlay (checkmark) */
  selected?: boolean
  /** Optional: Custom image height (defaults to aspect-[3/4]) */
  imageHeight?: number
  /** Optional: Enable image caching policy */
  cachePolicy?: 'memory-disk' | 'memory' | 'disk'
  /** Optional: Placeholder icon shown when no image URL */
  placeholderIcon?: string
}

const ProductCard = memo(function ProductCard({
  imageUrl,
  onPress,
  onLongPress,
  footer,
  elevation = 2,
  style,
  flex = true,
  statusBadge,
  showAIDot,
  selected,
  imageHeight,
  cachePolicy = 'memory-disk',
  placeholderIcon = '📦',
}: ProductCardProps) {
  const [imageError, setImageError] = useState(false)

  // Reset error state when imageUrl changes (e.g. new photo uploaded)
  useEffect(() => setImageError(false), [imageUrl])

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      // Elevation on outer node, but NOT rounded — elevation + rounded-2xl
      // on the same node clips the Image on Android. Inner View handles
      // rounding and overflow clipping.
      className={`bg-white border border-gray-200 ${flex ? 'flex-1' : ''}`}
      style={[{ elevation }, style]}
      activeOpacity={0.95}
    >
      <View className="rounded-2xl overflow-hidden">
        {/* Image container */}
        <View
          className="w-full bg-gray-100"
          style={
            imageHeight
              ? { height: imageHeight }
              : { aspectRatio: 3 / 4 }
          }
        >
          {imageUrl && !imageError ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              placeholder={imageHeight ? undefined : { blurhash: BLURHASH }}
              transition={300}
              cachePolicy={cachePolicy}
              onError={() => setImageError(true)}
            />
          ) : (
            <View className="w-full h-full items-center justify-center bg-gray-50">
              <Text className="text-gray-300 text-3xl">{imageError ? '⚠️' : placeholderIcon}</Text>
              {imageError && (
                <Text className="text-gray-400 text-[10px] mt-1">Image error</Text>
              )}
            </View>
          )}

          {/* Status badge (top-left) */}
          {statusBadge && (
            <View className="absolute top-2 left-2 bg-red-500/90 px-2 py-0.5 rounded-full">
              <Text className="text-white text-xs font-semibold">{statusBadge}</Text>
            </View>
          )}

          {/* AI tagging pending indicator (top-right) */}
          {showAIDot && (
            <View className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-amber-400 border border-white" />
          )}

          {/* Selected checkmark overlay */}
          {selected && (
            <View className="absolute top-2 right-2 w-6 h-6 bg-cyan-600 rounded-full items-center justify-center">
              <Text className="text-white text-xs font-bold">✓</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        {footer}
      </View>
    </TouchableOpacity>
  )
})

export default ProductCard
