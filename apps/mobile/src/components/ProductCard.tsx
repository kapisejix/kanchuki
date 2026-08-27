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
import { COLORS } from '@kanchuki/shared'
import { View, Text, type ViewStyle } from 'react-native'
import { Image } from 'expo-image'
import { AnimatedPressable } from './AnimatedPressable'

// iOS shadow (Android keeps its own `elevation` prop, RN can't share one style key for both).
const CARD_SHADOW: ViewStyle = {
  shadowColor: '#231F48',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 10,
}

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
  /** Optional: WhatsApp catalog sync badge (bottom-right dot): green = synced,
   *  amber = pending, red = error. Only rendered when provided. (Phase II F7) */
  catalogSyncStatus?: 'SUCCESS' | 'FAILED' | 'PARTIAL' | 'IN_PROGRESS' | null
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
  catalogSyncStatus,
  selected,
  imageHeight,
  cachePolicy = 'memory-disk',
  placeholderIcon = '📦',
}: ProductCardProps) {
  const [imageError, setImageError] = useState(false)

  // Reset error state when imageUrl changes (e.g. new photo uploaded)
  useEffect(() => setImageError(false), [imageUrl])

  return (
    <AnimatedPressable
      onPress={onPress}
      onLongPress={onLongPress}
      className={`bg-white border border-lavender-200 rounded-3xl ${flex ? 'flex-1' : ''}`}
      style={[{ elevation }, CARD_SHADOW, style]}
    >
      <View className="rounded-3xl overflow-hidden p-1.5 bg-white">
        {/* Image container */}
        <View
          className="w-full bg-lavender-100 rounded-2xl overflow-hidden"
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
            <View className="w-full h-full items-center justify-center bg-lavender-50">
              <Text className="text-heliotrope-400 text-3xl">{imageError ? '⚠️' : placeholderIcon}</Text>
              {imageError && (
                <Text className="text-heliotrope-500 text-[10px] mt-1">Image error</Text>
              )}
            </View>
          )}

          {/* Status badge (top-left) */}
          {statusBadge && (
            <View className="absolute top-2 left-2 bg-tyrian-800/90 px-2.5 py-0.5 rounded-full shadow-sm">
              <Text className="text-white text-[10px] font-bold uppercase tracking-wider">{statusBadge}</Text>
            </View>
          )}

          {/* AI tagging pending indicator (top-right) */}
          {showAIDot && (
            <View className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-fuchsia-500 border border-white" />
          )}

          {/* WhatsApp catalog sync badge (bottom-right) — F7 */}
          {catalogSyncStatus && (
            <View
              className="absolute bottom-2 right-2 w-3 h-3 rounded-full border border-white"
              style={{
                backgroundColor:
                  catalogSyncStatus === 'SUCCESS'
                    ? '#059669' // emerald-600 — synced
                    : catalogSyncStatus === 'FAILED'
                      ? '#dc2626' // red-600 — error
                      : '#d97706', // amber-600 — pending / partial
              }}
            />
          )}

          {/* Selected checkmark overlay */}
          {selected && (
            <View className="absolute top-2 right-2 w-6 h-6 bg-fuchsia-600 rounded-full items-center justify-center shadow-sm">
              <Text className="text-white text-xs font-bold">✓</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View className="px-2 pt-2 pb-1">
          {footer}
        </View>
      </View>
    </AnimatedPressable>
  )
})

export default ProductCard
