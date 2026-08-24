import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PATTERN_TYPES,
  PIECE_TAGGABLE_CATEGORIES,
  SIZE_OPTIONS,
  STUDIO_TEMPLATES,
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
  Modal,
  Switch,
} from 'react-native'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import Gallery, { type GalleryRef } from 'react-native-awesome-gallery'
import { Check, Trash2, MapPin, Sparkles, Scissors, Palette, ChevronLeft, ChevronRight, Wand2, Camera, X, Tag, Star, Video, Languages } from 'lucide-react-native'
import {
  productApi,
  categoryApi,
  productAttributeApi,
  uploadImageToR2,
  readLocalImage,
  ApiError,
} from '../../src/lib/api'
import { growthApi } from '../../src/lib/api/growth'
import { DetailScreenSkeleton } from '../../src/components/Skeleton'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { pollWithBackoff } from '../../src/lib/polling'
import { GradientButton } from '../../src/components/GradientButton'
import { RelatedProductsSection } from '../../src/components/product-detail/RelatedProducts'
import { SkuTagModal } from '../../src/components/product-detail/SkuTagModal'
import { STATUS_OPTIONS, type Photo, type Product } from '../../src/components/product-detail/types'

// ponytail: Try-On feature not finished yet — flip to true when ready.
const TRY_ON_ENABLED = false
// ponytail: manual per-photo top/bottom crop not supported for now — retake with add-photos instead.
const CROP_PIECE_ENABLED = false

const SCREEN_WIDTH = Dimensions.get('window').width

export default function ProductDetailScreen() {
  const { primaryColor, colors } = useTheme()
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
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [selectedFabrics, setSelectedFabrics] = useState<string[]>([])
  const [selectedSizes, setSelectedSizes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [retagging, setRetagging] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Cache-bust the displayed uri per photo since cleanup/background changes
  // overwrite the same r2_key/url — expo-image/CDN would otherwise keep
  // showing the old cached bytes at an unchanged URL.
  const [photoCacheBust, setPhotoCacheBust] = useState<Record<string, number>>({})
  // Post-save background picker — admin-curated backdrop library, same
  // endpoint add.tsx uses. Empty when the admin library has zero active
  // backdrops. useQuery (not a bare effect+catch) so a transient fetch
  // failure auto-retries instead of permanently hiding the section for the
  // rest of this screen visit.
  const { data: backgroundImagesData } = useQuery({
    queryKey: ['products', 'background-images'],
    queryFn: () => productApi.getBackgroundImages(),
  })
  const backgroundImages = backgroundImagesData?.data ?? []
  // Per-photo applied backdrop (client-only highlight — the composite is baked
  // into the photo bytes, there is no per-photo bg column). Keyed by photo id;
  // "Auto" (null) is the default until the retailer picks one this session.
  const [photoBackgrounds, setPhotoBackgrounds] = useState<Record<string, string | null>>({})
  const [backgroundSaving, setBackgroundSaving] = useState(false)
  // F-030: per-photo shadow preference (client-only — the shadow is baked into
  // the composite bytes like the background, there is no per-photo shadow
  // column). Seeded from the product-level add_shadow default for the primary
  // photo; the toggle chip re-runs cleanup with the new setting immediately.
  const [photoShadows, setPhotoShadows] = useState<Record<string, boolean>>({})
  const [shadowSaving, setShadowSaving] = useState(false)
  // F-029: "Set as main" — busy state for promoting the viewed photo to the
  // product's primary (the image the catalog + storefront show first).
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null)
  // F-032: AI Studio Shoot — async generation (FLUX Kontext, 10–60s). The
  // picker modal → POST returns a job_id → we poll status every 3s until
  // ready (new photo row appears in the carousel) or failed.
  const [studioModalOpen, setStudioModalOpen] = useState(false)
  const [studioStarting, setStudioStarting] = useState(false)
  const [studioJob, setStudioJob] = useState<{ jobId: string; photoId: string } | null>(null)
  const [studioStatus, setStudioStatus] = useState<'processing' | 'ready' | 'failed' | null>(null)
  const [studioError, setStudioError] = useState<string | null>(null)
  const [studioUpgradeRequired, setStudioUpgradeRequired] = useState(false)
  const [studioResult, setStudioResult] = useState<{ photoId: string; url: string } | null>(null)
  const [studioProgress, setStudioProgress] = useState<number>(0)
  const [studioEtaMs, setStudioEtaMs] = useState<number>(0)

  // F-033: Ken Burns product video generated from the product's own photos.
  const generateVideo = useMutation({
    mutationFn: () => growthApi.generateVideo(product!.id),
    onSuccess: () =>
      Alert.alert('Generating video', 'Building a video from your product photos — check back in a minute.'),
    onError: (err) => showError(err, 'Could not start video generation'),
  })
  const handleGenerateVideo = () => {
    if (!product) return
    if (product.photos.length < 2) {
      Alert.alert('Add more photos', 'Add at least 2 photos before generating a video.')
      return
    }
    generateVideo.mutate()
  }

  // Editable AI fields
  const [editedName, setEditedName] = useState('')
  const [editedSku, setEditedSku] = useState('')
  const [editedDescription, setEditedDescription] = useState('')
  const [editedSubtype, setEditedSubtype] = useState('')
  const [editedCategory, setEditedCategory] = useState<string | null>(null)
  const [editedColor, setEditedColor] = useState('')
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

  // Dynamic, retailer-editable Style/Fabric taxonomy (DB-backed, seeded from
  // the admin default template — no hardcoded option lists).
  const { data: stylesData } = useQuery({
    queryKey: ['attributes', 'STYLE'],
    queryFn: () => productAttributeApi.list('STYLE'),
  })
  const styleOptions = stylesData?.data ?? []
  const { data: fabricsData } = useQuery({
    queryKey: ['attributes', 'FABRIC'],
    queryFn: () => productAttributeApi.list('FABRIC'),
  })
  const fabricOptions = fabricsData?.data ?? []

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
  const galleryRef = useRef<GalleryRef>(null)
  const displayPhotosRef = useRef(0)

  // ── Fullscreen image viewer ──────────────────────────────────────
  const [fullscreenOpen, setFullscreenOpen] = useState(false)

  // F-025: printable SKU/QR tag modal — the sticker a retailer prints once
  // per design and sticks on the rack card, then scans to mark sold.
  const [skuTagOpen, setSkuTagOpen] = useState(false)

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
    const result: (Photo & {
      is_variant_preview: boolean
      variant_color: string | null
      is_original_preview: boolean
    })[] = []
    for (const p of base) {
      if (seen.has(p.url)) continue
      seen.add(p.url)
      result.push({ ...p, is_variant_preview: false, variant_color: null, is_original_preview: false })
      // Raw pre-cleanup upload, preserved when background removal ran
      // (apps/api/src/lib/photo-cleanup.ts) — shown as its own slider entry
      // right after the cleaned version, not swapped in place of it.
      if (p.original_url && !seen.has(p.original_url)) {
        seen.add(p.original_url)
        result.push({
          id: `${p.id}-original`,
          url: p.original_url,
          is_primary: false,
          piece_type: null,
          is_variant_preview: false,
          variant_color: null,
          is_original_preview: true,
        })
      }
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
        is_original_preview: false,
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
  const currentPhotoIsOriginal = currentPhoto?.is_original_preview ?? false

  const goToPhoto = useCallback((index: number) => {
    const count = displayPhotosRef.current
    const clamped = Math.max(0, Math.min(index, count - 1))
    // State update first: the thumbnail/dot highlight and the arrow
    // visibility all read from selectedPhotoIndex, so they must switch even
    // if the imperative setIndex below silently no-ops (e.g. ref not yet
    // attached).
    setSelectedPhotoIndex(clamped)
    galleryRef.current?.setIndex(clamped, true)
  }, [])

  // A detected color belongs to the photo it was detected on — clear the chip
  // when the user swipes to another photo.
  useEffect(() => {
    setDetectedColor(null)
    setColorDetectError(null)
  }, [selectedPhotoIndex])

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

    setPrice(product.price_min != null ? String(product.price_min / 100) : '')
    setLocation(product.location_notes ?? '')
    setNotes(product.notes ?? '')
    setSelectedStyles(product.styles ?? [])
    setSelectedFabrics(product.fabrics ?? [])
    setSelectedSizes(product.sizes ?? [])
    setEditedCategory(product.category)
    setEditedColor(product.primary_color ?? '')
    setEditedPattern(product.pattern)
    setEditedCategoryId(product.category_id)
    // Seed the primary photo's backdrop highlight from the product-level
    // background (the one the DB records); other photos default to Auto.
    // Merge, never replace: the 3s AI-tagging poll refetches a fresh product
    // on every tick, and a replace would wipe per-photo picks the retailer
    // made this session (photoBackgrounds) even though the composites were
    // already baked into the bytes. Existing entries keep their pick.
    const primaryPhoto = product.photos.find((p) => p.is_primary)
    if (primaryPhoto) {
      setPhotoBackgrounds((prev) => ({
        ...prev,
        [primaryPhoto.id]: prev[primaryPhoto.id] ?? product.background_image_id,
      }))
      // F-030: seed the shadow preference the same way — merge, never replace,
      // so the 3s poll refetch can't wipe a toggle the retailer just flipped.
      setPhotoShadows((prev) => ({
        ...prev,
        [primaryPhoto.id]: prev[primaryPhoto.id] ?? product.add_shadow ?? false,
      }))
    }
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
        pattern: editedPattern ?? undefined,
        category_id: editedCategoryId,
        location_notes: location || undefined,
        notes: notes || undefined,
        styles: selectedStyles,
        fabrics: selectedFabrics,
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

  // Re-runs AI tagging for this product (retag endpoint → same background
  // tag-product job). Refreshes category/color/fabric/pattern and
  // fills any blank name/subtype/SKU/description — the job only writes those
  // when null, so a retailer edit is never clobbered. The 3s poll picks up
  // ai_tagged:false → "AI tagging in progress..." → completed tags re-hydrate
  // the form (unless the retailer has unsaved edits, guarded by isDirty).
  const handleRetag = async () => {
    if (!product || retagging) return
    setRetagging(true)
    try {
      await productApi.retag(product.id)
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      showError(err, 'Failed to start re-tagging')
    } finally {
      setRetagging(false)
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

  // F-030: the shadow preference currently in effect for a given photo — the
  // session toggle if one was flipped, else the product-level default.
  const shadowFor = (photoId: string): boolean =>
    photoShadows[photoId] ?? product?.add_shadow ?? false

  // Apply the chosen backdrop to the currently-viewed photo (per-photo, not
  // the product primary): recomposites THAT photo onto the backdrop via the
  // cleanup pipeline, so "remove background → pick background" is one flow on
  // the image being edited. Auto (null) → white / product-level backdrop.
  const handleSetBackground = async (backgroundId: string | null) => {
    const photo = currentPhoto
    if (!product || !photo || backgroundSaving) return
    if (photo.is_variant_preview || photo.is_original_preview) return
    setBackgroundSaving(true)
    try {
      // F-030: a background change re-runs cleanup — carry the current shadow
      // preference so a flipped toggle isn't silently dropped by the recomposite.
      await productApi.cleanupPhoto(product.id, photo.id, backgroundId, shadowFor(photo.id))
      setPhotoBackgrounds((prev) => ({ ...prev, [photo.id]: backgroundId }))
      setPhotoCacheBust((prev) => ({ ...prev, [photo.id]: Date.now() }))
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      showError(err, 'Failed to change background')
    } finally {
      setBackgroundSaving(false)
    }
  }

  // F-030: toggle the shadow on the currently-viewed photo — re-runs cleanup
  // with the new setting baked in immediately, same pattern as the background
  // swatches (no separate Save needed). The preference is client-only for this
  // photo; the product-level default stays untouched.
  const handleSetShadow = async (value: boolean) => {
    const photo = currentPhoto
    if (!product || !photo || shadowSaving) return
    if (photo.is_variant_preview || photo.is_original_preview) return
    setShadowSaving(true)
    try {
      await productApi.cleanupPhoto(
        product.id,
        photo.id,
        photoBackgrounds[photo.id] ?? null,
        value,
      )
      setPhotoShadows((prev) => ({ ...prev, [photo.id]: value }))
      setPhotoCacheBust((prev) => ({ ...prev, [photo.id]: Date.now() }))
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      showError(err, 'Failed to update shadow')
    } finally {
      setShadowSaving(false)
    }
  }

  // F-029: promote the currently-viewed photo to the product's main image.
  // The catalog/customer surfaces all order by is_primary desc, so this is
  // what makes the edited photo the image shown on catalog and display —
  // the rest stay as additional photos.
  const handleSetPrimary = async (photoId: string) => {
    if (!product || settingPrimaryId) return
    setSettingPrimaryId(photoId)
    try {
      await productApi.setPhotoPrimary(product.id, photoId)
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
      invalidate()
    } catch (err) {
      showError(err, 'Failed to set main photo')
    } finally {
      setSettingPrimaryId(null)
    }
  }

  // F-032: start a studio-shoot generation for the currently-viewed photo.
  // POST returns a job_id immediately; polling below picks up the result.
  const handleStartStudioShoot = async (template: string) => {
    const photo = currentPhoto
    if (!product || !photo) return
    if (photo.is_variant_preview || photo.is_original_preview) return
    setStudioModalOpen(false)
    setStudioStarting(true)
    setStudioError(null)
    setStudioUpgradeRequired(false)
    setStudioResult(null)
    try {
      const res = await productApi.startStudioShoot(product.id, photo.id, template)
      setStudioJob({ jobId: res.data.job_id, photoId: photo.id })
      setStudioStatus('processing')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'FEATURE_UNAVAILABLE') {
        // Plan gate, not a real failure — show the reason inline with an
        // upgrade path instead of a dead-end native Alert (matches the
        // growth-hub FEATURE_UNAVAILABLE pattern).
        setStudioStatus('failed')
        setStudioError(err.message)
        setStudioUpgradeRequired(true)
      } else {
        showError(err, 'Could not start the studio shoot')
        setStudioStatus(null)
      }
    } finally {
      setStudioStarting(false)
    }
  }

  // Poll the studio-shoot job with exponential backoff (2s → 4s → 8s → 16s max).
  useEffect(() => {
    if (!product || !studioJob || studioStatus !== 'processing') return
    const stopPolling = pollWithBackoff({
      initialMs: 2000,
      maxMs: 16_000,
      maxAttempts: 60,
      onPoll: async () => {
        const res = await productApi.getStudioShootStatus(product.id, studioJob.photoId, studioJob.jobId)
        const s = res.data
        if (s.status === 'ready' && s.photo_id && s.url) {
          setStudioStatus('ready')
          setStudioResult({ photoId: s.photo_id, url: s.url })
          setStudioProgress(100)
          setStudioEtaMs(0)
          // New photo row — refresh the product so it appears in the carousel.
          void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
          return true
        } else if (s.status === 'failed') {
          setStudioStatus('failed')
          setStudioError(s.error ?? 'The studio shoot failed. Please try again.')
          return true
        }
        // Update progress/eta from server
        if (s.progress != null) setStudioProgress(s.progress)
        if (s.etaMs != null) setStudioEtaMs(s.etaMs)
        return false
      },
    })
    return stopPolling
  }, [product, studioJob, studioStatus, queryClient])

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
        <AnimatedPressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={24} color={colors.sand[700]} />
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
                !imageErrors.has(photo.url) ? (
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

          {/* Variant badge */}
          {currentPhotoIsVariant && currentPhoto?.variant_color && (
            <View className="absolute top-3 left-3 bg-ink-600/90 px-3 py-1 rounded-full flex-row items-center gap-1">
              <Palette size={12} color="white" />
              <Text className="text-white text-xs font-semibold">{currentPhoto.variant_color}</Text>
            </View>
          )}

          {/* Original (pre-cleanup) badge */}
          {currentPhotoIsOriginal && (
            <View className="absolute top-3 left-3 bg-sand-700/90 px-3 py-1 rounded-full">
              <Text className="text-white text-xs font-semibold">Original</Text>
            </View>
          )}

          {/* Main-image badge — this photo is what the catalog/storefront
              show first (is_primary desc ordering) */}
          {currentPhoto?.is_primary && !currentPhotoIsVariant && !currentPhotoIsOriginal && (
            <View className="absolute top-3 left-3 bg-turmeric-600/90 px-3 py-1 rounded-full flex-row items-center gap-1">
              <Star size={11} color="white" fill="white" />
              <Text className="text-white text-xs font-semibold">Main</Text>
            </View>
          )}

          {/* Detect color from the current photo */}
          <AnimatedPressable
            onPress={() => void handleDetectColor()}
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
                <X size={14} color={colors.sand[600]} />
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

        {/* Thumbnail strip — synced with carousel */}
        {displayPhotos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-3 pb-2 pt-2 bg-white">
            <View className="flex-row gap-2">
              {displayPhotos.map((photo, idx) => {
                const isSelected = idx === selectedPhotoIndex
                const isVariant = photo.is_variant_preview
                const isOriginal = photo.is_original_preview
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
                    {isOriginal && (
                      <View className="absolute bottom-0 left-0 right-0 bg-sand-700/80 py-0.5">
                        <Text className="text-white text-[8px] text-center font-medium">Original</Text>
                      </View>
                    )}
                    {photo.is_primary && !isVariant && !isOriginal && (
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

        {/* Add photo / add color / add 360° — one row, right below the slider */}
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
            onPress={handleGenerateVideo}
            disabled={generateVideo.isPending}
            className="flex-1 items-center justify-center gap-1.5 bg-ink-50 py-3 rounded-xl"
          >
            {generateVideo.isPending ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <Video size={20} color={primaryColor} />
            )}
            <Text className="text-ink-700 text-xs font-semibold">Product Video</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => setStudioModalOpen(true)}
            disabled={
              !currentPhoto || currentPhotoIsVariant || currentPhotoIsOriginal ||
              studioStarting || studioStatus === 'processing'
            }
            className="flex-1 items-center justify-center gap-1.5 bg-ink-50 py-3 rounded-xl"
          >
            {studioStarting || studioStatus === 'processing' ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <Sparkles size={20} color={primaryColor} />
            )}
            <Text className="text-ink-700 text-xs font-semibold">AI Studio</Text>
          </AnimatedPressable>
        </View>

      </View>

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

      {/* F-032: AI Studio Shoot inline status/preview — trigger button lives in
          the top action row now; this block just shows progress/result once
          started. Hidden on variant / original slides — those aren't real
          ProductPhoto rows. */}
      {currentPhoto && !currentPhotoIsVariant && !currentPhotoIsOriginal && studioStatus && (
        <View className="mx-4 mt-2">
          {/* Inline status — spinner while generating, error on failure,
              preview + set-as-main once the new photo is ready. */}
          {studioStatus === 'processing' && (
            <View className="mt-3 bg-white rounded-2xl p-4 border border-sand-100">
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color={primaryColor} />
                <Text className="text-xs text-sand-600 flex-1">
                  {studioProgress > 0
                    ? `Generating... ${studioProgress}%`
                    : 'Creating your studio shot...'}
                </Text>
                {studioEtaMs > 0 && (
                  <Text className="text-[10px] text-sand-400">
                    ~{Math.ceil(studioEtaMs / 1000)}s left
                  </Text>
                )}
              </View>
              {/* Progress bar */}
              {studioProgress > 0 && (
                <View className="mt-2 h-1.5 bg-sand-100 rounded-full overflow-hidden">
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(studioProgress, 100)}%`,
                      backgroundColor: primaryColor,
                    }}
                  />
                </View>
              )}
            </View>
          )}
          {studioStatus === 'failed' && studioUpgradeRequired && (
            <View className="mt-3 bg-ink-900 rounded-2xl p-4">
              <View className="flex-row items-center gap-1.5 mb-1">
                <Sparkles size={13} color={colors.rust[400]} />
                <Text className="text-[10px] font-semibold text-rust-400 uppercase tracking-wide">
                  Plan upgrade needed
                </Text>
              </View>
              <Text className="text-xs text-white/80 leading-4">
                {studioError}
              </Text>
              <View className="mt-3">
                <GradientButton
                  label="View Plans"
                  onPress={() => router.push('/billing')}
                  colors={[colors.rust[500], colors.rust[700]]}
                />
              </View>
            </View>
          )}
          {studioStatus === 'failed' && !studioUpgradeRequired && (
            <View className="mt-3 bg-turmeric-50 border border-turmeric-100 rounded-xl px-3 py-2">
              <Text className="text-xs text-turmeric-700">
                {studioError ?? 'The studio shoot failed. Please try again.'}
              </Text>
            </View>
          )}
          {studioStatus === 'ready' && studioResult && (
            <View className="mt-3 bg-white rounded-2xl p-4 border border-sand-100">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
                Studio shot ready
              </Text>
              <Image
                source={{ uri: studioResult.url }}
                style={{ width: '100%', height: 200 }}
                contentFit="cover"
                className="rounded-xl mb-2"
              />
              <AnimatedPressable
                onPress={() => void handleSetPrimary(studioResult.photoId)}
                disabled={settingPrimaryId !== null}
                className="flex-row items-center justify-center gap-1.5 rounded-xl py-2 border border-dashed border-ink-300"
                accessibilityLabel="Set the studio shot as the main photo"
                accessibilityRole="button"
              >
                {settingPrimaryId === studioResult.photoId ? (
                  <ActivityIndicator size="small" color={primaryColor} />
                ) : (
                  <Star size={14} color={primaryColor} />
                )}
                <Text className="text-ink-700 text-xs font-medium">Set as main photo</Text>
              </AnimatedPressable>
            </View>
          )}
        </View>
      )}

      {/* F-030: Shadow toggle — single on/off, next to the background row
          (same pattern: tap → re-runs cleanup on the currently-viewed photo
          with the new setting baked in). Hidden on variant / original
          slides — those aren't real ProductPhoto rows to recomposite. */}
      {currentPhoto && !currentPhotoIsVariant && !currentPhotoIsOriginal && (
        <View className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-sand-100">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
                Shadow
              </Text>
              <Text className="text-xs text-sand-400 mt-0.5">
                Soft shadow under the product for a grounded, studio-like look
              </Text>
            </View>
            {shadowSaving ? (
              <ActivityIndicator size="small" color={primaryColor} />
            ) : (
              <Switch
                value={shadowFor(currentPhoto.id)}
                onValueChange={(v) => void handleSetShadow(v)}
                disabled={backgroundSaving}
                accessibilityLabel="Toggle photo shadow"
              />
            )}
          </View>
        </View>
      )}

      {/* F-029: Set as main — promotes the currently-viewed photo to the
          product's primary image (the one the catalog + customer storefront
          show first). Shown as filled/checked when it's already the main. */}
      {displayPhotos[selectedPhotoIndex] && !currentPhotoIsVariant && !currentPhotoIsOriginal && (
        <AnimatedPressable
          onPress={() => void handleSetPrimary(displayPhotos[selectedPhotoIndex]!.id)}
          disabled={settingPrimaryId !== null || !!currentPhoto?.is_primary}
          accessibilityLabel={
            currentPhoto?.is_primary ? 'This is the main photo' : 'Set as main photo'
          }
          accessibilityRole="button"
          accessibilityState={{ selected: !!currentPhoto?.is_primary }}
          className={`mx-4 mt-2 flex-row items-center justify-center gap-1.5 rounded-xl py-2 border ${
            currentPhoto?.is_primary
              ? 'border-turmeric-300 bg-turmeric-50'
              : 'border-dashed border-ink-300'
          }`}
        >
          {settingPrimaryId === displayPhotos[selectedPhotoIndex]?.id ? (
            <ActivityIndicator size="small" color={primaryColor} />
          ) : (
            <Star
              size={14}
              color={currentPhoto?.is_primary ? colors.turmeric[600] : primaryColor}
              fill={currentPhoto?.is_primary ? colors.turmeric[600] : 'none'}
            />
          )}
          <Text
            className={`text-xs font-medium ${
              currentPhoto?.is_primary ? 'text-turmeric-700' : 'text-ink-700'
            }`}
          >
            {settingPrimaryId === displayPhotos[selectedPhotoIndex]?.id
              ? 'Setting as main...'
              : currentPhoto?.is_primary
                ? 'Main photo ✓'
                : 'Set as main photo'}
          </Text>
        </AnimatedPressable>
      )}

      {/* Post-save background picker — admin-curated backdrop library. Applies
          to the currently-viewed photo (not the product primary): each chip
          recomposites that photo onto the chosen backdrop. Hidden on variant /
          original slides — those aren't real ProductPhoto rows to recomposite. */}
      {backgroundImages.length > 0 && currentPhoto && !currentPhotoIsVariant && !currentPhotoIsOriginal && (
        <View className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Background
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              <AnimatedPressable
                onPress={() => void handleSetBackground(null)}
                disabled={backgroundSaving}
                className={`w-16 h-16 rounded-xl items-center justify-center border-2 bg-white ${
                  (photoBackgrounds[currentPhoto.id] ?? null) === null
                    ? 'border-ink-600'
                    : 'border-sand-200'
                }`}
              >
                <Text className="text-[10px] text-sand-500">Auto</Text>
              </AnimatedPressable>
              {backgroundImages.map((bg) => (
                <AnimatedPressable
                  key={bg.id}
                  onPress={() => void handleSetBackground(bg.id)}
                  disabled={backgroundSaving}
                  className={`w-16 h-16 rounded-xl overflow-hidden border-2 ${
                    photoBackgrounds[currentPhoto.id] === bg.id
                      ? 'border-ink-600'
                      : 'border-sand-200'
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
        </View>
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
        {/* Price — first, matching the add flow's price-first save; the AI
            detects the tags in the background, so nothing else is required */}
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
            placeholderTextColor={colors.sand[400]}
          />
          <Text className="text-xs text-sand-400 mt-1.5">
            Selling price — AI handles the tags. Edit below only if needed.
          </Text>
        </View>

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
          {/* Re-run AI tagging — fills blank name/subtype/SKU/description
              (hidden while a tagging job is already running) */}
          {(product.ai_tagged || product.ai_tag_error) && (
            <AnimatedPressable
              onPress={() => void handleRetag()}
              disabled={retagging}
              accessibilityLabel="Re-tag this product with AI"
              accessibilityRole="button"
              className="mt-3 flex-row items-center justify-center gap-1.5 bg-ink-50 rounded-xl py-2"
            >
              {retagging ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <Wand2 size={14} color={primaryColor} />
              )}
              <Text className="text-ink-700 text-xs font-semibold">
                {retagging ? 'Re-tagging...' : 'Re-tag with AI'}
              </Text>
            </AnimatedPressable>
          )}
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
              placeholderTextColor={colors.sand[400]}
            />
          </View>
          <View>
            <Text className="text-xs font-medium text-sand-500 mb-1">Subtype</Text>
            <TextInput
              value={editedSubtype}
              onChangeText={dirty(setEditedSubtype)}
              placeholder="e.g. Lehenga Skirt, Kurta Set, Suit with Dupatta"
              className="text-sm text-sand-900 border border-sand-100 rounded-xl px-3 py-2.5"
              placeholderTextColor={colors.sand[400]}
            />
          </View>
          <View>
            <Text className="text-xs font-medium text-sand-500 mb-1">SKU</Text>
            <View className="flex-row items-center gap-2">
              <TextInput
                value={editedSku}
                onChangeText={dirty(setEditedSku)}
                placeholder="e.g. LS0001"
                autoCapitalize="characters"
                className="flex-1 text-sm text-sand-900 border border-sand-100 rounded-xl px-3 py-2.5"
                placeholderTextColor={colors.sand[400]}
              />
              {/* F-025: print a QR/SKU tag for the rack card — scan-to-sell
                  (product/scan.tsx) reads this to jump straight to this
                  product so the retailer can mark it sold at the counter. */}
              {product.sku ? (
                <AnimatedPressable
                  onPress={() => setSkuTagOpen(true)}
                  className="flex-row items-center gap-1.5 bg-ink-50 border border-ink-100 rounded-xl px-3 py-2.5"
                  accessibilityLabel="Show printable SKU tag"
                  accessibilityRole="button"
                >
                  <Tag size={14} color={primaryColor} />
                  <Text className="text-ink-700 text-xs font-semibold">Print Tag</Text>
                </AnimatedPressable>
              ) : null}
            </View>
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
              placeholderTextColor={colors.sand[400]}
            />
          </View>
          <AnimatedPressable
            onPress={() =>
              router.push(
                `/growth/translate?productId=${product.id}&productName=${encodeURIComponent(product.name ?? '')}`,
              )
            }
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-1.5 border border-dashed border-ink-300 rounded-xl py-2 mt-1"
          >
            <Languages size={14} color={primaryColor} />
            <Text className="text-ink-700 text-xs font-medium">AI Translate</Text>
          </AnimatedPressable>
        </View>

        {/* Merchandising category (retailer-curated catalog group — the AI
            auto-assigns it via the tag job; single category selector. */}
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
            placeholderTextColor={colors.sand[400]}
          />
        </View>

        {/* Fabric (dynamic, DB-backed — multi-select) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Fabric
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {fabricOptions.map((fab) => {
              const selected = selectedFabrics.includes(fab.name)
              return (
                <AnimatedPressable
                  key={fab.id}
                  onPress={() =>
                    dirty(setSelectedFabrics)((prev) =>
                      selected ? prev.filter((v) => v !== fab.name) : [...prev, fab.name],
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
                    {fab.name}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        {/* Style (dynamic, DB-backed — multi-select) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Style
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {styleOptions.map((s) => {
              const selected = selectedStyles.includes(s.name)
              return (
                <AnimatedPressable
                  key={s.id}
                  onPress={() =>
                    dirty(setSelectedStyles)((prev) =>
                      selected ? prev.filter((v) => v !== s.name) : [...prev, s.name],
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
                    {s.name}
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


        {/* Location */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <View className="flex-row items-center gap-1.5 mb-2">
            <MapPin size={12} color={colors.sand[600]} />
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
              Store Location
            </Text>
          </View>
          <TextInput
            value={location}
            onChangeText={dirty(setLocation)}
            placeholder="e.g. Rack B · Shelf 3 · Stack 2"
            className="text-sm text-sand-900"
            placeholderTextColor={colors.sand[400]}
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
            placeholderTextColor={colors.sand[400]}
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
            <ActivityIndicator size="small" color={colors.rust[600]} />
          ) : (
            <Trash2 size={16} color={colors.rust[600]} />
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

      {/* Fullscreen image viewer — tap main photo to open, pinch/double-tap to
          zoom, swipe left/right between photos, swipe down or X to close.
          Reuses Gallery (not react-native-image-viewing): that lib probes
          remote image size via RN's core Image.getSizeWithHeaders before it
          will render anything, which was failing for these URLs and left a
          0×0 (blank) image — Gallery's expo-image renderItem has no such
          dependency and already works for the main carousel above. */}
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

      {/* F-025: printable SKU/QR tag modal — white, print/screenshot friendly */}
      <SkuTagModal
        open={skuTagOpen}
        onClose={() => setSkuTagOpen(false)}
        sku={product.sku}
        name={product.name}
      />

      {/* F-032: AI Studio Shoot template picker — 4 curated presets (no free-
          text prompts, per spec §24.6). Tap a template → POST the job → the
          button area above shows the inline progress/result card. */}
      <Modal
        visible={studioModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setStudioModalOpen(false)}
      >
        <View className="flex-1 bg-black/60 justify-end">
          <View
            className="bg-white rounded-t-3xl px-5 pt-5"
            style={{ paddingBottom: Math.max(insets.bottom, 20) }}
          >
            <Text className="text-base font-semibold text-ink-800 mb-1">AI Studio Shoot</Text>
            <Text className="text-xs text-sand-500 mb-4">
              Pick a backdrop — the product stays exactly the same, lighting blends in. Takes under a minute.
            </Text>
            <ScrollView bounces={false} style={{ maxHeight: 380 }}>
              {STUDIO_TEMPLATES.map((t) => (
                <AnimatedPressable
                  key={t.id}
                  onPress={() => void handleStartStudioShoot(t.id)}
                  disabled={studioStarting}
                  accessibilityLabel={`${t.label} — ${t.description}`}
                  accessibilityRole="button"
                  className="mb-3 border border-sand-200 rounded-2xl p-4"
                >
                  <View className="flex-row items-center gap-2">
                    <Sparkles size={14} color={primaryColor} />
                    <Text className="text-sm font-semibold text-ink-800">{t.label}</Text>
                  </View>
                  <Text className="text-xs text-sand-500 mt-1">{t.description}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
            <AnimatedPressable
              onPress={() => setStudioModalOpen(false)}
              disabled={studioStarting}
              accessibilityLabel="Cancel studio shoot"
              accessibilityRole="button"
              className="py-3 items-center"
            >
              <Text className="text-sm font-medium text-sand-500">Cancel</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}
