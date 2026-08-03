import { useCallback, useEffect, useRef, useState } from 'react'
import {
  OCCASION_TYPES,
  PRODUCT_CATEGORIES,
  FABRIC_TYPES,
  PATTERN_TYPES,
  PIECE_TAGGABLE_CATEGORIES,
  SIZE_OPTIONS,
  formatPriceRange,
  resolveFashionColor,
  COLORS,
} from '@kanchuki/shared'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Animated,
  Modal,
} from 'react-native'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Check, Trash2, MapPin, Sparkles, Scissors, Palette, ChevronLeft, ChevronRight, Wand2, RotateCw, ShoppingBag, Camera, X } from 'lucide-react-native'
import { productApi, categoryApi, uploadImageToR2, readLocalImage } from '../../src/lib/api'
import { DetailScreenSkeleton } from '../../src/components/Skeleton'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

// ponytail: Try-On feature not finished yet — flip to true when ready.
const TRY_ON_ENABLED = false
// ponytail: manual per-photo top/bottom crop not supported for now — retake with add-photos instead.
const CROP_PIECE_ENABLED = false

type Photo = { id: string; url: string; is_primary: boolean; piece_type: 'upper' | 'lower' | null }
type Variant = { id: string; color: string; photo_url: string | null }
type Product = {
  id: string
  name: string | null
  sku: string | null
  description: string | null
  subtype: string | null
  category: string | null
  category_id: string | null
  product_type: string | null
  primary_color: string | null
  fabric_estimate: string | null
  pattern: string | null
  occasions: string[]
  sizes: string[]
  price_min: number | null
  price_max: number | null
  status: 'AVAILABLE' | 'SOLD' | 'RESERVED' | 'NOT_SURE'
  location_notes: string | null
  notes: string | null
  ai_tagged: boolean
  ai_tag_error: string | null
  spin_status: string | null
  spin_error: string | null
  photos: Photo[]
  spin_frames: { id: string; url: string }[]
  variants: Variant[]
  section: { name: string } | null
}

const SCREEN_WIDTH = Dimensions.get('window').width

const STATUS_OPTIONS: { value: Product['status']; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'RESERVED', label: 'Reserved' },
  { value: 'SOLD', label: 'Sold' },
  { value: 'NOT_SURE', label: 'Not Sure' },
]

export default function ProductDetailScreen() {
  const { primaryColor } = useTheme()
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
    // Poll while AI tagging or spin-frame extraction is still running so the
    // spinner clears itself instead of requiring the user to leave and re-enter.
    refetchInterval: (query) => {
      const p = (query.state.data as { data: Product } | undefined)?.data
      if (!p) return 3_000
      if (!p.ai_tagged && !p.ai_tag_error) return 3_000
      if (p.spin_status === 'processing') return 3_000
      return false
    },
  })
  const product = (data as { data: Product } | undefined)?.data

  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([])
  const [selectedSizes, setSelectedSizes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Manual crop + white-background cleanup for a photo already on the
  // product. Cache-bust the displayed uri per photo since cleanup overwrites
  // the same r2_key/url — expo-image/CDN would otherwise keep showing the
  // old cached bytes at an unchanged URL.
  const [cleaningPhotoId, setCleaningPhotoId] = useState<string | null>(null)
  const [photoCacheBust, setPhotoCacheBust] = useState<Record<string, number>>({})

  // Editable AI fields
  const [editedName, setEditedName] = useState('')
  const [editedSku, setEditedSku] = useState('')
  const [editedDescription, setEditedDescription] = useState('')
  const [editedSubtype, setEditedSubtype] = useState('')
  const [editedCategory, setEditedCategory] = useState<string | null>(null)
  const [editedColor, setEditedColor] = useState('')
  const [editedFabric, setEditedFabric] = useState<string | null>(null)
  const [editedPattern, setEditedPattern] = useState<string | null>(null)
  const [editedCategoryId, setEditedCategoryId] = useState<string | null>(null)

  // Unsaved-edit guard: the 3s AI-tagging poll returns a fresh product object
  // on every tick — once the retailer edits any field, stop re-hydrating the
  // form from the server so their typing is never wiped mid-poll. Cleared on
  // Save and on product change, so the post-save refetch re-hydrates.
  const [isDirty, setIsDirty] = useState(false)
  const markDirty = useCallback(() => setIsDirty(true), [])
  const dirty = <T,>(setter: (value: T | ((prev: T) => T)) => void) =>
    (value: T | ((prev: T) => T)) => {
      markDirty()
      setter(value)
    }

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', 'list'],
    queryFn: () => categoryApi.list(),
  })
  const categories = categoriesData?.data ?? []

  // Photo gallery state — tracks which photo is selected in the gallery
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set())
  // Tap-photo color detection — detected color is confirmed into editedColor,
  // never auto-saved.
  const [detectingColor, setDetectingColor] = useState(false)
  const [detectedColor, setDetectedColor] = useState<string | null>(null)
  const [colorDetectError, setColorDetectError] = useState<string | null>(null)
  // Measured on layout rather than trusting the static Dimensions snapshot —
  // if the rendered carousel width ever differs from SCREEN_WIDTH (safe-area
  // insets, split-screen, tablet), scrollTo's computed x lands on the wrong
  // page and paging silently stops working.
  const [carouselWidth, setCarouselWidth] = useState(SCREEN_WIDTH)
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

  // ── Fullscreen image viewer ──────────────────────────────────────
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const fullscreenRef = useRef<ScrollView>(null)
  const singleTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current)
    }
  }, [])

  // ── 360° spin viewer — drag-to-rotate through spin_frames, mirrors the
  // web customer PWA's Product360Viewer (apps/web/.../Product360Viewer.tsx) ─
  const [spinViewerOpen, setSpinViewerOpen] = useState(false)
  const [spinFrameIndex, setSpinFrameIndex] = useState(0)
  const spinDragStartX = useRef<number | null>(null)
  const spinDragStartFrame = useRef(0)
  const SPIN_PX_PER_FRAME = 8

  const handleSpinTouchStart = useCallback((e: { nativeEvent: { touches?: { pageX: number }[] } }) => {
    const t = e.nativeEvent.touches?.[0]
    if (!t) return
    spinDragStartX.current = t.pageX
    spinDragStartFrame.current = spinFrameIndex
  }, [spinFrameIndex])

  const handleSpinTouchMove = useCallback((e: { nativeEvent: { touches?: { pageX: number }[] } }) => {
    const t = e.nativeEvent.touches?.[0]
    if (!t || spinDragStartX.current === null || !product) return
    const total = product.spin_frames.length
    if (total === 0) return
    const delta = t.pageX - spinDragStartX.current
    const framesDelta = Math.round(delta / SPIN_PX_PER_FRAME)
    const next = (((spinDragStartFrame.current - framesDelta) % total) + total) % total
    setSpinFrameIndex(next)
  }, [product])

  const handleSpinTouchEnd = useCallback(() => {
    spinDragStartX.current = null
  }, [])

  // Get all displayable images: product photos permanently merged with every
  // variant's photo (deduped by URL). A newly added color-variant photo is
  // always a member of the carousel — no need to tap its swatch first (that
  // was the old transient injection bug). Variant photos carry their color
  // so the badge/thumbnail label still work.
  const displayPhotos = (() => {
    const base = product?.photos ?? []
    const seen = new Set<string>()
    const result: (Photo & { is_variant_preview: boolean; variant_color: string | null })[] = []
    for (const p of base) {
      if (seen.has(p.url)) continue
      seen.add(p.url)
      result.push({ ...p, is_variant_preview: false, variant_color: null })
    }
    for (const v of product?.variants ?? []) {
      if (!v.photo_url || seen.has(v.photo_url)) continue
      seen.add(v.photo_url)
      result.push({
        id: `variant-${v.id}`,
        url: v.photo_url,
        is_primary: false,
        piece_type: null,
        is_variant_preview: true,
        variant_color: v.color,
      })
    }
    displayPhotosRef.current = result.length
    return result
  })()

  const displayUrl = (photo: { id: string; url: string }) => {
    const bust = photoCacheBust[photo.id]
    return bust ? `${photo.url}${photo.url.includes('?') ? '&' : '?'}cb=${bust}` : photo.url
  }

  const currentPhoto = displayPhotos[selectedPhotoIndex] ?? null
  const currentPhotoUrl = currentPhoto?.url ?? null
  const currentPhotoIsVariant = currentPhoto?.is_variant_preview ?? false

  const goToPhoto = useCallback((index: number) => {
    const count = displayPhotosRef.current
    const clamped = Math.max(0, Math.min(index, count - 1))
    // State update first: the thumbnail/dot highlight and the arrow
    // visibility all read from selectedPhotoIndex, so they must switch even
    // if the imperative scrollTo below silently no-ops (e.g. ref not yet
    // attached, or fires before the ScrollView has measured its layout).
    setSelectedPhotoIndex(clamped)
    carouselRef.current?.scrollTo({ x: clamped * carouselWidth, animated: true })
  }, [carouselWidth])

  // Sync the fullscreen viewer's scroll position to whichever photo is
  // currently selected every time it opens.
  useEffect(() => {
    if (fullscreenOpen) {
      requestAnimationFrame(() => {
        fullscreenRef.current?.scrollTo({ x: selectedPhotoIndex * SCREEN_WIDTH, animated: false })
      })
    }
  }, [fullscreenOpen]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // A detected color belongs to the photo it was detected on — clear the chip
  // when the user swipes to another photo.
  useEffect(() => {
    setDetectedColor(null)
    setColorDetectError(null)
  }, [selectedPhotoIndex])

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
        // Double-tap detected — cancel the pending single-tap fullscreen open
        if (singleTapTimeoutRef.current) {
          clearTimeout(singleTapTimeoutRef.current)
          singleTapTimeoutRef.current = null
        }
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
      // Single tap — wait to see if a second tap turns this into a double-tap
      // zoom before opening the fullscreen viewer.
      singleTapTimeoutRef.current = setTimeout(() => {
        singleTapTimeoutRef.current = null
        if (currentScaleRef.current <= 1) setFullscreenOpen(true)
      }, 300)
    }
  }, [scaleAnim, panXAnim, panYAnim])

  // Hydrate the editable fields from the server. The 3s AI-tagging poll
  // returns a fresh product object on every tick; once the retailer has
  // edited anything (isDirty) we hold the form so their typing isn't wiped
  // mid-poll. Save clears the flag, letting the post-save refetch re-hydrate.
  // A product change (new id) always re-hydrates.
  const hydratedProductId = useRef<string | null>(null)
  useEffect(() => {
    if (!product) return
    const firstHydrate = hydratedProductId.current !== product.id
    if (firstHydrate) {
      hydratedProductId.current = product.id
      setIsDirty(false)
    }
    if (!firstHydrate && isDirty) return

    setPrice(product.price_min ? String(product.price_min / 100) : '')
    setLocation(product.location_notes ?? '')
    setNotes(product.notes ?? '')
    setSelectedOccasions(product.occasions ?? [])
    setSelectedSizes(product.sizes ?? [])
    setEditedCategory(product.category)
    setEditedColor(product.primary_color ?? '')
    setEditedFabric(product.fabric_estimate)
    setEditedPattern(product.pattern)
    setEditedCategoryId(product.category_id)
    setEditedName(product.name ?? '')
    setEditedSku(product.sku ?? '')
    setEditedDescription(product.description ?? '')
    setEditedSubtype(product.subtype ?? '')
    if (firstHydrate) {
      // Transient gallery state only resets for a new product — never on a
      // poll (a poll must not yank the retailer back to photo 0 mid-browse
      // or dismiss a just-detected color).
      setSelectedPhotoIndex(0)
      setDetectedColor(null)
      setColorDetectError(null)
    }
    setImageErrors(new Set())
  }, [product, isDirty])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['products'] })
    void queryClient.invalidateQueries({ queryKey: ['retailer', 'stats'] })
  }

  const handleSave = async () => {
    if (!product) return
    setSaving(true)
    try {
      const priceInPaise = price ? Math.round(parseFloat(price) * 100) : undefined
      await productApi.update(product.id, {
        price_min: priceInPaise,
        price_max: priceInPaise,
        name: editedName || undefined,
        sku: editedSku || undefined,
        description: editedDescription || undefined,
        subtype: editedSubtype || undefined,
        category: editedCategory ?? undefined,
        primary_color: editedColor || undefined,
        fabric_estimate: editedFabric ?? undefined,
        pattern: editedPattern ?? undefined,
        category_id: editedCategoryId,
        location_notes: location || undefined,
        notes: notes || undefined,
        occasions: selectedOccasions,
        sizes: selectedSizes,
      })
      invalidate()
      setIsDirty(false)
      Alert.alert('Saved', 'Product updated.')
    } catch (err) {
      showError(err, 'Failed to save')
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
      showError(err, 'Failed to update status')
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
      showError(err, 'Failed to tag photo')
    }
  }

  // Tap-the-photo color detection: runs the quick AI color-only detect on the
  // currently shown photo, then lets the retailer confirm it into the Color
  // field (editedColor) rather than saving automatically.
  const handleDetectColor = async () => {
    const photoUrl = currentPhotoUrl
    if (!photoUrl || detectingColor) return
    setDetectingColor(true)
    setColorDetectError(null)
    try {
      const res = await productApi.detectColor(photoUrl)
      const color = res.data?.color ?? null
      if (color) {
        setDetectedColor(color)
      } else {
        setColorDetectError('No color detected — try another photo.')
      }
    } catch (err) {
      showError(err, 'Color detection failed')
    } finally {
      setDetectingColor(false)
    }
  }

  const handleCleanupPhoto = async (photoId: string) => {
    if (!product) return
    setCleaningPhotoId(photoId)
    try {
      await productApi.cleanupPhoto(product.id, photoId)
      setPhotoCacheBust((prev) => ({ ...prev, [photoId]: Date.now() }))
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      showError(err, 'Failed to clean up photo')
    } finally {
      setCleaningPhotoId(null)
    }
  }

  // Many vendor "set" shots (kameez+dupatta draped on a mannequin, with the
  // folded bottom piece sitting on a stand in the same frame — see
  // docs/PRO-REQUIREMENTS.md F-102) can't be piece-tagged as-is: tagging is
  // per-whole-photo, and one photo can't be both pieces. This re-picks the
  // same image from the gallery and crops out just the requested piece.
  //
  // Uses a custom drag-line crop screen below instead of ImagePicker's
  // allowsEditing — on iOS that native editor is a fixed, non-resizable
  // square crop box, which can't express "everything above/below this line",
  // the actual thing retailers need for a top/bottom garment split.
  const [cropping, setCropping] = useState<'upper' | 'lower' | null>(null)
  const [cropDraft, setCropDraft] = useState<{ uri: string; width: number; height: number; piece: 'upper' | 'lower' } | null>(null)
  const [splitFraction, setSplitFraction] = useState(0.5)
  const [cropSaving, setCropSaving] = useState(false)

  const handleCropPiece = async (piece: 'upper' | 'lower') => {
    if (!product) return
    setCropping(piece)
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Gallery access is needed to crop a photo.')
        return
      }

      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 })
      const asset = picked.canceled ? null : picked.assets[0]
      if (!asset?.uri || !asset.width || !asset.height) return

      setSplitFraction(0.5)
      setCropDraft({ uri: asset.uri, width: asset.width, height: asset.height, piece })
    } catch (err) {
      showError(err, 'Failed to open photo')
    } finally {
      setCropping(null)
    }
  }

  const handleConfirmCrop = async () => {
    if (!product || !cropDraft) return
    setCropSaving(true)
    try {
      const { uri, width, height, piece } = cropDraft
      const splitY = Math.round(splitFraction * height)
      const crop =
        piece === 'upper'
          ? { originX: 0, originY: 0, width, height: splitY }
          : { originX: 0, originY: splitY, width, height: height - splitY }

      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop }, { resize: { width: 1200 } }],
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
      setCropDraft(null)
    } catch (err) {
      showError(err, 'Failed to crop photo')
    } finally {
      setCropSaving(false)
    }
  }

  const handleDelete = () => {
    if (!product || deleting) return
    Alert.alert('Delete Product', 'This removes it from your catalog. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true)
          try {
            await productApi.delete(product.id)
            invalidate()
            router.back()
          } catch (err) {
            showError(err, 'Failed to delete product')
            setDeleting(false)
          }
        },
      },
    ])
  }

  if (isLoading || !product) {
    return <DetailScreenSkeleton />
  }

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header — fixed outside the scroll area so back/save stay reachable */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <AnimatedPressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
          <ChevronLeft size={24} color={COLORS.sand[700]} />
        </AnimatedPressable>
        <Text className="text-base font-bold text-sand-900">Product Details</Text>
        <AnimatedPressable
          onPress={() => void handleSave()}
          disabled={saving}
          className="bg-ink-600 px-4 py-2 rounded-xl"
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-semibold text-sm">Save</Text>
          )}
        </AnimatedPressable>
      </View>

      <ScrollView className="flex-1">
      {/* Photo Gallery — swipeable carousel */}
      <View className="bg-white">
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
                const index = Math.round(e.nativeEvent.contentOffset.x / carouselWidth)
                setSelectedPhotoIndex(index)
              }}
              style={{ flex: 1 }}
            >
              {displayPhotos.map((photo) => (
                <Animated.View
                  key={photo.id}
                  style={{
                    width: carouselWidth,
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
                  )}
                </Animated.View>
              ))}
            </ScrollView>
          ) : (
            <View className="w-full h-full bg-sand-100 items-center justify-center">
              <Text className="text-sand-300 text-5xl mb-2">👗</Text>
              <Text className="text-sand-400 text-xs">No photos</Text>
            </View>
          )}

          {/* Left arrow — hidden when zoomed */}
          {!isZoomed && displayPhotos.length > 1 && selectedPhotoIndex > 0 && (
            <AnimatedPressable
              onPress={() => goToPhoto(selectedPhotoIndex - 1)}
              accessibilityLabel="Previous photo"
              accessibilityRole="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 items-center justify-center shadow-sm"
              style={{ elevation: 3, zIndex: 10 }}
            >
              <ChevronLeft size={20} color={COLORS.sand[700]} />
            </AnimatedPressable>
          )}

          {/* Right arrow — hidden when zoomed */}
          {!isZoomed && displayPhotos.length > 1 && selectedPhotoIndex < displayPhotos.length - 1 && (
            <AnimatedPressable
              onPress={() => goToPhoto(selectedPhotoIndex + 1)}
              accessibilityLabel="Next photo"
              accessibilityRole="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 items-center justify-center shadow-sm"
              style={{ elevation: 3, zIndex: 10 }}
            >
              <ChevronRight size={20} color={COLORS.sand[700]} />
            </AnimatedPressable>
          )}

          {/* Variant badge */}
          {currentPhotoIsVariant && currentPhoto?.variant_color && (
            <View className="absolute top-3 left-3 bg-ink-600/90 px-3 py-1 rounded-full flex-row items-center gap-1">
              <Palette size={12} color="white" />
              <Text className="text-white text-xs font-semibold">{currentPhoto.variant_color}</Text>
            </View>
          )}

          {/* Detect color from the current photo */}
          {!isZoomed && (
            <AnimatedPressable
              onPress={() => void handleDetectColor()}
              disabled={detectingColor}
              accessibilityLabel="Detect color from photo"
              accessibilityRole="button"
              className="absolute right-3 top-3 w-9 h-9 rounded-full bg-white/80 items-center justify-center shadow-sm"
              style={{ elevation: 3, zIndex: 10 }}
            >
              {detectingColor ? (
                <ActivityIndicator size="small" color={COLORS.sand[700]} />
              ) : (
                <Palette size={16} color={COLORS.sand[700]} />
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
                  dirty(setEditedColor)(detectedColor)
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
                <X size={14} color={COLORS.sand[600]} />
              </AnimatedPressable>
            </View>
          )}

          {/* Color-detection error hint */}
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
              {displayPhotos.map((_, idx) => (
                <AnimatedPressable
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

        {/* 360° spin icon — opens the same frames fullscreen, drag to rotate */}
        {product.spin_status === 'ready' && product.spin_frames.length > 0 && (
          <View className="px-4 pt-3">
            <AnimatedPressable
              onPress={() => {
                setSpinFrameIndex(0)
                setSpinViewerOpen(true)
              }}
              className="flex-row items-center justify-center gap-2 bg-ink-50 py-2.5 rounded-xl"
            >
              <RotateCw size={16} color={primaryColor} />
              <Text className="text-ink-700 text-sm font-semibold">View 360°</Text>
            </AnimatedPressable>
          </View>
        )}

        {/* Thumbnail strip — synced with carousel */}
        {displayPhotos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-3 pb-2 pt-2 bg-white">
            <View className="flex-row gap-2">
              {displayPhotos.map((photo, idx) => {
                const isSelected = idx === selectedPhotoIndex
                const isVariant = photo.is_variant_preview
                return (
                  <AnimatedPressable
                    key={photo.id}
                    onPress={() => {
                      goToPhoto(idx)
                    }}
                    className={`w-16 h-16 rounded-lg overflow-hidden border-2 ${
                      isSelected ? 'border-ink-600' : 'border-sand-200'
                    }`}
                  >
                    <Image
                      source={{ uri: displayUrl(photo) }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                    {isVariant && (
                      <View className="absolute bottom-0 left-0 right-0 bg-ink-600/80 py-0.5">
                        <Text className="text-white text-[8px] text-center font-medium">
                          {photo.variant_color ?? ''}
                        </Text>
                      </View>
                    )}
                  </AnimatedPressable>
                )
              })}
            </View>
          </ScrollView>
        )}

        {/* Add photo / add color / add 360° — one row, right below the slider */}
        <View className="flex-row gap-2 px-3 pb-3 pt-1">
          <AnimatedPressable
            onPress={() =>
              router.push(`/product/${product.id}/add-photos?existingCount=${product.photos.length}`)
            }
            disabled={product.photos.length >= 10}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-ink-50 py-2.5 rounded-xl"
          >
            <Camera size={14} color={primaryColor} />
            <Text className="text-ink-700 text-xs font-semibold">Add Photo</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => router.push(`/product/${product.id}/add-color`)}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-ink-50 py-2.5 rounded-xl"
          >
            <Palette size={14} color={primaryColor} />
            <Text className="text-ink-700 text-xs font-semibold">Add Color</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => router.push(`/product/${product.id}/spin-video`)}
            disabled={product.spin_status === 'processing'}
            className="flex-1 flex-row items-center justify-center gap-1.5 bg-ink-50 py-2.5 rounded-xl"
          >
            <RotateCw size={14} color={primaryColor} />
            <Text className="text-ink-700 text-xs font-semibold">
              {product.spin_status === 'ready' ? 'Retake 360°' : 'Add 360°'}
            </Text>
          </AnimatedPressable>
        </View>

        {/* Piece tagging for each photo */}
              {displayPhotos.map((photo, displayIdx) => {
          if (selectedPhotoIndex !== displayIdx) return null
          if (photo.is_variant_preview || !isPieceTaggable(product.category)) return null
          return (
            <View key={`piece-tag-${photo.id}`} className="px-3 py-2 bg-white flex-row gap-2">
              {(['upper', 'lower'] as const).map((piece) => {
                const selected = photo.piece_type === piece
                return (
                  <AnimatedPressable
                    key={piece}
                    onPress={() => void handleSetPieceType(photo.id, piece)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`px-3 py-1 rounded-full border flex-row items-center gap-1 ${
                      selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                    }`}
                  >
                    {selected && <Check size={12} color="white" />}
                    <Text className={`text-xs font-medium capitalize ${selected ? 'text-white' : 'text-sand-600'}`}>
                      {piece} piece
                    </Text>
                  </AnimatedPressable>
                )
              })}
            </View>
          )
        })}
      </View>
      {isPieceTaggable(product.category) && (
        <View className="mx-4 mt-3 bg-ink-50 border border-ink-100 rounded-xl px-3 py-2">
          <Text className="text-ink-700 text-xs">
            Tag one photo {'"'}Upper piece{'"'} and one {'"'}Lower piece{'"'} for a better try-on match on this 2-piece outfit.
          </Text>
        </View>
      )}

      {/* Crop-tagging: for the common case where both pieces are shot in ONE
          photo (e.g. draped kameez+dupatta with the folded bottom piece on a
          stand, same frame) — crop the missing piece out of an existing
          gallery photo instead of needing a fresh, separate photoshoot. */}
      {CROP_PIECE_ENABLED && isPieceTaggable(product.category) && (
        <View className="mx-4 mt-2 flex-row gap-2">
          {(['upper', 'lower'] as const)
            .filter((piece) => !product.photos.some((p) => p.piece_type === piece))
            .map((piece) => (
              <AnimatedPressable
                key={piece}
                onPress={() => void handleCropPiece(piece)}
                disabled={cropping !== null}
                className="flex-1 flex-row items-center justify-center gap-1.5 border border-dashed border-ink-300 rounded-xl py-2"
              >
                {cropping === piece ? (
                  <ActivityIndicator size="small" color={primaryColor} />
                ) : (
                  <Scissors size={14} color={primaryColor} />
                )}
                <Text className="text-ink-700 text-xs font-medium capitalize">
                  Crop {piece}
                </Text>
              </AnimatedPressable>
            ))}
        </View>
      )}

      {/* Manual crop + white-background cleanup for the currently viewed photo */}
      {!currentPhotoIsVariant && displayPhotos[selectedPhotoIndex] && (
        <AnimatedPressable
          onPress={() => void handleCleanupPhoto(displayPhotos[selectedPhotoIndex]!.id)}
          disabled={cleaningPhotoId !== null}
          className="mx-4 mt-2 flex-row items-center justify-center gap-1.5 border border-dashed border-ink-300 rounded-xl py-2"
        >
          {cleaningPhotoId === displayPhotos[selectedPhotoIndex]?.id ? (
            <ActivityIndicator size="small" color={primaryColor} />
          ) : (
            <Wand2 size={14} color={primaryColor} />
          )}
          <Text className="text-ink-700 text-xs font-medium">
            {cleaningPhotoId === displayPhotos[selectedPhotoIndex]?.id
              ? 'Cleaning up...'
              : 'Crop & remove background'}
          </Text>
        </AnimatedPressable>
      )}

      {!product.ai_tagged && !product.ai_tag_error && (
        <View className="mx-4 mt-3 bg-ink-50 border border-ink-100 rounded-xl px-3 py-2 flex-row items-center gap-2">
          <ActivityIndicator size="small" color={primaryColor} />
          <Text className="text-ink-700 text-xs">AI tagging in progress...</Text>
        </View>
      )}
      {product.ai_tag_error && (
        <View className="mx-4 mt-3 bg-turmeric-50 border border-turmeric-100 rounded-xl px-3 py-2">
          <Text className="text-turmeric-700 text-xs font-semibold">AI tagging failed</Text>
          <Text className="text-turmeric-600 text-[10px] mt-1 leading-relaxed" numberOfLines={3}>
            {product.ai_tag_error}
          </Text>
          <Text className="text-turmeric-500 text-[10px] mt-1">
            You can edit the fields below manually. Tap Save when done.
          </Text>
        </View>
      )}

      <View className="px-4 py-4 gap-4">
        {/* Try-On */}
        {TRY_ON_ENABLED && (
          <AnimatedPressable
            onPress={() =>
              router.push({ pathname: '/tryon/in-store', params: { productId: product.id } })
            }
            className="flex-row items-center justify-center gap-2 bg-ink-600 py-3.5 rounded-2xl"
          >
            <Sparkles size={18} color="white" />
            <Text className="text-white font-bold">Try-On with Customer Photo</Text>
          </AnimatedPressable>
        )}

        {/* Color variants — tapped variant shows in gallery preview */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Colors · Same Design
          </Text>

          {product.variants.length === 0 ? (
            <View className="bg-sand-50 rounded-xl px-4 py-3">
              <Text className="text-xs text-sand-400 text-center">
                No color variants yet. Add photos of the same design in different colors.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-3">
                {product.variants.map((variant) => {
                  // Variant photos are permanent members of displayPhotos, so
                  // the swatch just jumps the carousel to that photo.
                  const variantPhotoIndex = variant.photo_url
                    ? displayPhotos.findIndex((p) => p.url === variant.photo_url)
                    : -1
                  const isActive = variantPhotoIndex === selectedPhotoIndex
                  return (
                    <AnimatedPressable
                      key={variant.id}
                      onPress={() => {
                        if (variantPhotoIndex >= 0) {
                          // Tapping the already-active variant returns to the
                          // first photo; otherwise jump to its photo.
                          goToPhoto(isActive ? 0 : variantPhotoIndex)
                        }
                      }}
                      className={`items-center gap-1.5 ${isActive ? 'opacity-100' : 'opacity-80'}`}
                    >
                      {/* Solid color-fill circle (ecommerce swatch convention) — the
                          actual photo shows in the slider above on tap, not here. */}
                      <View
                        className={`w-9 h-9 rounded-full border-2 ${
                          isActive ? 'border-ink-600' : 'border-sand-200'
                        }`}
                        style={{ backgroundColor: resolveFashionColor(variant.color) }}
                      />
                      <View className="flex-row items-center gap-1">
                        {isActive && <Check size={10} color={primaryColor} />}
                        <Text className={`text-xs font-medium ${isActive ? 'text-ink-700' : 'text-sand-500'}`}>
                          {variant.color}
                        </Text>
                      </View>
                    </AnimatedPressable>
                  )
                })}
              </View>
            </ScrollView>
          )}
        </View>

        {/* AI-read attributes (read-only summary) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <View className="flex-row items-center gap-2 mb-2">
            <Sparkles size={14} color={primaryColor} />
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
              AI Summary
            </Text>
          </View>
          {product.name ? (
            <Text className="text-sm font-semibold text-sand-700">{product.name}</Text>
          ) : null}
          <Text className="text-base font-bold text-sand-900">
            {product.subtype ?? product.category ?? 'Uncategorized'}
            {product.primary_color ? ` · ${product.primary_color}` : ''}
          </Text>
          <Text className="text-sm text-sand-500 mt-0.5">
            {[product.fabric_estimate, product.pattern].filter(Boolean).join(' · ') || 'AI details pending'}
          </Text>
          {product.ai_tag_error && (
            <Text className="text-xs text-turmeric-600 mt-1">
              AI failed — edit fields below manually
            </Text>
          )}
          <Text className="text-lg font-bold text-ink-600 mt-2">
            {formatPriceRange(product.price_min, product.price_max)}
          </Text>
        </View>

        {/* Product info — name / subtype / SKU / description (editable AI fields) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100 gap-2">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1">
            Product Info
          </Text>
          <View>
            <Text className="text-xs font-medium text-sand-500 mb-1">Name</Text>
            <TextInput
              value={editedName}
              onChangeText={dirty(setEditedName)}
              placeholder="e.g. Peach Floral Lehenga Skirt"
              className="text-sm text-sand-900 border border-sand-100 rounded-xl px-3 py-2.5"
              placeholderTextColor={COLORS.sand[400]}
            />
          </View>
          <View>
            <Text className="text-xs font-medium text-sand-500 mb-1">Subtype</Text>
            <TextInput
              value={editedSubtype}
              onChangeText={dirty(setEditedSubtype)}
              placeholder="e.g. Lehenga Skirt, Kurta Set, Suit with Dupatta"
              className="text-sm text-sand-900 border border-sand-100 rounded-xl px-3 py-2.5"
              placeholderTextColor={COLORS.sand[400]}
            />
          </View>
          <View>
            <Text className="text-xs font-medium text-sand-500 mb-1">SKU</Text>
            <TextInput
              value={editedSku}
              onChangeText={dirty(setEditedSku)}
              placeholder="e.g. LS0001"
              autoCapitalize="characters"
              className="text-sm text-sand-900 border border-sand-100 rounded-xl px-3 py-2.5"
              placeholderTextColor={COLORS.sand[400]}
            />
          </View>
          <View>
            <Text className="text-xs font-medium text-sand-500 mb-1">Description</Text>
            <TextInput
              value={editedDescription}
              onChangeText={dirty(setEditedDescription)}
              placeholder="Short description for the customer listing..."
              multiline
              numberOfLines={3}
              className="text-sm text-sand-900 border border-sand-100 rounded-xl px-3 py-2.5"
              placeholderTextColor={COLORS.sand[400]}
            />
          </View>
        </View>

        {/* Category (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Category *
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PRODUCT_CATEGORIES.map((cat) => {
              const selected = editedCategory === cat
              return (
                <AnimatedPressable
                  key={cat}
                  onPress={() => dirty(setEditedCategory)(selected ? null : cat)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>
                    {cat}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Merchandising category (retailer-curated, optional) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
              Category (Catalog Group)
            </Text>
            <AnimatedPressable onPress={() => router.push('/category')}>
              <Text className="text-ink-600 text-xs font-semibold">Manage</Text>
            </AnimatedPressable>
          </View>
          {categories.length === 0 ? (
            <Text className="text-xs text-sand-400">
              No categories yet — tap Manage to create one.
            </Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {categories.map((cat) => {
                const selected = editedCategoryId === cat.id
                return (
                  <AnimatedPressable
                    key={cat.id}
                    onPress={() => dirty(setEditedCategoryId)(selected ? null : cat.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                      selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                    }`}
                  >
                    {selected && <Check size={12} color="white" />}
                    <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>
                      {cat.name}
                    </Text>
                  </AnimatedPressable>
                )
              })}
            </View>
          )}
        </View>

        {/* Color (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
            Color
          </Text>
          <TextInput
            value={editedColor}
            onChangeText={dirty(setEditedColor)}
            placeholder="e.g. Bottle Green, Navy Blue, Rani Pink"
            className="text-sm text-sand-900"
            placeholderTextColor={COLORS.sand[400]}
          />
        </View>

        {/* Fabric (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Fabric
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {FABRIC_TYPES.map((fab) => {
              const selected = editedFabric === fab
              return (
                <AnimatedPressable
                  key={fab}
                  onPress={() => dirty(setEditedFabric)(selected ? null : fab)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>
                    {fab}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Pattern (editable) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Pattern
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PATTERN_TYPES.map((pat) => {
              const selected = editedPattern === pat
              return (
                <AnimatedPressable
                  key={pat}
                  onPress={() => dirty(setEditedPattern)(selected ? null : pat)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>
                    {pat}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* 360 spin view — status only, the add/retake action lives in the row below the slider */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1">
            360° Spin View
          </Text>
          <Text className="text-xs text-sand-400">
            {product.spin_status === 'processing'
              ? 'Processing spin video...'
              : product.spin_status === 'ready'
                ? `${product.spin_frames.length} frames ready`
                : product.spin_status === 'failed'
                  ? (product.spin_error ?? 'Processing failed — try again')
                  : 'Record a short spin video of the garment'}
          </Text>
        </View>

        {/* Status */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Status
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {STATUS_OPTIONS.map((opt) => {
              const selected = product.status === opt.value
              return (
                <AnimatedPressable
                  key={opt.value}
                  disabled={statusUpdating}
                  onPress={() => void handleStatusChange(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>
                    {opt.label}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Price */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
            Price (₹)
          </Text>
          <TextInput
            value={price}
            onChangeText={dirty(setPrice)}
            placeholder="e.g. 1500"
            keyboardType="numeric"
            className="text-lg font-bold text-sand-900"
            placeholderTextColor={COLORS.sand[400]}
          />
        </View>

        {/* Location */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <View className="flex-row items-center gap-1.5 mb-2">
            <MapPin size={12} color={COLORS.sand[600]} />
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
              Store Location
            </Text>
          </View>
          <TextInput
            value={location}
            onChangeText={dirty(setLocation)}
            placeholder="e.g. Rack B · Shelf 3 · Stack 2"
            className="text-sm text-sand-900"
            placeholderTextColor={COLORS.sand[400]}
          />
        </View>

        {/* Sizes */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Sizes
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {SIZE_OPTIONS.map((size) => {
              const selected = selectedSizes.includes(size)
              return (
                <AnimatedPressable
                  key={size}
                  onPress={() =>
                    dirty(setSelectedSizes)((prev) =>
                      selected ? prev.filter((s) => s !== size) : [...prev, size],
                    )
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>
                    {size}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Occasion */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Occasion
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {OCCASION_TYPES.map((occ) => {
              const selected = selectedOccasions.includes(occ)
              return (
                <AnimatedPressable
                  key={occ}
                  onPress={() =>
                    dirty(setSelectedOccasions)((prev) =>
                      selected ? prev.filter((o) => o !== occ) : [...prev, occ],
                    )
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>
                    {occ}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Notes */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
            Notes (private)
          </Text>
          <TextInput
            value={notes}
            onChangeText={dirty(setNotes)}
            placeholder="Any additional notes for your staff..."
            multiline
            numberOfLines={2}
            className="text-sm text-sand-900"
            placeholderTextColor={COLORS.sand[400]}
          />
        </View>

        {/* Related Products — same category from same retailer */}
        {product.category && (
          <RelatedProductsSection
            category={product.category}
            excludeId={product.id}
            onSelect={(relatedId) => {
              router.push(`/product/${relatedId}`)
            }}
          />
        )}

        {/* Delete */}
        <AnimatedPressable
          onPress={handleDelete}
          disabled={deleting}
          className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-rust-100 bg-rust-50"
        >
          {deleting ? (
            <ActivityIndicator size="small" color={COLORS.rust[600]} />
          ) : (
            <Trash2 size={16} color={COLORS.rust[600]} />
          )}
          <Text className="text-rust-600 font-semibold text-sm">
            {deleting ? 'Deleting…' : 'Delete Product'}
          </Text>
        </AnimatedPressable>
      </View>

      <View className="h-12" />
      </ScrollView>

      {/* Adjustable-height crop: drag the line to where the upper piece ends
          / lower piece begins, then crop just that half. */}
      <Modal visible={cropDraft !== null} transparent animationType="fade" onRequestClose={() => setCropDraft(null)}>
        {cropDraft && (() => {
          const displayWidth = SCREEN_WIDTH - 48
          const displayHeight = displayWidth * (cropDraft.height / cropDraft.width)
          const lineY = splitFraction * displayHeight
          const updateSplit = (y: number) => {
            const clamped = Math.max(0.08, Math.min(0.92, y / displayHeight))
            setSplitFraction(clamped)
          }
          return (
            <View className="flex-1 bg-black/80 items-center justify-center px-6">
              <Text className="text-white font-semibold mb-1">
                Drag the line to where the {cropDraft.piece} piece {cropDraft.piece === 'upper' ? 'ends' : 'begins'}
              </Text>
              <Text className="text-sand-400 text-xs mb-4">
                {cropDraft.piece === 'upper' ? 'Top' : 'Bottom'} highlighted section will be saved
              </Text>
              <View
                style={{ width: displayWidth, height: displayHeight }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => updateSplit(e.nativeEvent.locationY)}
                onResponderMove={(e) => updateSplit(e.nativeEvent.locationY)}
              >
                <Image source={{ uri: cropDraft.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute', left: 0, right: 0, top: 0, height: lineY,
                    backgroundColor: cropDraft.piece === 'lower' ? 'rgba(0,0,0,0.6)' : 'transparent',
                  }}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute', left: 0, right: 0, top: lineY, bottom: 0,
                    backgroundColor: cropDraft.piece === 'upper' ? 'rgba(0,0,0,0.6)' : 'transparent',
                  }}
                />
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: lineY - 1, height: 2, backgroundColor: primaryColor }} />
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute', left: '50%', marginLeft: -22, top: lineY - 14,
                    width: 44, height: 28, borderRadius: 14, backgroundColor: primaryColor,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text className="text-white text-[10px] font-bold">{Math.round(splitFraction * 100)}%</Text>
                </View>
              </View>

              <View className="flex-row gap-3 mt-6 w-full">
                <AnimatedPressable
                  onPress={() => setCropDraft(null)}
                  disabled={cropSaving}
                  className="flex-1 bg-white/10 py-3.5 rounded-2xl items-center"
                >
                  <Text className="text-white font-semibold">Cancel</Text>
                </AnimatedPressable>
                <View className="flex-1">
                  <GradientButton label="Crop & Save" onPress={() => void handleConfirmCrop()} loading={cropSaving} />
                </View>
              </View>
            </View>
          )
        })()}
      </Modal>

      {/* Fullscreen image viewer — tap main photo to open, swipe left/right
          between photos (no arrow buttons), back arrow to close. */}
      <Modal
        visible={fullscreenOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <AnimatedPressable
            onPress={() => setFullscreenOpen(false)}
            accessibilityLabel="Close"
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

          <ScrollView
            ref={fullscreenRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            style={{ flex: 1 }}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH)
              const clamped = Math.max(0, Math.min(idx, displayPhotos.length - 1))
              setSelectedPhotoIndex(clamped)
            }}
          >
            {displayPhotos.map((photo) => (
              <View
                key={`fs-${photo.id}`}
                style={{ width: SCREEN_WIDTH, height: '100%', alignItems: 'center', justifyContent: 'center' }}
              >
                <Image
                  source={{ uri: displayUrl(photo) }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="contain"
                />
              </View>
            ))}
          </ScrollView>

          {displayPhotos.length > 1 && (
            <View
              style={{
                position: 'absolute',
                bottom: insets.bottom + 20,
                left: 0,
                right: 0,
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {displayPhotos.map((_, idx) => (
                <View
                  key={idx}
                  style={{
                    width: idx === selectedPhotoIndex ? 16 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: idx === selectedPhotoIndex ? 'white' : 'rgba(255,255,255,0.4)',
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </Modal>

      {/* Fullscreen 360° spin viewer — drag left/right to rotate through frames */}
      <Modal
        visible={spinViewerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSpinViewerOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'black' }}>
          <AnimatedPressable
            onPress={() => setSpinViewerOpen(false)}
            accessibilityLabel="Close"
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
            {product.spin_frames.map((frame, i) => (
              <Image
                key={frame.id}
                source={{ uri: frame.url }}
                style={{ position: 'absolute', width: '100%', height: '100%', opacity: i === spinFrameIndex ? 1 : 0 }}
                contentFit="contain"
              />
            ))}
          </View>

          <View
            style={{
              position: 'absolute',
              bottom: insets.bottom + 24,
              left: 0,
              right: 0,
              alignItems: 'center',
            }}
          >
            <View style={{ backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}>
              <Text style={{ color: 'white', fontSize: 11, fontWeight: '600' }}>Drag to rotate · 360°</Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

// ─── Related Products Section ─────────────────────────────────────

interface RelatedProduct {
  id: string
  name: string | null
  price_min: number | null
  price_max: number | null
  status: string
  primary_photo_url: string | null
  category: string | null
  primary_color: string | null
}

const RELATED_API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3001'

function RelatedProductsSection({
  category,
  excludeId,
  onSelect,
}: {
  category: string
  excludeId: string
  onSelect: (id: string) => void
}) {
  const { primaryColor } = useTheme()
  const [related, setRelated] = useState<RelatedProduct[]>([])
  const [loadingRelated, setLoadingRelated] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchRelated = async () => {
      try {
        const res = await fetch(
          `${RELATED_API_URL}/v1/public/products/${excludeId}/related`,
        )
        if (!res.ok) return
        const json = (await res.json()) as { data: RelatedProduct[] }
        if (!cancelled && json?.data) setRelated(json.data)
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoadingRelated(false)
      }
    }
    fetchRelated()
    return () => {
      cancelled = true
    }
  }, [excludeId])

  if (loadingRelated || related.length === 0) return null

  return (
    <View className="bg-white rounded-2xl p-4 border border-sand-100">
      <View className="flex-row items-center gap-2 mb-3">
        <ShoppingBag size={14} color={primaryColor} />
        <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
          More {category}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-3">
          {related.map((rp) => (
            <AnimatedPressable
              key={rp.id}
              onPress={() => onSelect(rp.id)}
              className="w-28"
            >
              <View className="w-28 h-36 rounded-xl overflow-hidden bg-sand-100 border border-sand-200">
                {rp.primary_photo_url ? (
                  <Image
                    source={{ uri: rp.primary_photo_url }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : (
                  <View className="flex-1 items-center justify-center">
                    <Text className="text-sand-300">👗</Text>
                  </View>
                )}
                {rp.status === 'SOLD' && (
                  <View className="absolute top-1 left-1 bg-rust-500 rounded-full px-1.5 py-0.5">
                    <Text className="text-white text-[8px] font-bold">Sold</Text>
                  </View>
                )}
              </View>
              <Text className="text-xs font-bold text-sand-900 mt-1.5 tabular-nums">
                {rp.price_min ? `₹${(rp.price_min / 100).toLocaleString('en-IN')}` : ''}
              </Text>
              {rp.primary_color && (
                <Text className="text-[10px] text-sand-500 truncate">{rp.primary_color}</Text>
              )}
            </AnimatedPressable>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
