import React, { useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import Gallery, { type GalleryRef } from 'react-native-awesome-gallery'
import {
  Download,
  Trash2,
  Palette,
  ChevronLeft,
  ChevronRight,
  Camera,
  Video,
  Sparkles,
  Star,
  Clapperboard,
  X,
  Check,
} from 'lucide-react-native'
import { resolveFashionColor } from '@kanchuki/shared'
import { AnimatedPressable } from '../AnimatedPressable'
import type { ProductDetail } from '@kanchuki/shared'

interface DisplayPhoto {
  id: string
  url: string
  is_primary: boolean
  is_variant_preview?: boolean
  is_original_preview?: boolean
  variant_color?: string
  is_video?: boolean
  video_duration?: number | null
}

interface ProductMediaCarouselProps {
  product: ProductDetail
  displayPhotos: DisplayPhoto[]
  selectedPhotoIndex: number
  setSelectedPhotoIndex: (idx: number) => void
  carouselWidth: number
  setCarouselWidth: (w: number) => void
  galleryRef: React.RefObject<any>
  setFullscreenOpen: (open: boolean) => void
  displayUrl: (photo: DisplayPhoto) => string
  imageErrors: Set<string>
  setImageErrors: React.Dispatch<React.SetStateAction<Set<string>>>
  primaryColor: string
  colors: any
  currentPhoto: DisplayPhoto | undefined
  currentPhotoIsVariant: boolean
  currentPhotoIsOriginal: boolean
  downloadingMedia: boolean
  handleDownloadCurrentMedia: () => void
  deletingMedia: boolean
  handleDeleteCurrentMedia: () => void
  detectingColor: boolean
  handleDetectColor: () => void
  detectedColor: string | null
  setDetectedColor: (c: string | null) => void
  dirtyColorSetter: (c: string) => void
  colorDetectError: string | null
  goToPhoto: (idx: number) => void
  handleProductVideoPress: () => void
  videoGenerating: boolean
  generateVideoPending: boolean
  productVideosCount: number
  setStudioModalOpen: (open: boolean) => void
  studioStarting: boolean
  studioStatus: 'processing' | 'ready' | 'failed' | null
  originalPhoto: any
  studioQuota: { unlimited?: boolean; remaining?: number } | undefined
  ProductVideoSlide: React.ComponentType<{ url: string; width: number; height: number }>
}

export function ProductMediaCarousel({
  product,
  displayPhotos,
  selectedPhotoIndex,
  setSelectedPhotoIndex,
  carouselWidth,
  setCarouselWidth,
  galleryRef,
  setFullscreenOpen,
  displayUrl,
  imageErrors,
  setImageErrors,
  primaryColor,
  colors,
  currentPhoto,
  currentPhotoIsVariant,
  currentPhotoIsOriginal,
  downloadingMedia,
  handleDownloadCurrentMedia,
  deletingMedia,
  handleDeleteCurrentMedia,
  detectingColor,
  handleDetectColor,
  detectedColor,
  setDetectedColor,
  dirtyColorSetter,
  colorDetectError,
  goToPhoto,
  handleProductVideoPress,
  videoGenerating,
  generateVideoPending,
  productVideosCount,
  setStudioModalOpen,
  studioStarting,
  studioStatus,
  originalPhoto,
  studioQuota,
  ProductVideoSlide,
}: ProductMediaCarouselProps) {
  return (
    <View className="bg-white shadow-md" style={{ elevation: 4 }}>
      {/* Swipeable photo carousel */}
      <View
        className="relative"
        style={{ height: 380 }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width
          if (w > 0 && w !== carouselWidth) setCarouselWidth(w)
        }}
      >
        {displayPhotos.length > 0 ? (
          <Gallery
            ref={galleryRef}
            data={displayPhotos}
            keyExtractor={(photo) => photo.id}
            initialIndex={selectedPhotoIndex}
            onIndexChange={setSelectedPhotoIndex}
            onTap={() => setFullscreenOpen(true)}
            containerDimensions={{ width: carouselWidth, height: 380 }}
            style={{ width: carouselWidth, height: 380 }}
            renderItem={({ item: photo }) =>
              photo.is_video ? (
                <ProductVideoSlide url={photo.url} width={carouselWidth} height={380} />
              ) : !imageErrors.has(photo.url) ? (
                <Image
                  source={{ uri: displayUrl(photo) }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                  onError={() => setImageErrors((prev) => new Set(prev).add(photo.url))}
                />
              ) : (
                <View className="w-full h-full bg-sand-100 items-center justify-center">
                  <Text className="text-sand-300 text-5xl mb-2">👗</Text>
                  <Text className="text-sand-400 text-xs">Image unavailable</Text>
                </View>
              )
            }
          />
        ) : (
          <View className="w-full h-full bg-sand-100 items-center justify-center">
            <Text className="text-sand-300 text-5xl mb-2">👗</Text>
            <Text className="text-sand-400 text-xs">No photos</Text>
          </View>
        )}

        {/* Left arrow */}
        {displayPhotos.length > 1 && selectedPhotoIndex > 0 && (
          <AnimatedPressable
            onPress={() => goToPhoto(selectedPhotoIndex - 1)}
            accessibilityLabel="Previous photo"
            accessibilityRole="button"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 items-center justify-center shadow-sm"
            style={{ elevation: 3, zIndex: 10 }}
          >
            <ChevronLeft size={20} color={colors.sand[700]} />
          </AnimatedPressable>
        )}

        {/* Right arrow */}
        {displayPhotos.length > 1 && selectedPhotoIndex < displayPhotos.length - 1 && (
          <AnimatedPressable
            onPress={() => goToPhoto(selectedPhotoIndex + 1)}
            accessibilityLabel="Next photo"
            accessibilityRole="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 items-center justify-center shadow-sm"
            style={{ elevation: 3, zIndex: 10 }}
          >
            <ChevronRight size={20} color={colors.sand[700]} />
          </AnimatedPressable>
        )}

        {/* Video badge */}
        {currentPhoto?.is_video && (
          <View className="absolute top-3 left-3 bg-ink-900/90 px-3 py-1 rounded-full flex-row items-center gap-1.5 shadow-sm">
            <Clapperboard size={12} color="white" />
            <Text className="text-white text-xs font-semibold">
              Product Video ({currentPhoto.video_duration ?? 6}s)
            </Text>
          </View>
        )}

        {/* Variant badge */}
        {!currentPhoto?.is_video && currentPhotoIsVariant && currentPhoto?.variant_color && (
          <View className="absolute top-3 left-3 bg-ink-600/90 px-3 py-1 rounded-full flex-row items-center gap-1">
            <Palette size={12} color="white" />
            <Text className="text-white text-xs font-semibold">{currentPhoto.variant_color}</Text>
          </View>
        )}

        {/* Original badge */}
        {!currentPhoto?.is_video && currentPhotoIsOriginal && (
          <View className="absolute top-3 left-3 bg-sand-700/90 px-3 py-1 rounded-full">
            <Text className="text-white text-xs font-semibold">Original</Text>
          </View>
        )}

        {/* Main image badge */}
        {!currentPhoto?.is_video &&
          currentPhoto?.is_primary &&
          !currentPhotoIsVariant &&
          !currentPhotoIsOriginal && (
            <View className="absolute top-3 left-3 bg-turmeric-600/90 px-3 py-1 rounded-full flex-row items-center gap-1">
              <Star size={11} color="white" fill="white" />
              <Text className="text-white text-xs font-semibold">Main</Text>
            </View>
          )}

        {/* Download current media */}
        {displayPhotos.length > 0 && currentPhoto && (
          <AnimatedPressable
            onPress={handleDownloadCurrentMedia}
            disabled={downloadingMedia}
            accessibilityLabel="Download current image or video"
            accessibilityRole="button"
            className={`absolute top-3 w-9 h-9 rounded-full bg-white/80 items-center justify-center shadow-sm ${
              currentPhoto?.is_video ? 'right-14' : 'right-24'
            }`}
            style={{ elevation: 3, zIndex: 10 }}
          >
            {downloadingMedia ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <Download size={16} color={colors.sand[700]} />
            )}
          </AnimatedPressable>
        )}

        {/* Delete current media */}
        {displayPhotos.length > 0 && currentPhoto && (
          <AnimatedPressable
            onPress={handleDeleteCurrentMedia}
            disabled={deletingMedia}
            accessibilityLabel="Delete current image"
            accessibilityRole="button"
            className={`absolute top-3 w-9 h-9 rounded-full bg-white/80 items-center justify-center shadow-sm ${
              currentPhoto?.is_video ? 'right-3' : 'right-14'
            }`}
            style={{ elevation: 3, zIndex: 10 }}
          >
            {deletingMedia ? (
              <ActivityIndicator size="small" color={colors.rust[600]} />
            ) : (
              <Trash2 size={16} color={colors.rust[600]} />
            )}
          </AnimatedPressable>
        )}

        {/* Detect color from photo */}
        {!currentPhoto?.is_video && (
          <AnimatedPressable
            onPress={handleDetectColor}
            disabled={detectingColor}
            accessibilityLabel="Detect color from photo"
            accessibilityRole="button"
            className="absolute right-3 top-3 w-9 h-9 rounded-full bg-white/80 items-center justify-center shadow-sm"
            style={{ elevation: 3, zIndex: 10 }}
          >
            {detectingColor ? (
              <ActivityIndicator size="small" color={colors.sand[700]} />
            ) : (
              <Palette size={16} color={colors.sand[700]} />
            )}
          </AnimatedPressable>
        )}

        {/* Detected-color confirm chip */}
        {detectedColor && (
          <View
            className="absolute right-3 bottom-12 bg-white/95 rounded-2xl px-3 py-2 flex-row items-center gap-2 shadow-md"
            style={{ elevation: 4, zIndex: 10 }}
          >
            <View
              className="w-6 h-6 rounded-full border-2 border-white"
              style={{ backgroundColor: resolveFashionColor(detectedColor) }}
            />
            <Text className="text-xs font-semibold text-sand-900 max-w-[120px]" numberOfLines={1}>
              {detectedColor}
            </Text>
            <AnimatedPressable
              onPress={() => {
                dirtyColorSetter(detectedColor)
                setDetectedColor(null)
              }}
              className="bg-ink-600 px-2.5 py-1 rounded-full"
            >
              <Text className="text-white text-[10px] font-bold">Use</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => setDetectedColor(null)}
              accessibilityLabel="Dismiss detected color"
              accessibilityRole="button"
              hitSlop={6}
            >
              <X size={14} color={colors.sand[600]} />
            </AnimatedPressable>
          </View>
        )}

        {/* Color detection error hint */}
        {colorDetectError && (
          <View
            className="absolute left-3 right-3 bottom-12 bg-rust-50/95 rounded-xl px-3 py-1.5"
            style={{ zIndex: 10 }}
          >
            <Text className="text-rust-600 text-[10px] text-center">{colorDetectError}</Text>
          </View>
        )}

        {/* Dot indicators */}
        {displayPhotos.length > 1 && (
          <View className="absolute bottom-3 left-0 right-0 flex-row justify-center gap-1.5">
            {displayPhotos.map((p, idx) => (
              <AnimatedPressable
                key={idx}
                onPress={() => goToPhoto(idx)}
                className={`w-2 h-2 rounded-full ${
                  idx === selectedPhotoIndex
                    ? 'bg-white w-3'
                    : p.is_video
                      ? 'bg-turmeric-400'
                      : 'bg-white/50'
                }`}
              />
            ))}
          </View>
        )}
      </View>

      {/* Thumbnail strip */}
      {displayPhotos.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-3 pb-2 pt-2 bg-white"
        >
          <View className="flex-row gap-2">
            {displayPhotos.map((photo, idx) => {
              const isSelected = idx === selectedPhotoIndex
              const isVariant = photo.is_variant_preview
              const isOriginal = photo.is_original_preview
              const isVideo = photo.is_video
              return (
                <AnimatedPressable
                  key={photo.id}
                  onPress={() => goToPhoto(idx)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 ${
                    isSelected ? 'border-ink-600' : 'border-sand-200'
                  }`}
                >
                  {isVideo ? (
                    <View className="w-full h-full bg-sand-900 items-center justify-center">
                      <Clapperboard size={22} color="white" />
                      <View className="absolute bottom-0 left-0 right-0 bg-black/80 py-0.5">
                        <Text className="text-white text-[8px] text-center font-bold">
                          {photo.video_duration ? `${photo.video_duration}s` : 'VIDEO'}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: displayUrl(photo) }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  )}
                  {isVariant && (
                    <View className="absolute bottom-0 left-0 right-0 bg-ink-600/80 py-0.5">
                      <Text className="text-white text-[8px] text-center font-medium">
                        {photo.variant_color ?? ''}
                      </Text>
                    </View>
                  )}
                  {isOriginal && (
                    <View className="absolute bottom-0 left-0 right-0 bg-sand-700/80 py-0.5">
                      <Text className="text-white text-[8px] text-center font-medium">
                        Original
                      </Text>
                    </View>
                  )}
                  {photo.is_primary && !isVariant && !isOriginal && !isVideo && (
                    <View className="absolute bottom-0 left-0 right-0 bg-turmeric-600/80 py-0.5">
                      <Text className="text-white text-[8px] text-center font-medium">Main</Text>
                    </View>
                  )}
                </AnimatedPressable>
              )
            })}
          </View>
        </ScrollView>
      )}

      {/* Action buttons row */}
      <View className="flex-row gap-2 px-3 pb-3 pt-1">
        <AnimatedPressable
          onPress={() =>
            router.push(`/product/${product.id}/add-photos?existingCount=${product.photos.length}`)
          }
          disabled={product.photos.length >= 10}
          className="flex-1 items-center justify-center gap-1.5 bg-ink-50 py-3 rounded-xl"
        >
          <Camera size={20} color={primaryColor} />
          <Text className="text-ink-700 text-xs font-semibold">Add Photo</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => router.push(`/product/${product.id}/add-color`)}
          className="flex-1 items-center justify-center gap-1.5 bg-ink-50 py-3 rounded-xl"
        >
          <Palette size={20} color={primaryColor} />
          <Text className="text-ink-700 text-xs font-semibold">Add Color</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={handleProductVideoPress}
          disabled={generateVideoPending || videoGenerating}
          className="flex-1 items-center justify-center gap-1.5 bg-ink-50 py-3 rounded-xl relative"
        >
          {generateVideoPending || videoGenerating ? (
            <ActivityIndicator size="small" color={primaryColor} />
          ) : (
            <Video size={20} color={primaryColor} />
          )}
          <Text className="text-ink-700 text-xs font-semibold">
            {videoGenerating ? 'Building...' : 'Product Video'}
          </Text>
          {productVideosCount > 0 && !videoGenerating && (
            <View
              className="absolute -top-1.5 -right-1 px-1.5 py-0.5 rounded-full shadow-xs"
              style={{ backgroundColor: primaryColor }}
            >
              <Text className="text-[9px] font-bold text-white">{productVideosCount}</Text>
            </View>
          )}
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => setStudioModalOpen(true)}
          disabled={!originalPhoto || studioStarting || studioStatus === 'processing'}
          className="flex-1 items-center justify-center gap-1.5 bg-ink-50 py-3 rounded-xl relative"
        >
          {studioStarting || studioStatus === 'processing' ? (
            <ActivityIndicator size="small" color={primaryColor} />
          ) : (
            <Sparkles size={20} color={primaryColor} />
          )}
          <Text className="text-ink-700 text-xs font-semibold">AI Studio</Text>
          {studioQuota && !studioQuota.unlimited && (
            <View className="absolute -top-1.5 -right-1 bg-amber-500 px-1.5 py-0.5 rounded-full shadow-xs">
              <Text className="text-[9px] font-bold text-white">{studioQuota.remaining}</Text>
            </View>
          )}
        </AnimatedPressable>
      </View>
    </View>
  )
}
