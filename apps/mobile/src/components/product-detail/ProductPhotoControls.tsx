import React from 'react'
import { View, Text, ScrollView, ActivityIndicator, Switch } from 'react-native'
import { Image } from 'expo-image'
import { AnimatedPressable } from '../AnimatedPressable'

interface BackgroundImage {
  id: string
  name: string
  image_url: string
  thumbnail_url: string | null
}

interface ProductPhotoControlsProps {
  currentPhoto: { id: string; is_video?: boolean; is_primary?: boolean } | undefined
  currentPhotoIsOriginal: boolean
  currentPhotoIsVariant: boolean
  backgroundImages: BackgroundImage[]
  photoBackgrounds: Record<string, string | null>
  backgroundSaving: boolean
  handleSetBackground: (backgroundId: string | null) => void
  shadowOn: boolean
  shadowSaving: boolean
  handleSetShadow: (value: boolean) => void
  // #5: promote the currently-viewed photo to the product's main image.
  handleSetPrimary: (photoId: string) => void
  settingPrimaryId: string | null
  primaryColor: string
}

/**
 * Per-photo post-save controls on the product detail screen: remove/replace
 * the backdrop (Auto chip = AI-picked contrasting backdrop) and toggle a soft
 * grounding shadow. Each tap re-runs the server cleanup on the currently-viewed
 * photo. Hidden on the synthetic "original" slide (not a real ProductPhoto row)
 * and on video slides.
 */
export function ProductPhotoControls({
  currentPhoto,
  currentPhotoIsOriginal,
  currentPhotoIsVariant,
  backgroundImages,
  photoBackgrounds,
  backgroundSaving,
  handleSetBackground,
  shadowOn,
  shadowSaving,
  handleSetShadow,
  handleSetPrimary,
  settingPrimaryId,
  primaryColor,
}: ProductPhotoControlsProps) {
  // Video slides can't be the catalog image — nothing to show.
  if (!currentPhoto || currentPhoto.is_video) {
    return null
  }

  const selectedBg = photoBackgrounds[currentPhoto.id] ?? null
  const isPrimary = currentPhoto.is_primary ?? false
  const savingPrimary = settingPrimaryId === currentPhoto.id
  // Variant preview / synthetic "original" slides have no real ProductPhoto
  // row — "Set as Main" materializes one server-side, but the backdrop +
  // shadow controls still need a real photo, so those stay hidden here.
  const photoOnly = currentPhotoIsVariant || currentPhotoIsOriginal

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
          disabled={backgroundSaving || shadowSaving || savingPrimary || settingPrimaryId !== null}
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

      {photoOnly ? null : (
      <>
      {/* Shadow toggle */}
      <View className="flex-row items-center justify-between px-4 py-3.5 border-b border-lavender-100">
        <View className="flex-1 pr-3">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">Shadow</Text>
          <Text className="text-[11px] text-heliotrope-500 mt-0.5">
            Soft shadow under the product for a grounded, studio look
          </Text>
        </View>
        {shadowSaving ? (
          <ActivityIndicator size="small" color={primaryColor} />
        ) : (
          <Switch
            value={shadowOn}
            onValueChange={(v) => handleSetShadow(v)}
            disabled={backgroundSaving}
            accessibilityLabel="Toggle photo shadow"
          />
        )}
      </View>

      {/* Background picker — Auto chip removes the raw backdrop and lets the AI
          pick a contrasting one; the rest are the admin backdrop library. */}
      <View className="px-4 py-3.5">
        <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-3">Background</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            <AnimatedPressable
              onPress={() => handleSetBackground(null)}
              disabled={backgroundSaving}
              className={`w-16 h-16 rounded-2xl items-center justify-center border-2 bg-lavender-50 ${
                selectedBg === null ? 'border-fuchsia-600' : 'border-lavender-200'
              }`}
            >
              <Text className="text-[10px] font-bold text-heliotrope-500">Auto</Text>
            </AnimatedPressable>
            {backgroundImages.map((bg) => (
              <AnimatedPressable
                key={bg.id}
                onPress={() => handleSetBackground(bg.id)}
                disabled={backgroundSaving}
                className={`w-16 h-16 rounded-2xl overflow-hidden border-2 ${
                  selectedBg === bg.id ? 'border-fuchsia-600' : 'border-lavender-200'
                }`}
              >
                <Image
                  source={{ uri: bg.thumbnail_url ?? bg.image_url }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              </AnimatedPressable>
            ))}
          </View>
        </ScrollView>
        {backgroundSaving && (
          <View className="flex-row items-center gap-2 mt-3">
            <ActivityIndicator size="small" color={primaryColor} />
            <Text className="text-[11px] text-heliotrope-500">Applying background…</Text>
          </View>
        )}
      </View>
      </>
      )}
    </View>
  )
}
