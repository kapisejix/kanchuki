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
    <View className="bg-white rounded-3xl mx-4 my-2 border border-lavender-200 shadow-sm overflow-hidden" style={{ elevation: 3 }}>
      {/* Swipeable photo carousel */}
      <View
        className="relative overflow-hidden bg-lavender-100"
        style={{ height: 380, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}
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
                  contentFit="cover"
                  onError={() => setImageErrors((prev) => new Set(prev).add(photo.url))}
                />
              ) : (
                <View className="w-full h-full bg-lavender-100 items-center justify-center">
                  <Text className="text-heliotrope-400 text-5xl mb-2">👗</Text>
                  <Text className="text-heliotrope-500 text-xs">Image unavailable</Text>
                </View>
              )
            }
          />
        ) : (
          <View className="w-full h-full bg-lavender-100 items-center justify-center">
            <Text className="text-heliotrope-400 text-5xl mb-2">👗</Text>
            <Text className="text-heliotrope-500 text-xs">No photos</Text>
          </View>
        )}

        {/* Left arrow */}
        {displayPhotos.length > 1 && selectedPhotoIndex > 0 && (
          <AnimatedPressable
            onPress={() => goToPhoto(selectedPhotoIndex - 1)}
            accessibilityLabel="Previous photo"
            accessibilityRole="button"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 items-center justify-center shadow-md border border-lavender-200"
            style={{ elevation: 3, zIndex: 10 }}
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
        )}

        {/* Right-side floating thumbnail strip (Point 10 PDP spec) */}
        {displayPhotos.length > 1 && (
          <View
            style={{
              position: 'absolute',
              top: '50%',
              right: 10,
              transform: [{ translateY: -((Math.min(displayPhotos.length, 4) * 44 + (Math.min(displayPhotos.length, 4) - 1) * 6) / 2) }],
              backgroundColor: 'rgba(255, 255, 255, 0.88)',
              borderRadius: 20,
              padding: 5,
              gap: 6,
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.8)',
              shadowColor: '#231F48',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 10,
              elevation: 4,
              zIndex: 20,
            }}
          >
            {displayPhotos.slice(0, 4).map((photo, idx) => {
              const isSelected = idx === selectedPhotoIndex
              return (
                <AnimatedPressable
                  key={photo.id}
                  onPress={() => goToPhoto(idx)}
                  style={{
                    width: 36,
                    height: 42,
                    borderRadius: 12,
                    overflow: 'hidden',
                    borderWidth: 2,
                    borderColor: isSelected ? '#BB3F95' : 'transparent',
                  }}
                >
                  <Image
                    source={{ uri: displayUrl(photo) }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                </AnimatedPressable>
              )
            })}
          </View>
        )}

        {/* AI Try-On badge (top-left) */}
        <AnimatedPressable
          onPress={() => setStudioModalOpen(true)}
          className="absolute top-3 left-3 px-3 py-1 rounded-full bg-[#231F48]/85 border border-white/20 flex-row items-center gap-1.5 shadow-lg"
          style={{ zIndex: 10 }}
        >
          <Sparkles size={13} color="#BB3F95" />
          <Text className="text-white text-[10px] font-extrabold tracking-wider">AI Try-On</Text>
        </AnimatedPressable>

        {/* Video duration badge */}
        {currentPhoto?.is_video && (
          <View className="absolute top-10 left-3 bg-spaceCadet-900/90 px-3 py-1 rounded-full flex-row items-center gap-1.5 shadow-sm border border-white/20">
            <Clapperboard size={12} color="#BB3F95" />
            <Text className="text-white text-xs font-bold">
              Product Video ({currentPhoto.video_duration ?? 6}s)
            </Text>
          </View>
        )}

        {/* Variant badge */}
        {!currentPhoto?.is_video && currentPhotoIsVariant && currentPhoto?.variant_color && (
          <View className="absolute top-10 left-3 bg-spaceCadet-900/90 px-3 py-1 rounded-full flex-row items-center gap-1 border border-white/20">
            <Palette size={12} color="#BB3F95" />
            <Text className="text-white text-xs font-bold">{currentPhoto.variant_color}</Text>
          </View>
        )}

        {/* Download current media */}
        {displayPhotos.length > 0 && currentPhoto && (
          <AnimatedPressable
            onPress={handleDownloadCurrentMedia}
            disabled={downloadingMedia}
            accessibilityLabel="Download current image or video"
            accessibilityRole="button"
            className={`absolute top-3 w-9 h-9 rounded-full bg-white/90 items-center justify-center shadow-md border border-lavender-200 ${
              currentPhoto?.is_video ? 'right-14' : 'right-24'
            }`}
            style={{ elevation: 3, zIndex: 10 }}
          >
            {downloadingMedia ? (
              <ActivityIndicator size="small" color="#BB3F95" />
            ) : (
              <Download size={16} color="#231F48" />
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
            className={`absolute top-3 w-9 h-9 rounded-full bg-white/90 items-center justify-center shadow-md border border-lavender-200 ${
              currentPhoto?.is_video ? 'right-3' : 'right-14'
            }`}
            style={{ elevation: 3, zIndex: 10 }}
          >
            {deletingMedia ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <Trash2 size={16} color="#dc2626" />
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
            className="absolute right-3 top-3 w-9 h-9 rounded-full bg-white/90 items-center justify-center shadow-md border border-lavender-200"
            style={{ elevation: 3, zIndex: 10 }}
          >
            {detectingColor ? (
              <ActivityIndicator size="small" color="#BB3F95" />
            ) : (
              <Palette size={16} color="#231F48" />
            )}
          </AnimatedPressable>
        )}

        {/* Detected-color confirm chip */}
        {detectedColor && (
          <View
            className="absolute right-3 bottom-12 bg-white/95 rounded-2xl px-3 py-2 flex-row items-center gap-2 shadow-md border border-lavender-200"
            style={{ elevation: 4, zIndex: 10 }}
          >
            <View
              className="w-6 h-6 rounded-full border-2 border-white"
              style={{ backgroundColor: resolveFashionColor(detectedColor) }}
            />
            <Text className="text-xs font-bold text-spaceCadet-900 max-w-[120px]" numberOfLines={1}>
              {detectedColor}
            </Text>
            <AnimatedPressable
              onPress={() => {
                dirtyColorSetter(detectedColor)
                setDetectedColor(null)
              }}
              className="bg-spaceCadet-900 px-2.5 py-1 rounded-full"
            >
              <Text className="text-white text-[10px] font-bold">Use</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => setDetectedColor(null)}
              accessibilityLabel="Dismiss detected color"
              accessibilityRole="button"
              hitSlop={6}
            >
              <X size={14} color="#6B4773" />
            </AnimatedPressable>
          </View>
        )}

        {/* Color detection error hint */}
        {colorDetectError && (
          <View
            className="absolute left-3 right-3 bottom-12 bg-red-50/95 rounded-xl px-3 py-1.5 border border-red-200"
            style={{ zIndex: 10 }}
          >
            <Text className="text-red-600 text-[10px] text-center font-medium">{colorDetectError}</Text>
          </View>
        )}

        {/* Dot indicators */}
        {displayPhotos.length > 1 && (
          <View className="absolute bottom-3 left-0 right-0 flex-row justify-center gap-1.5">
            {displayPhotos.map((p, idx) => (
              <AnimatedPressable
                key={idx}
                onPress={() => goToPhoto(idx)}
                className={`h-2 rounded-full ${
                  idx === selectedPhotoIndex
                    ? 'bg-fuchsia-500 w-4'
                    : p.is_video
                      ? 'bg-spaceCadet-900 w-2'
                      : 'bg-white/70 w-2'
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
          className="px-4 py-3 bg-white border-b border-lavender-200"
        >
          <View className="flex-row gap-2.5">
            {displayPhotos.map((photo, idx) => {
              const isSelected = idx === selectedPhotoIndex
              const isVariant = photo.is_variant_preview
              const isOriginal = photo.is_original_preview
              const isVideo = photo.is_video
              return (
                <AnimatedPressable
                  key={photo.id}
                  onPress={() => goToPhoto(idx)}
                  className={`w-16 h-16 rounded-2xl overflow-hidden border-2 ${
                    isSelected ? 'border-fuchsia-500' : 'border-lavender-200'
                  }`}
                >
                  {isVideo ? (
                    <View className="w-full h-full bg-spaceCadet-900 items-center justify-center">
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
                    <View className="absolute bottom-0 left-0 right-0 bg-spaceCadet-900/80 py-0.5">
                      <Text className="text-white text-[8px] text-center font-medium">
                        {photo.variant_color ?? ''}
                      </Text>
                    </View>
                  )}
                  {isOriginal && (
                    <View className="absolute bottom-0 left-0 right-0 bg-spaceCadet-900/80 py-0.5">
                      <Text className="text-white text-[8px] text-center font-medium">
                        Original
                      </Text>
                    </View>
                  )}
                  {photo.is_primary && !isVariant && !isOriginal && !isVideo && (
                    <View className="absolute bottom-0 left-0 right-0 bg-fuchsia-600/90 py-0.5">
                      <Text className="text-white text-[8px] text-center font-bold">Main</Text>
                    </View>
                  )}
                </AnimatedPressable>
              )
            })}
          </View>
        </ScrollView>
      )}

      {/* Action buttons row */}
      <View className="flex-row gap-2 p-3 bg-white">
        <AnimatedPressable
          onPress={() =>
            router.push(`/product/${product.id}/add-photos?existingCount=${product.photos.length}`)
          }
          disabled={product.photos.length >= 10}
          className="flex-1 items-center justify-center gap-1 bg-lavender-50 border border-lavender-200 py-2.5 rounded-2xl"
        >
          <Camera size={18} color="#BB3F95" />
          <Text className="text-spaceCadet-900 text-[11px] font-bold">Add Photo</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => router.push(`/product/${product.id}/add-color`)}
          className="flex-1 items-center justify-center gap-1 bg-lavender-50 border border-lavender-200 py-2.5 rounded-2xl"
        >
          <Palette size={18} color="#BB3F95" />
          <Text className="text-spaceCadet-900 text-[11px] font-bold">Add Color</Text>
        </AnimatedPressable>
        <AnimatedPressable
          onPress={handleProductVideoPress}
          disabled={generateVideoPending || videoGenerating}
          className="flex-1 items-center justify-center gap-1 bg-lavender-50 border border-lavender-200 py-2.5 rounded-2xl relative"
        >
          {generateVideoPending || videoGenerating ? (
            <ActivityIndicator size="small" color="#BB3F95" />
          ) : (
            <Video size={18} color="#BB3F95" />
          )}
          <Text className="text-spaceCadet-900 text-[11px] font-bold">
            {videoGenerating ? 'Building...' : 'Video'}
          </Text>
          {productVideosCount > 0 && !videoGenerating && (
            <View
              className="absolute -top-1.5 -right-1 px-1.5 py-0.5 rounded-full bg-fuchsia-600 shadow-xs"
            >
              <Text className="text-[9px] font-bold text-white">{productVideosCount}</Text>
            </View>
          )}
        </AnimatedPressable>
        <AnimatedPressable
          onPress={() => setStudioModalOpen(true)}
          disabled={!originalPhoto || studioStarting || studioStatus === 'processing'}
          className="flex-1 items-center justify-center gap-1 bg-lavender-50 border border-lavender-200 py-2.5 rounded-2xl relative"
        >
          {studioStarting || studioStatus === 'processing' ? (
            <ActivityIndicator size="small" color="#BB3F95" />
          ) : (
            <Sparkles size={18} color="#BB3F95" />
          )}
          <Text className="text-spaceCadet-900 text-[11px] font-bold">AI Studio</Text>
          {studioQuota && !studioQuota.unlimited && (
            <View className="absolute -top-1.5 -right-1 bg-fuchsia-600 px-1.5 py-0.5 rounded-full shadow-xs">
              <Text className="text-[9px] font-bold text-white">{studioQuota.remaining}</Text>
            </View>
          )}
        </AnimatedPressable>
      </View>
    </View>
  )
}
