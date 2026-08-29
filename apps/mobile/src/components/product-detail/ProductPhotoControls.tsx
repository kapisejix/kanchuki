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
  currentPhoto: { id: string; is_video?: boolean } | undefined
  currentPhotoIsOriginal: boolean
  currentPhotoIsVariant: boolean
  backgroundImages: BackgroundImage[]
  photoBackgrounds: Record<string, string | null>
  backgroundSaving: boolean
  handleSetBackground: (backgroundId: string | null) => void
  shadowOn: boolean
  shadowSaving: boolean
  handleSetShadow: (value: boolean) => void
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
  primaryColor,
}: ProductPhotoControlsProps) {
  if (!currentPhoto || currentPhotoIsOriginal || currentPhotoIsVariant || currentPhoto.is_video) {
    return null
  }

  const selectedBg = photoBackgrounds[currentPhoto.id] ?? null

  return (
    <View className="mx-4 my-2 bg-white rounded-3xl border border-lavender-200 shadow-sm overflow-hidden" style={{ elevation: 3 }}>
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
    </View>
  )
}
