import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Animated,
} from 'react-native'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { X, Check, Plus, Trash2, MapPin, Sparkles, Scissors, Palette, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { productApi, uploadImageToR2, readLocalImage } from '../../src/lib/api'
import {
  OCCASION_TYPES,
  PRODUCT_CATEGORIES,
  FABRIC_TYPES,
  PATTERN_TYPES,
  PIECE_TAGGABLE_CATEGORIES,
  formatPriceRange,
} from '@kanchuki/shared'

type Photo = { id: string; url: string; is_primary: boolean; piece_type: 'upper' | 'lower' | null }
type Variant = { id: string; color: string; photo_url: string | null }
type Product = {
  id: string
  category: string | null
  product_type: string | null
  primary_color: string | null
  fabric_estimate: string | null
  pattern: string | null
  occasions: string[]
  price_min: number | null
  price_max: number | null
  status: 'AVAILABLE' | 'SOLD' | 'RESERVED' | 'NOT_SURE'
  location_notes: string | null
  notes: string | null
  ai_tagged: boolean
  ai_tag_error: string | null
  photos: Photo[]
  variants: Variant[]
  section: { name: string } | null
}

const SCREEN_WIDTH = Dimensions.get('window').width

const STATUS_OPTIONS: Array<{ value: Product['status']; label: string }> = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'NOT_SURE', label: 'Not Sure' },
]

export default function ProductDetailScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()

  // Refresh data when screen comes into focus (e.g. after adding a variant)
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['products', id] })
    }, [id, queryClient]),
  )

  const { data, isLoading } = useQuery({
    queryKey: ['products', id],
    queryFn: () => productApi.get(id),
    // Poll while AI tagging is still running so the spinner clears itself
    // instead of requiring the user to leave and re-enter the screen.
    refetchInterval: (query) => {
      const p = (query.state.data as { data: Product } | undefined)?.data
      if (!p || (!p.ai_tagged && !p.ai_tag_error)) return 3_000
      return false
    },
  })
  const product = (data as { data: Product } | undefined)?.data

  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)

  // Editable AI fields
  const [editedCategory, setEditedCategory] = useState<string | null>(null)
  const [editedColor, setEditedColor] = useState('')
  const [editedFabric, setEditedFabric] = useState<string | null>(null)
  const [editedPattern, setEditedPattern] = useState<string | null>(null)

  // Photo gallery state — tracks which photo is selected in the gallery
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  // When a color variant is tapped, show its photo URL if available
  const [variantPreviewUrl, setVariantPreviewUrl] = useState<string | null>(null)
  const [variantPreviewColor, setVariantPreviewColor] = useState<string | null>(null)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  const carouselRef = useRef<ScrollView>(null)
  const displayPhotosRef = useRef(0)

  // ── Pinch/zoom state ─────────────────────────────────────────────
  const [isZoomed, setIsZoomed] = useState(false)
  const [carouselScrollEnabled, setCarouselScrollEnabled] = useState(true)
  const scaleAnim = useRef(new Animated.Value(1)).current
  const panXAnim = useRef(new Animated.Value(0)).current
  const panYAnim = useRef(new Animated.Value(0)).current
  const lastPinchDistRef = useRef(0)
  const lastTapRef = useRef(0)
  const currentScaleRef = useRef(1)
  const isPinchingRef = useRef(false)
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })
  const panStartOffsetRef = useRef({ x: 0, y: 0 })

  // Get all displayable images (product photos + variant preview appended)
  const displayPhotos = (() => {
    const base = product?.photos ?? []
    if (variantPreviewUrl) {
      const alreadyInBase = base.some((p) => p.url === variantPreviewUrl)
      if (!alreadyInBase) {
        const result: Array<Photo & { is_variant_preview: boolean; variant_color: string | null }> = [
          ...base.map((p) => ({ ...p, is_variant_preview: false, variant_color: null })),
          {
            id: 'variant-preview',
            url: variantPreviewUrl,
            is_primary: false,
            piece_type: null,
            is_variant_preview: true,
            variant_color: variantPreviewColor,
          },
        ]
        displayPhotosRef.current = result.length
        return result
      }
    }
    const result = base.map((p) => ({ ...p, is_variant_preview: false, variant_color: null }))
    displayPhotosRef.current = result.length
    return result
  })()

  const currentPhotoUrl = displayPhotos[selectedPhotoIndex]?.url ?? null
  const currentPhotoIsVariant = (displayPhotos[selectedPhotoIndex] as { is_variant_preview?: boolean } | undefined)?.is_variant_preview ?? false

  const goToPhoto = useCallback((index: number) => {
    const count = displayPhotosRef.current
    const clamped = Math.max(0, Math.min(index, count - 1))
    carouselRef.current?.scrollTo({ x: clamped * SCREEN_WIDTH, animated: true })
    setSelectedPhotoIndex(clamped)
  }, [])

  // When a variant is selected, scroll the carousel to the variant photo
  // after the state update has rendered the new displayPhotos array.
  useEffect(() => {
    if (variantPreviewUrl && product) {
      const variantIdx = displayPhotos.length - 1
      if (variantIdx >= (product.photos.length ?? 0)) {
        carouselRef.current?.scrollTo({ x: variantIdx * SCREEN_WIDTH, animated: true })
        setSelectedPhotoIndex(variantIdx)
      }
    }
  }, [variantPreviewUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset zoom when carousel navigates to a different photo
  useEffect(() => {
    if (isZoomed) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 7 }),
        Animated.spring(panXAnim, { toValue: 0, useNativeDriver: true, friction: 7 }),
        Animated.spring(panYAnim, { toValue: 0, useNativeDriver: true, friction: 7 }),
      ]).start()
      setIsZoomed(false)
      setCarouselScrollEnabled(true)
      currentScaleRef.current = 1
    }
  }, [selectedPhotoIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep mutable refs in sync with Animated values for pan start offset
  const latestPanX = useRef(0)
  const latestPanY = useRef(0)
  useEffect(() => {
    const subX = panXAnim.addListener((v: { value: number }) => { latestPanX.current = v.value })
    const subY = panYAnim.addListener((v: { value: number }) => { latestPanY.current = v.value })
    return () => {
      panXAnim.removeListener(subX)
      panYAnim.removeListener(subY)
    }
  }, [panXAnim, panYAnim])

  // ── Touch handlers for pinch/zoom + double-tap ──────────────────
  const handlePhotoTouchStart = useCallback((e: { nativeEvent: { touches?: { pageX: number; pageY: number }[] } }) => {
    const touches = e.nativeEvent.touches
    if (touches && touches.length >= 2) {
      // Pinch start — store initial distance
      const dx = touches[0].pageX - touches[1].pageX
      const dy = touches[0].pageY - touches[1].pageY
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy)
      isPinchingRef.current = true
      setIsZoomed(true)
      setCarouselScrollEnabled(false)
      return
    }
    if (touches && touches.length === 1 && isZoomed && currentScaleRef.current > 1) {
      // Pan start when zoomed
      isPanningRef.current = true
      panStartRef.current = { x: touches[0].pageX, y: touches[0].pageY }
      panStartOffsetRef.current = { x: latestPanX.current, y: latestPanY.current }
      setCarouselScrollEnabled(false)
    }
  }, [isZoomed])

  const handlePhotoTouchMove = useCallback((e: { nativeEvent: { touches?: { pageX: number; pageY: number }[] } }) => {
    const touches = e.nativeEvent.touches
    if (isPinchingRef.current && touches && touches.length >= 2) {
      const dx = touches[0].pageX - touches[1].pageX
      const dy = touches[0].pageY - touches[1].pageY
      const dist = Math.sqrt(dx * dx + dy * dy)
      const ratio = dist / lastPinchDistRef.current
      const newScale = Math.max(1, Math.min(currentScaleRef.current * ratio, 6))
      currentScaleRef.current = newScale
      lastPinchDistRef.current = dist
      scaleAnim.setValue(newScale)
      return
    }
    if (isPanningRef.current && touches && touches.length === 1) {
      const dx = touches[0].pageX - panStartRef.current.x
      const dy = touches[0].pageY - panStartRef.current.y
      panXAnim.setValue(panStartOffsetRef.current.x + dx)
      panYAnim.setValue(panStartOffsetRef.current.y + dy)
    }
  }, [scaleAnim, panXAnim, panYAnim])

  const handlePhotoTouchEnd = useCallback((e: { nativeEvent: { changedTouches?: { pageX: number; pageY: number }[] } }) => {
    // End pinch
    if (isPinchingRef.current) {
      isPinchingRef.current = false
      if (currentScaleRef.current < 1.15) {
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          friction: 7,
        }).start()
        setIsZoomed(false)
        setCarouselScrollEnabled(true)
        currentScaleRef.current = 1
      }
      return
    }
    // End pan
    if (isPanningRef.current) {
      isPanningRef.current = false
      return
    }
    // Quick tap — detect double-tap
    const changed = e.nativeEvent.changedTouches
    if (changed && changed.length === 1) {
      const now = Date.now()
      if (now - lastTapRef.current < 300) {
        // Double-tap detected
        lastTapRef.current = 0
        if (currentScaleRef.current > 1) {
          // Zoom out
          Animated.parallel([
            Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, friction: 7 }),
            Animated.spring(panXAnim, { toValue: 0, useNativeDriver: true, friction: 7 }),
            Animated.spring(panYAnim, { toValue: 0, useNativeDriver: true, friction: 7 }),
          ]).start()
          setIsZoomed(false)
          setCarouselScrollEnabled(true)
          currentScaleRef.current = 1
        } else {
          // Zoom in to 2.5x
          Animated.spring(scaleAnim, {
            toValue: 2.5,
            useNativeDriver: true,
            friction: 7,
          }).start()
          setIsZoomed(true)
          setCarouselScrollEnabled(false)
          currentScaleRef.current = 2.5
        }
        return
      }
      lastTapRef.current = now
    }
  }, [scaleAnim, panXAnim, panYAnim])

  useEffect(() => {
    if (!product) return
    setPrice(product.price_min ? String(product.price_min / 100) : '')
    setLocation(product.location_notes ?? '')
    setNotes(product.notes ?? '')
    setSelectedOccasions(product.occasions ?? [])
    setEditedCategory(product.category)
    setEditedColor(product.primary_color ?? '')
    setEditedFabric(product.fabric_estimate)
    setEditedPattern(product.pattern)
    setSelectedPhotoIndex(0)
    setVariantPreviewUrl(null)
    setVariantPreviewColor(null)
    setImageErrors(new Set())
  }, [product])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const handleSave = async () => {
    if (!product) return
    setSaving(true)
    try {
      const priceInPaise = price ? Math.round(parseFloat(price) * 100) : undefined
      await productApi.update(product.id, {
        price_min: priceInPaise,
        price_max: priceInPaise,
        category: editedCategory ?? undefined,
        primary_color: editedColor || undefined,
        fabric_estimate: editedFabric ?? undefined,
        pattern: editedPattern ?? undefined,
        location_notes: location || undefined,
        notes: notes || undefined,
        occasions: selectedOccasions,
      })
      invalidate()
      Alert.alert('Saved', 'Product updated.')
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (status: Product['status']) => {
    if (!product) return
    setStatusUpdating(true)
    try {
      await productApi.updateStatus(product.id, status)
      invalidate()
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setStatusUpdating(false)
    }
  }

  const isPieceTaggable = (category: string | null): boolean =>
    !!category && (PIECE_TAGGABLE_CATEGORIES as readonly string[]).includes(category)

  const handleSetPieceType = async (photoId: string, pieceType: 'upper' | 'lower') => {
    if (!product) return
    // Tapping the already-active piece clears it; only one photo per piece per product.
    const current = product.photos.find((p) => p.id === photoId)?.piece_type
    const next = current === pieceType ? null : pieceType
    try {
      await productApi.setPhotoPieceType(product.id, photoId, next)
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to tag photo')
    }
  }

  // Many vendor "set" shots (kameez+dupatta draped on a mannequin, with the
  // folded bottom piece sitting on a stand in the same frame — see
  // docs/PRO-REQUIREMENTS.md F-102) can't be piece-tagged as-is: tagging is
  // per-whole-photo, and one photo can't be both pieces. This re-picks the
  // same image from the gallery with the OS's native crop tool, uploads the
  // cropped result as a new ProductPhoto, and tags it directly — no new
  // dependency, expo-image-picker's built-in allowsEditing crop screen
  // already covers this.
  const [cropping, setCropping] = useState<'upper' | 'lower' | null>(null)

  const handleCropPiece = async (piece: 'upper' | 'lower') => {
    if (!product) return
    setCropping(piece)
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Gallery access is needed to crop a photo.')
        return
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
      })
      if (picked.canceled || !picked.assets[0]?.uri) return

      const manipulated = await ImageManipulator.manipulateAsync(
        picked.assets[0].uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      )

      const blob = await readLocalImage(manipulated.uri)
      const filename = `${piece}-piece-${Date.now()}.jpg`
      const uploadResult = await productApi.getUploadUrl(filename, 'image/jpeg', blob.size)
      const { upload_url, r2_key, public_url } = uploadResult.data
      await uploadImageToR2(manipulated.uri, upload_url, 'image/jpeg')
      await productApi.addPhoto(product.id, {
        r2_key,
        url: public_url,
        content_type: 'image/jpeg',
        piece_type: piece,
      })
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to crop photo')
    } finally {
      setCropping(null)
    }
  }

  const handleDelete = () => {
    if (!product) return
    Alert.alert('Delete Product', 'This removes it from your catalog. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await productApi.delete(product.id)
            invalidate()
            router.back()
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete product')
          }
        },
      },
    ])
  }

  if (isLoading || !product) {
    return (
      <View className="flex-1 bg-cyan-50 items-center justify-center">
        <ActivityIndicator color="#0891B2" />
      </View>
    )
  }

  return (
    <ScrollView className="flex-1 bg-cyan-50">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-gray-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <X size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">Product Details</Text>
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saving}
          className="bg-cyan-600 px-4 py-2 rounded-xl"
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-semibold text-sm">Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Photo Gallery — swipeable carousel */}
      <View className="bg-white">
        {/* Swipeable photo carousel */}
        <View className="relative" style={{ height: 380 }}>
          {displayPhotos.length > 0 ? (
            <ScrollView
              ref={carouselRef}
              horizontal
              pagingEnabled
              nestedScrollEnabled
              scrollEnabled={carouselScrollEnabled}
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              scrollEventThrottle={16}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
                setSelectedPhotoIndex(index)
              }}
              style={{ flex: 1 }}
            >
              {displayPhotos.map((photo) => (
                <Animated.View
                  key={photo.id}
                  style={{
                    width: SCREEN_WIDTH,
                    height: 380,
                    transform: [
                      { scale: scaleAnim },
                      { translateX: panXAnim },
                      { translateY: panYAnim },
                    ],
                  }}
                  onTouchStart={handlePhotoTouchStart}
                  onTouchMove={handlePhotoTouchMove}
                  onTouchEnd={handlePhotoTouchEnd}
                >
                  {!imageErrors.has(photo.url) ? (
                    <Image
                      source={{ uri: photo.url }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                      onError={() => setImageErrors((prev) => new Set(prev).add(photo.url))}
                    />
                  ) : (
                    <View className="w-full h-full bg-gray-100 items-center justify-center">
                      <Text className="text-gray-300 text-5xl mb-2">👗</Text>
                      <Text className="text-gray-400 text-xs">Image unavailable</Text>
                    </View>
                  )}
                </Animated.View>
              ))}
            </ScrollView>
          ) : (
            <View className="w-full h-full bg-gray-100 items-center justify-center">
              <Text className="text-gray-300 text-5xl mb-2">👗</Text>
              <Text className="text-gray-400 text-xs">No photos</Text>
            </View>
          )}

          {/* Left arrow — hidden when zoomed */}
          {!isZoomed && displayPhotos.length > 1 && selectedPhotoIndex > 0 && (
            <TouchableOpacity
              onPress={() => goToPhoto(selectedPhotoIndex - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 items-center justify-center shadow-sm"
              style={{ elevation: 3, zIndex: 10 }}
            >
              <ChevronLeft size={20} color="#374151" />
            </TouchableOpacity>
          )}

          {/* Right arrow — hidden when zoomed */}
          {!isZoomed && displayPhotos.length > 1 && selectedPhotoIndex < displayPhotos.length - 1 && (
            <TouchableOpacity
              onPress={() => goToPhoto(selectedPhotoIndex + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 items-center justify-center shadow-sm"
              style={{ elevation: 3, zIndex: 10 }}
            >
              <ChevronRight size={20} color="#374151" />
            </TouchableOpacity>
          )}

          {/* Variant badge */}
          {currentPhotoIsVariant && variantPreviewColor && (
            <View className="absolute top-3 left-3 bg-cyan-600/90 px-3 py-1 rounded-full flex-row items-center gap-1">
              <Palette size={12} color="white" />
              <Text className="text-white text-xs font-semibold">{variantPreviewColor}</Text>
            </View>
          )}

          {/* Dot indicators */}
          {displayPhotos.length > 1 && (
            <View className="absolute bottom-3 left-0 right-0 flex-row justify-center gap-1.5">
              {displayPhotos.map((_, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => goToPhoto(idx)}
                  className={`w-2 h-2 rounded-full ${
                    idx === selectedPhotoIndex ? 'bg-white w-3' : 'bg-white/50'
                  }`}
                />
              ))}
            </View>
          )}
        </View>

        {/* Thumbnail strip — synced with carousel */}
        {displayPhotos.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-3 pb-2 pt-2 bg-white">
            <View className="flex-row gap-2">
              {displayPhotos.map((photo, idx) => {
                const isSelected = idx === selectedPhotoIndex
                const isVariant = 'is_variant_preview' in photo && photo.is_variant_preview
                return (
                  <TouchableOpacity
                    key={photo.id}
                    onPress={() => {
                      goToPhoto(idx)
                      // If clicking a non-variant thumbnail, clear variant preview
                      if (!isVariant) {
                        setVariantPreviewUrl(null)
                        setVariantPreviewColor(null)
                      }
                    }}
                    className={`w-16 h-16 rounded-lg overflow-hidden border-2 ${
                      isSelected ? 'border-cyan-600' : 'border-gray-200'
                    }`}
                  >
                    <Image
                      source={{ uri: photo.url }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                    {isVariant && (
                      <View className="absolute bottom-0 left-0 right-0 bg-cyan-600/80 py-0.5">
                        <Text className="text-white text-[8px] text-center font-medium">
                          {variantPreviewColor ?? ''}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          </ScrollView>
        )}

        {/* Piece tagging for each photo */}
              {displayPhotos.map((photo, displayIdx) => {
          if (selectedPhotoIndex !== displayIdx) return null
          if (photo.id === 'variant-preview' || !isPieceTaggable(product.category)) return null
          return (
            <View key={`piece-tag-${photo.id}`} className="px-3 py-2 bg-white flex-row gap-2">
              {(['upper', 'lower'] as const).map((piece) => {
                const selected = photo.piece_type === piece
                return (
                  <TouchableOpacity
                    key={piece}
                    onPress={() => void handleSetPieceType(photo.id, piece)}
                    className={`px-3 py-1 rounded-full border flex-row items-center gap-1 ${
                      selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                    }`}
                  >
                    {selected && <Check size={12} color="white" />}
                    <Text className={`text-xs font-medium capitalize ${selected ? 'text-white' : 'text-gray-600'}`}>
                      {piece} piece
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )
        })}
      </View>
      {isPieceTaggable(product.category) && (
        <View className="mx-4 mt-3 bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2">
          <Text className="text-cyan-700 text-xs">
            Tag one photo "Upper piece" and one "Lower piece" for a better try-on match on this 2-piece outfit.
          </Text>
        </View>
      )}

      {/* Crop-tagging: for the common case where both pieces are shot in ONE
          photo (e.g. draped kameez+dupatta with the folded bottom piece on a
          stand, same frame) — crop the missing piece out of an existing
          gallery photo instead of needing a fresh, separate photoshoot. */}
      {isPieceTaggable(product.category) && (
        <View className="mx-4 mt-2 flex-row gap-2">
          {(['upper', 'lower'] as const)
            .filter((piece) => !product.photos.some((p) => p.piece_type === piece))
            .map((piece) => (
              <TouchableOpacity
                key={piece}
                onPress={() => void handleCropPiece(piece)}
                disabled={cropping !== null}
                className="flex-1 flex-row items-center justify-center gap-1.5 border border-dashed border-cyan-300 rounded-xl py-2"
              >
                {cropping === piece ? (
                  <ActivityIndicator size="small" color="#0891B2" />
                ) : (
                  <Scissors size={14} color="#0891B2" />
                )}
                <Text className="text-cyan-700 text-xs font-medium capitalize">
                  Crop {piece} piece from a photo
                </Text>
              </TouchableOpacity>
            ))}
        </View>
      )}

      {!product.ai_tagged && !product.ai_tag_error && (
        <View className="mx-4 mt-3 bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2 flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#0891B2" />
          <Text className="text-cyan-700 text-xs">AI tagging in progress...</Text>
        </View>
      )}
      {product.ai_tag_error && (
        <View className="mx-4 mt-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          <Text className="text-amber-700 text-xs font-semibold">AI tagging failed</Text>
          <Text className="text-amber-600 text-[10px] mt-1 leading-relaxed" numberOfLines={3}>
            {product.ai_tag_error}
          </Text>
          <Text className="text-amber-500 text-[10px] mt-1">
            You can edit the fields below manually. Tap Save when done.
          </Text>
        </View>
      )}

      <View className="px-4 py-4 gap-4">
        {/* Try-On */}
        <TouchableOpacity
          onPress={() =>
            router.push({ pathname: '/tryon/in-store', params: { productId: product.id } })
          }
          className="flex-row items-center justify-center gap-2 bg-cyan-600 py-3.5 rounded-2xl"
          activeOpacity={0.8}
        >
          <Sparkles size={18} color="white" />
          <Text className="text-white font-bold">Try-On with Customer Photo</Text>
        </TouchableOpacity>

        {/* AI-read attributes (read-only summary) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <View className="flex-row items-center gap-2 mb-2">
            <Sparkles size={14} color="#0891B2" />
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              AI Summary
            </Text>
          </View>
          <Text className="text-base font-bold text-gray-900">
            {product.category ?? 'Uncategorized'}
            {product.primary_color ? ` · ${product.primary_color}` : ''}
          </Text>
          <Text className="text-sm text-gray-500 mt-0.5">
            {[product.fabric_estimate, product.pattern].filter(Boolean).join(' · ') || 'AI details pending'}
          </Text>
          {product.ai_tag_error && (
            <Text className="text-xs text-amber-600 mt-1">
              AI failed — edit fields below manually
            </Text>
          )}
          <Text className="text-lg font-bold text-cyan-600 mt-2">
            {formatPriceRange(product.price_min, product.price_max)}
          </Text>
        </View>

        {/* Category (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Category *
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PRODUCT_CATEGORIES.map((cat) => {
              const selected = editedCategory === cat
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setEditedCategory(selected ? null : cat)}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Color (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Color
          </Text>
          <TextInput
            value={editedColor}
            onChangeText={setEditedColor}
            placeholder="e.g. Bottle Green, Navy Blue, Rani Pink"
            className="text-sm text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Fabric (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Fabric
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {FABRIC_TYPES.map((fab) => {
              const selected = editedFabric === fab
              return (
                <TouchableOpacity
                  key={fab}
                  onPress={() => setEditedFabric(selected ? null : fab)}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>
                    {fab}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Pattern (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Pattern
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PATTERN_TYPES.map((pat) => {
              const selected = editedPattern === pat
              return (
                <TouchableOpacity
                  key={pat}
                  onPress={() => setEditedPattern(selected ? null : pat)}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>
                    {pat}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Color variants — tapped variant shows in gallery preview */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Colors · Same Design
            </Text>
            <TouchableOpacity
              onPress={() => router.push(`/product/${product.id}/add-color`)}
              className="bg-cyan-50 px-2.5 py-1 rounded-full flex-row items-center gap-1"
            >
              <Plus size={12} color="#0891B2" />
              <Text className="text-cyan-700 text-xs font-semibold">Add Color</Text>
            </TouchableOpacity>
          </View>

          {product.variants.length === 0 ? (
            <View className="bg-gray-50 rounded-xl px-4 py-3">
              <Text className="text-xs text-gray-400 text-center">
                No color variants yet. Add photos of the same design in different colors.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-3">
                {product.variants.map((variant) => {
                  const isActive = variantPreviewUrl === variant.photo_url
                  return (
                    <TouchableOpacity
                      key={variant.id}
                      onPress={() => {
                        if (variant.photo_url) {
                          if (isActive) {
                            // Deselect — go back to product photos at index 0
                            setVariantPreviewUrl(null)
                            setVariantPreviewColor(null)
                            goToPhoto(0)
                          } else {
                            // Set variant preview + scroll carousel to last position
                            setVariantPreviewUrl(variant.photo_url)
                            setVariantPreviewColor(variant.color)
                            // After state update, the displayPhotos includes the variant
                            // as the last item. Scroll to it smoothly.
                            const variantIndex = displayPhotos.length // will be last position
                            requestAnimationFrame(() => goToPhoto(variantIndex))
                          }
                        }
                      }}
                      className={`items-center gap-1.5 ${isActive ? 'opacity-100' : 'opacity-80'}`}
                    >
                      <View
                        className={`w-20 h-24 rounded-xl overflow-hidden bg-gray-100 border-2 ${
                          isActive ? 'border-cyan-600' : 'border-gray-200'
                        }`}
                      >
                        {variant.photo_url ? (
                          <Image
                            source={{ uri: variant.photo_url }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                          />
                        ) : (
                          <View className="flex-1 items-center justify-center">
                            <Text className="text-gray-300 text-lg">?</Text>
                          </View>
                        )}
                      </View>
                      <View className="flex-row items-center gap-1">
                        {isActive && <Check size={10} color="#0891B2" />}
                        <Text className={`text-xs font-medium ${isActive ? 'text-cyan-700' : 'text-gray-500'}`}>
                          {variant.color}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
          )}
        </View>

        {/* Status */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Status
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const selected = product.status === opt.value
              return (
                <TouchableOpacity
                  key={opt.value}
                  disabled={statusUpdating}
                  onPress={() => void handleStatusChange(opt.value)}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Price */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Price (₹)
          </Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="e.g. 1500"
            keyboardType="numeric"
            className="text-lg font-bold text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Location */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <View className="flex-row items-center gap-1.5 mb-2">
            <MapPin size={12} color="#6B7280" />
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Store Location
            </Text>
          </View>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Rack B · Shelf 3 · Stack 2"
            className="text-sm text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Occasion */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Occasion
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {OCCASION_TYPES.map((occ) => {
              const selected = selectedOccasions.includes(occ)
              return (
                <TouchableOpacity
                  key={occ}
                  onPress={() =>
                    setSelectedOccasions((prev) =>
                      selected ? prev.filter((o) => o !== occ) : [...prev, occ],
                    )
                  }
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-cyan-600 border-cyan-600' : 'bg-white border-gray-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-gray-600'}`}>
                    {occ}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* Notes */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Notes (private)
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Any additional notes for your staff..."
            multiline
            numberOfLines={2}
            className="text-sm text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Delete */}
        <TouchableOpacity
          onPress={handleDelete}
          className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-red-100 bg-red-50"
        >
          <Trash2 size={16} color="#DC2626" />
          <Text className="text-red-600 font-semibold text-sm">Delete Product</Text>
        </TouchableOpacity>
      </View>

      <View className="h-12" />
    </ScrollView>
  )
}
