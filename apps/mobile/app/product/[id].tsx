import React, { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  Dimensions,
  Modal,
  ActivityIndicator,
} from 'react-native'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { VideoView } from 'expo-video'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Clapperboard, Heart } from 'lucide-react-native'
import Gallery, { type GalleryRef } from 'react-native-awesome-gallery'
import type { ProductDetail } from '@kanchuki/shared'

import { productApi, categoryApi, productAttributeApi } from '../../src/lib/api'
import { DetailScreenSkeleton } from '../../src/components/Skeleton'
import { useTheme } from '../../src/lib/theme'
import { useSafeVideoPlayer } from '../../src/lib/safe-video-player'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { RelatedProductsSection } from '../../src/components/product-detail/RelatedProducts'
import { SkuTagModal } from '../../src/components/product-detail/SkuTagModal'
import { ProductMediaCarousel } from '../../src/components/product-detail/ProductMediaCarousel'
import { ProductAttributesForm } from '../../src/components/product-detail/ProductAttributesForm'
import { ProductAiReviewSection } from '../../src/components/product-detail/ProductAiReviewSection'
import { ProductActionsBar } from '../../src/components/product-detail/ProductActionsBar'
import { ProductStudioModal } from '../../src/components/product-detail/ProductStudioModal'
import { useProductDetailForm } from '../../src/hooks/useProductDetailForm'
import { useProductAiStudio } from '../../src/hooks/useProductAiStudio'

const SCREEN_WIDTH = Dimensions.get('window').width

function ProductVideoSlide({ url, width, height }: { url: string; width: number; height: number }) {
  const player = useSafeVideoPlayer(url, (p) => {
    p.loop = true
    p.muted = false
    p.play()
  })

  if (!player) {
    return (
      <View
        style={{ width, height }}
        className="w-full h-full bg-sand-950 items-center justify-center relative"
      >
        <Clapperboard size={40} color="white" />
        <Text className="text-white text-xs mt-2 font-medium">Product Video (6s)</Text>
      </View>
    )
  }

  return (
    <View
      style={{ width, height }}
      className="w-full h-full bg-sand-950 items-center justify-center relative"
    >
      <VideoView
        style={{ width: '100%', height: '100%' }}
        player={player}
        nativeControls
        contentFit="contain"
      />
    </View>
  )
}

export default function ProductDetailScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()

  // Invalidate cache on focus
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['products', id] })
    }, [id, queryClient]),
  )

  const { data, isLoading } = useQuery({
    queryKey: ['products', id],
    queryFn: () => productApi.get(id),
    refetchInterval: (query) => {
      const p = (query.state.data as { data: ProductDetail } | undefined)?.data
      if (!p) return 3_000
      if (!p.ai_tagged && !p.ai_tag_error) return 3_000
      if (p.spin_status === 'processing') return 3_000
      return false
    },
  })
  const product = data?.data

  // Fetch categories and taxonomy attributes
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryApi.list(),
  })
  const categories = categoriesData?.data ?? []

  const { data: stylesData } = useQuery({
    queryKey: ['product-attributes', 'STYLE'],
    queryFn: () => productAttributeApi.list('STYLE'),
  })
  const availableStyles = stylesData?.data ?? []

  const { data: fabricsData } = useQuery({
    queryKey: ['product-attributes', 'FABRIC'],
    queryFn: () => productAttributeApi.list('FABRIC'),
  })
  const availableFabrics = fabricsData?.data ?? []

  // Gallery & Carousel layout state
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const [carouselWidth, setCarouselWidth] = useState(SCREEN_WIDTH)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [spinViewerOpen, setSpinViewerOpen] = useState(false)
  const [spinFrameIndex, setSpinFrameIndex] = useState(0)
  const [skuTagOpen, setSkuTagOpen] = useState(false)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const [photoCacheBust, setPhotoCacheBust] = useState<Record<string, number>>({})
  const [isFavorite, setIsFavorite] = useState(false)

  const galleryRef = useRef<GalleryRef>(null)
  const spinTouchStartX = useRef<number | null>(null)
  const spinStartFrameRef = useRef<number>(0)

  // Build display photos array (photos + variants + original + video)
  const displayPhotos = React.useMemo(() => {
    if (!product) return []
    const items: Array<{
      id: string
      url: string
      is_primary: boolean
      is_variant_preview?: boolean
      is_original_preview?: boolean
      variant_color?: string
      is_video?: boolean
      video_duration?: number | null
    }> = []

    for (const photo of product.photos) {
      items.push({
        id: photo.id,
        url: photo.url,
        is_primary: photo.is_primary,
      })
    }

    for (const v of product.variants) {
      if (v.photo_url && !items.some((item) => item.url === v.photo_url)) {
        items.push({
          id: `variant_${v.id}`,
          url: v.photo_url,
          is_primary: false,
          is_variant_preview: true,
          variant_color: v.color,
        })
      }
    }

    if (product.videos && product.videos.length > 0) {
      for (const video of product.videos) {
        items.push({
          id: `video_${video.id}`,
          url: video.public_url,
          is_primary: false,
          is_video: true,
          video_duration: video.duration_sec,
        })
      }
    }

    return items
  }, [product])

  const currentPhoto = displayPhotos[selectedPhotoIndex]
  const currentPhotoIsVariant = currentPhoto?.is_variant_preview ?? false
  const currentPhotoIsOriginal = currentPhoto?.is_original_preview ?? false

  const displayUrl = useCallback(
    (photo: { id: string; url: string }) => {
      const bust = photoCacheBust[photo.id]
      return bust ? `${photo.url}?t=${bust}` : photo.url
    },
    [photoCacheBust],
  )

  const goToPhoto = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, displayPhotos.length - 1))
      setSelectedPhotoIndex(clamped)
      galleryRef.current?.setIndex(clamped, true)
    },
    [displayPhotos.length],
  )

  // Form hook
  const form = useProductDetailForm({
    product,
    selectedPhotoIndex,
    displayPhotos,
  })

  // AI Studio hook
  const studio = useProductAiStudio({
    product,
    currentPhoto,
    currentPhotoIsOriginal,
    displayPhotos,
    selectedPhotoIndex,
    setSelectedPhotoIndex,
    setPhotoCacheBust,
  })

  // Spin touch handlers
  const handleSpinTouchStart = (e: any) => {
    spinTouchStartX.current = e.nativeEvent.pageX
    spinStartFrameRef.current = spinFrameIndex
  }

  const handleSpinTouchMove = (e: any) => {
    if (spinTouchStartX.current === null || !product?.spin_frames?.length) return
    const dx = e.nativeEvent.pageX - spinTouchStartX.current
    const frameCount = product.spin_frames.length
    const frameDelta = Math.floor(dx / 12)
    const newIndex = (((spinStartFrameRef.current - frameDelta) % frameCount) + frameCount) % frameCount
    setSpinFrameIndex(newIndex)
  }

  const handleSpinTouchEnd = () => {
    spinTouchStartX.current = null
  }

  if (isLoading || !product) {
    return <DetailScreenSkeleton />
  }

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Top App Header (Point 10 PDP Spec) */}
      <View
        className="flex-row items-center justify-between px-5 pb-3 bg-white border-b border-lavender-200"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <AnimatedPressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={20} color="#231F48" />
        </AnimatedPressable>
        <Text
          style={{ fontFamily: 'Marcellus_400Regular' }}
          className="text-base font-bold text-spaceCadet-900"
        >
          Product Details
        </Text>
        <View className="flex-row items-center gap-2">
          {form.isDirty ? (
            <AnimatedPressable
              onPress={() => void form.handleSave()}
              disabled={form.saving}
              className="bg-spaceCadet-900 px-4 py-2 rounded-2xl"
            >
              {form.saving ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-bold text-xs uppercase tracking-wider">Save</Text>
              )}
            </AnimatedPressable>
          ) : (
            <AnimatedPressable
              onPress={() => setIsFavorite((f) => !f)}
              className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
              hitSlop={8}
              accessibilityLabel="Favorite"
              accessibilityRole="button"
            >
              <Heart
                size={18}
                color={isFavorite ? "#BB3F95" : "#231F48"}
                fill={isFavorite ? "#BB3F95" : "transparent"}
              />
            </AnimatedPressable>
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 20 }}
      >
        {/* Photo Gallery Carousel */}
        <ProductMediaCarousel
          product={product}
          displayPhotos={displayPhotos}
          selectedPhotoIndex={selectedPhotoIndex}
          setSelectedPhotoIndex={setSelectedPhotoIndex}
          carouselWidth={carouselWidth}
          setCarouselWidth={setCarouselWidth}
          galleryRef={galleryRef}
          setFullscreenOpen={setFullscreenOpen}
          displayUrl={displayUrl}
          imageErrors={imageErrors}
          setImageErrors={setImageErrors}
          primaryColor={primaryColor}
          colors={colors}
          currentPhoto={currentPhoto}
          currentPhotoIsVariant={currentPhotoIsVariant}
          currentPhotoIsOriginal={currentPhotoIsOriginal}
          downloadingMedia={studio.downloadingMedia}
          handleDownloadCurrentMedia={studio.handleDownloadCurrentMedia}
          deletingMedia={studio.deletingMedia}
          handleDeleteCurrentMedia={studio.handleDeleteCurrentMedia}
          detectingColor={form.detectingColor}
          handleDetectColor={form.handleDetectColor}
          detectedColor={form.detectedColor}
          setDetectedColor={form.setDetectedColor}
          dirtyColorSetter={form.dirty(form.setEditedColor)}
          colorDetectError={form.colorDetectError}
          goToPhoto={goToPhoto}
          handleProductVideoPress={studio.handleProductVideoPress}
          videoGenerating={studio.videoGenerating}
          generateVideoPending={studio.generateVideo.isPending}
          productVideosCount={studio.productVideos.length}
          setStudioModalOpen={studio.setStudioModalOpen}
          studioStarting={studio.studioStarting}
          studioStatus={studio.studioStatus}
          originalPhoto={studio.originalPhoto}
          studioQuota={studio.studioQuota}
          ProductVideoSlide={ProductVideoSlide}
        />

        {/* AI Tag Review Status */}
        <ProductAiReviewSection
          product={product}
          retagging={form.retagging}
          handleRetag={form.handleRetag}
          primaryColor={primaryColor}
          colors={colors}
        />

        {/* Product Attributes Form */}
        <ProductAttributesForm
          product={product}
          price={form.price}
          setPrice={form.setPrice}
          location={form.location}
          setLocation={form.setLocation}
          notes={form.notes}
          setNotes={form.setNotes}
          selectedStyles={form.selectedStyles}
          setSelectedStyles={form.setSelectedStyles}
          selectedFabrics={form.selectedFabrics}
          setSelectedFabrics={form.setSelectedFabrics}
          selectedSizes={form.selectedSizes}
          setSelectedSizes={form.setSelectedSizes}
          editedCategory={form.editedCategory}
          setEditedCategory={form.setEditedCategory}
          editedColor={form.editedColor}
          setEditedColor={form.setEditedColor}
          editedPattern={form.editedPattern}
          setEditedPattern={form.setEditedPattern}
          editedCategoryId={form.editedCategoryId}
          setEditedCategoryId={form.setEditedCategoryId}
          editedName={form.editedName}
          setEditedName={form.setEditedName}
          editedSku={form.editedSku}
          setEditedSku={form.setEditedSku}
          editedDescription={form.editedDescription}
          setEditedDescription={form.setEditedDescription}
          editedSubtype={form.editedSubtype}
          setEditedSubtype={form.setEditedSubtype}
          dirty={form.dirty}
          primaryColor={primaryColor}
          colors={colors}
          categories={categories}
          availableStyles={availableStyles}
          availableFabrics={availableFabrics}
          displayPhotos={displayPhotos}
          selectedPhotoIndex={selectedPhotoIndex}
          goToPhoto={goToPhoto}
          onOpenSkuTagModal={() => setSkuTagOpen(true)}
        />

        {/* Related Products from same store */}
        <View className="px-4 pb-2">
          <RelatedProductsSection
            category={product.category ?? ''}
            excludeId={product.id}
            onSelect={(selectedId) => router.push(`/product/${selectedId}`)}
          />
        </View>

        {/* Availability & Delete Actions */}
        <ProductActionsBar
          product={product}
          statusUpdating={form.statusUpdating}
          handleStatusChange={form.handleStatusChange}
          deleting={form.deleting}
          handleDelete={form.handleDelete}
          primaryColor={primaryColor}
          colors={colors}
        />
      </ScrollView>

      {/* Fullscreen Photo Zoom Viewer */}
      <Modal
        visible={fullscreenOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <AnimatedPressable
            onPress={() => setFullscreenOpen(false)}
            accessibilityLabel="Close fullscreen viewer"
            accessibilityRole="button"
            hitSlop={8}
            style={{
              position: 'absolute',
              top: insets.top + 12,
              left: 16,
              zIndex: 20,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={26} color="white" />
          </AnimatedPressable>
          {fullscreenOpen && (
            <Gallery
              data={displayPhotos}
              keyExtractor={(photo) => photo.id}
              initialIndex={selectedPhotoIndex}
              onIndexChange={setSelectedPhotoIndex}
              onSwipeToClose={() => setFullscreenOpen(false)}
              renderItem={({ item: photo }) => (
                <Image
                  source={{ uri: displayUrl(photo) }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                />
              )}
            />
          )}
        </View>
      </Modal>

      {/* Fullscreen 360 Spin Modal */}
      <Modal
        visible={spinViewerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSpinViewerOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <AnimatedPressable
            onPress={() => setSpinViewerOpen(false)}
            accessibilityLabel="Close 360 spin viewer"
            accessibilityRole="button"
            hitSlop={8}
            style={{
              position: 'absolute',
              top: insets.top + 12,
              left: 16,
              zIndex: 20,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={26} color="white" />
          </AnimatedPressable>

          <View
            style={{ flex: 1 }}
            onTouchStart={handleSpinTouchStart}
            onTouchMove={handleSpinTouchMove}
            onTouchEnd={handleSpinTouchEnd}
          >
            {(product.spin_frames ?? []).map((frame, i) => (
              <Image
                key={frame.id}
                source={{ uri: frame.url }}
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  opacity: i === spinFrameIndex ? 1 : 0,
                }}
                contentFit="contain"
              />
            ))}
          </View>
        </View>
      </Modal>

      {/* Printable SKU Tag Modal */}
      <SkuTagModal
        open={skuTagOpen}
        onClose={() => setSkuTagOpen(false)}
        sku={product.sku ?? null}
        name={product.name ?? null}
      />

      {/* AI Studio Shoot Preset Modal */}
      <ProductStudioModal
        visible={studio.studioModalOpen}
        onClose={() => studio.setStudioModalOpen(false)}
        onStartShoot={studio.handleStartStudioShoot}
        starting={studio.studioStarting}
        quota={studio.studioQuota}
        primaryColor={primaryColor}
        colors={colors}
      />
    </View>
  )
}
