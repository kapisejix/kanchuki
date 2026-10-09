import React from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { AnimatedPressable } from '../AnimatedPressable'

interface ProductPhotoControlsProps {
  currentPhoto: { id: string; is_video?: boolean; is_primary?: boolean } | undefined
  // #5: promote the currently-viewed photo to the product's main image.
  handleSetPrimary: (photoId: string) => void
  settingPrimaryId: string | null
  primaryColor: string
}

/**
 * Per-photo post-save control on the product detail screen: "Set as Main".
 * (Background + shadow controls were removed 2026-10-09 with background removal.)
 */
export function ProductPhotoControls({
  currentPhoto,
  handleSetPrimary,
  settingPrimaryId,
  primaryColor,
}: ProductPhotoControlsProps) {
  // Video slides can't be the catalog image — nothing to show.
  if (!currentPhoto || currentPhoto.is_video) {
    return null
  }

  const isPrimary = currentPhoto.is_primary ?? false
  const savingPrimary = settingPrimaryId === currentPhoto.id
  return (
    <View className="mx-4 my-2 bg-white rounded-3xl border border-lavender-200 shadow-sm overflow-hidden" style={{ elevation: 3 }}>
      {/* #5: Set as Main — promote this photo to the catalog's main image.
          Shown on every non-video slide so the retailer can promote any
          thumbnail; the already-main slide shows a disabled marker. */}
      {isPrimary ? (
        <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-lavender-100">
          <View className="flex-1 pr-3">
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">Main Photo</Text>
            <Text className="text-[11px] text-heliotrope-500 mt-0.5">
              This is the photo shown on your catalog and storefront
            </Text>
          </View>
          <Text className="text-heliotrope-400 text-xs font-bold uppercase tracking-wider">✓ Main</Text>
        </View>
      ) : (
        <AnimatedPressable
          onPress={() => handleSetPrimary(currentPhoto.id)}
          disabled={savingPrimary || settingPrimaryId !== null}
          accessibilityLabel="Set as Main image"
          accessibilityRole="button"
          className="flex-row items-center justify-between px-4 py-3.5 border-b border-lavender-100"
        >
          <View className="flex-1 pr-3">
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">Set as Main</Text>
            <Text className="text-[11px] text-heliotrope-500 mt-0.5">
              Make this the photo shown on your catalog and storefront
            </Text>
          </View>
          {savingPrimary ? (
            <ActivityIndicator size="small" color={primaryColor} />
          ) : (
            <Text className="text-fuchsia-600 text-xs font-bold uppercase tracking-wider">Set →</Text>
          )}
        </AnimatedPressable>
      )}

    </View>
  )
}
