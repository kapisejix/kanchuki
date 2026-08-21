import { useState, useRef, useCallback, useEffect } from 'react'
import { PRODUCT_CATEGORIES, SIZE_OPTIONS, COLORS } from '@kanchuki/shared'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Switch,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { File } from 'expo-file-system'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, ImagePlus, ChevronDown, ChevronLeft, Check } from 'lucide-react-native'
import {
  productApi,
  categoryApi,
  productAttributeApi,
  uploadImageToR2,
  readLocalImage,
} from '../../src/lib/api'
import { showError, logError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { ProductAddSkeleton } from '../../src/components/Skeleton'
import { GradientButton } from '../../src/components/GradientButton'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

type Step =
  | 'camera'
  | 'scan_review'
  | 'pro_review'
  | 'pro_options'
  | 'pro_processing'
  | 'preview'
  | 'edit'
  | 'saving'
type CaptureMode = 'photo' | 'scan' | 'pro'

type UploadInfo = {
  upload_url: string
  r2_key: string
  public_url: string
  product_id: string
}

// Scan mode: burst a few stills while the retailer pans over the product,
// keep the sharpest one client-side. No video is ever recorded or uploaded.
const SCAN_BURST_COUNT = 5
const SCAN_BURST_INTERVAL_MS = 200

// Pro mode (professional catalog photos): shoot 1-5 shots, keep ≥3, then the
// server cleans each kept shot (background removal + backdrop, optional SAM2
// hanger/mannequin removal, garment tight-crop) via POST /products/pro-cleanup.
const PRO_SHOT_LIMIT = 5
const PRO_MIN_KEEP = 3

export default function AddProductScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('camera')
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo')
  const [isScanning, setIsScanning] = useState(false)
  // Pro path: guards the Process button (double-tap would run two cleanup
  // batches = double quota + double R2 uploads) and the processing screen
  // (a back-navigation must NOT let the still-in-flight promise yank the
  // user to edit when it resolves). proRunningRef is the SYNCHRONOUS guard
  // (state updates are async — two taps in the same frame both see
  // proProcessing=false, so state alone can't stop a double batch);
  // proRunRef invalidates stale in-flight runs on cancel.
  const [proProcessing, setProProcessing] = useState(false)
  const proRunningRef = useRef(false)
  const proRunRef = useRef(0)
  // Shutter guard: takePictureAsync while the previous capture is still
  // being processed throws a camera-busy error on device — dedupe taps.
  const capturingRef = useRef(false)
  const [permission, requestPermission] = useCameraPermissions()
  const [photo, setPhoto] = useState<string | null>(null)
  // The pristine, never-rotated capture — rotate always recomputes from this,
  // not from the currently-displayed `photo`, so 4 taps back to "360°" isn't
  // a 4x lossy re-encode (see design spec §1a for why this differs from the
  // post-save server-side rotate, which does accept that tradeoff).
  const rawPhotoUriRef = useRef<string | null>(null)
  const [previewRotation, setPreviewRotation] = useState<90 | 180 | 270 | 360 | null>(null)
  // Busy-state guard — mirrors rotatingPhotoId on the product-detail screen
  // and the shutter-guard pattern in this file. Concurrent taps would both
  // recompute from the raw ref and converge, but dropping the second tap is
  // cleaner and keeps Retake from racing an in-flight rotate.
  const [rotatingPreview, setRotatingPreview] = useState(false)
  // Scan mode: retailer picks which burst frame to keep instead of the app
  // silently auto-picking one. scanBestUri marks the file-size-sharpest
  // frame as the pre-highlighted recommendation.
  const [scanFrames, setScanFrames] = useState<string[]>([])
  const [scanBestUri, setScanBestUri] = useState<string | null>(null)
  const [scanSelected, setScanSelected] = useState<string[]>([])
  // Extra frames the retailer multi-selected on the scan review screen —
  // uploaded as additional product photos after the primary photo saves.
  const [extraFrames, setExtraFrames] = useState<string[]>([])
  // Pro mode: raw shots taken (local URIs), the keepers chosen on review,
  // per-photo options, and the server-cleaned results (primary first).
  const [proShots, setProShots] = useState<string[]>([])
  const [proSelected, setProSelected] = useState<string[]>([])
  const [proBestUri, setProBestUri] = useState<string | null>(null)
  const [proRemoveHardware, setProRemoveHardware] = useState(false)
  const [proTightCrop, setProTightCrop] = useState(true)
  const [proUploads, setProUploads] = useState<{ r2_key: string; url: string }[]>([])
  const [proStatus, setProStatus] = useState('')
  // Pro availability probe (GET /products/pro-cleanup/status) — the Pro chip
  // shows as unavailable UP-FRONT when the cleanup sidecar/python is down,
  // instead of letting the retailer shoot 3-5 photos and fail at Process.
  // Fail-open: a probe network error resolves to 'available' so a flaky
  // check can never block a working feature.
  const [proAvailability, setProAvailability] = useState<
    'checking' | 'available' | 'unavailable'
  >('checking')
  const [uploadInfo, setUploadInfo] = useState<UploadInfo | null>(null)

  // Editable fields
  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [selectedFabrics, setSelectedFabrics] = useState<string[]>([])
  const [selectedSizes, setSelectedSizes] = useState<string[]>([])
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [autoCleanup, setAutoCleanup] = useState(true)
  // F-030: composite a soft drop shadow under the garment during cleanup —
  // product-level default, applied by the background tag job after save.
  const [addShadow, setAddShadow] = useState(false)
  const [backgroundImages, setBackgroundImages] = useState<
    { id: string; name: string; image_url: string; thumbnail_url: string | null }[]
  >([])
  const [backgroundImageId, setBackgroundImageId] = useState<string | null>(null)

  useEffect(() => {
    productApi
      .getBackgroundImages()
      .then((res) => setBackgroundImages(res.data))
      .catch(() => {}) // ponytail: best-effort — picker just stays empty (white-only)
  }, [])

  const checkProAvailability = useCallback((refresh = false) => {
    setProAvailability('checking')
    productApi
      .getProCleanupStatus({ refresh })
      .then((res) => {
        const available = res.data?.available === true
        setProAvailability(available ? 'available' : 'unavailable')
        // The probe resolved AFTER the retailer already picked Pro — don't
        // leave them in a pro flow that's about to be declared unavailable.
        if (!available) setCaptureMode((m) => (m === 'pro' ? 'photo' : m))
      })
      .catch(() => setProAvailability('available'))
  }, [])

  useEffect(() => {
    checkProAvailability()
  }, [checkProAvailability])

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
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

  const cameraRef = useRef<CameraView>(null)

  // ── Camera capture ──────────────────────────────────────────────

  const processPhoto = async (uri: string) => {
    try {
      // Compress to target < 500KB
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      )
      // This is the single-photo flow — a stale pro-path result must not
      // leak into the save (handleSave prefers proUploads[0] when set).
      setProUploads([])
      rawPhotoUriRef.current = compressed.uri
      setPreviewRotation(null)
      setPhoto(compressed.uri)
      setStep('preview')
    } catch (err) {
      showError(err, 'Could not process that photo. Try again.', 'Photo Error')
    }
  }

  // Pre-save rotate (preview step): each tap recomputes fresh from the
  // untouched capture, never compounds lossy re-encodes on top of each other.
  // The fourth tap (360°) restores the original pixels with no re-encode.
  const handleRotatePreviewPhoto = async () => {
    if (!rawPhotoUriRef.current || rotatingPreview) return
    setRotatingPreview(true)
    const next =
      previewRotation === null
        ? 90
        : previewRotation === 360
          ? 90
          : ((previewRotation + 90) as 90 | 180 | 270 | 360)
    try {
      if (next === 360) {
        // Full circle — same pixels as the untouched capture, no re-encode needed.
        setPhoto(rawPhotoUriRef.current)
      } else {
        const rotated = await ImageManipulator.manipulateAsync(
          rawPhotoUriRef.current,
          [{ rotate: next }],
          { format: ImageManipulator.SaveFormat.JPEG },
        )
        setPhoto(rotated.uri)
      }
      setPreviewRotation(next)
    } catch (err) {
      showError(err, 'Could not rotate photo', 'Photo Error')
    } finally {
      setRotatingPreview(false)
    }
  }

  const addProShot = async (uri: string) => {
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      )
      setProShots((prev) => (prev.length >= PRO_SHOT_LIMIT ? prev : [...prev, compressed.uri]))
    } catch (err) {
      showError(err, 'Could not process that photo. Try again.', 'Photo Error')
    }
  }

  const handleCapture = async () => {
    if (!cameraRef.current || capturingRef.current || isScanning) return
    capturingRef.current = true
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.85 })
      if (!shot?.uri) return
      if (captureMode === 'pro') {
        await addProShot(shot.uri)
      } else {
        await processPhoto(shot.uri)
      }
    } finally {
      capturingRef.current = false
    }
  }

  // Pro mode: upload each kept raw shot to R2, then run the server-side
  // professional pipeline (remove BG + backdrop, optional SAM2 hardware
  // removal + tight-crop). The sharpest cleaned photo is auto-flagged primary
  // by the server (Laplacian variance) — no extra AI cost.
  const handleProProcess = async () => {
    if (proRunningRef.current || proProcessing || proSelected.length < PRO_MIN_KEEP) return
    proRunningRef.current = true
    const runId = ++proRunRef.current
    setProProcessing(true)
    setStep('pro_processing')
    setProStatus('Uploading photos…')
    try {
      const uploads: { r2_key: string; url: string }[] = []
      for (const [i, uri] of proSelected.entries()) {
        setProStatus(`Uploading photo ${i + 1}/${proSelected.length}…`)
        const blob = await readLocalImage(uri)
        const up = await productApi.getUploadUrl('product.jpg', 'image/jpeg', blob.size)
        // compress: false — the pro pipeline (SAM2/rembg segmentation) needs
        // the raw at full quality; the server compresses the OUTPUT to ≤80KB.
        // Client-side ≤80KB here would degrade segmentation of the raw.
        await uploadImageToR2(uri, up.data.upload_url, 'image/jpeg', 30_000, undefined, {
          compress: false,
        })
        uploads.push({ r2_key: up.data.r2_key, url: up.data.public_url })
      }

      setProStatus('Creating professional photos… (about a minute per photo)')
      const res = await productApi.proCleanup({
        photos: uploads,
        remove_hardware: proRemoveHardware,
        tight_crop: proTightCrop,
        background_image_id: backgroundImageId,
      })
      // User navigated back while this was in flight — the run is cancelled,
      // drop the result instead of yanking them to the edit screen.
      if (runId !== proRunRef.current) return
      const cleaned = res.data.photos.filter((p) => !p.error)
      if (cleaned.length === 0) throw new Error('No photos could be processed')
      // Primary first (server already flagged it) — edit form + save use this
      // order: index 0 = primary, the rest = extra catalog photos.
      const ordered = [
        ...cleaned.filter((p) => p.is_primary),
        ...cleaned.filter((p) => !p.is_primary),
      ]
      const primaryClean = ordered[0]
      if (!primaryClean) throw new Error('No photos could be processed')
      setProUploads(ordered.map((p) => ({ r2_key: p.r2_key, url: p.url })))
      setPhoto(primaryClean.url)
      setAutoCleanup(false) // photos are already professionally cleaned
      setExtraFrames([])
      setStep('edit')
    } catch (err) {
      // A cancelled run surfaces its own navigation in cancelPro — don't
      // double-show the error dialog over the options screen.
      if (runId !== proRunRef.current) return
      logError(err)
      setProStatus('')
      setStep('pro_options')
      // 503 SERVICE_UNAVAILABLE from the pro-cleanup route = the cleanup
      // environment (sidecar/python) is down, NOT the photos — guide the
      // retailer to Photo mode instead of a generic failure.
      const apiErr = err as { code?: string; status?: number }
      const serviceDown = apiErr.code === 'SERVICE_UNAVAILABLE' || apiErr.status === 503
      showError(
        err,
        serviceDown
          ? 'Pro photos are unavailable right now — try again later, or use Photo mode instead.'
          : 'Photo processing failed — please try again.',
        serviceDown ? 'Pro Mode Unavailable' : 'Processing Error',
      )
    } finally {
      proRunningRef.current = false
      if (runId === proRunRef.current) setProProcessing(false)
    }
  }

  const handleScanCapture = async () => {
    if (!cameraRef.current || isScanning) return
    setIsScanning(true)
    try {
      const frames: string[] = []
      for (let i = 0; i < SCAN_BURST_COUNT; i++) {
        const shot = await cameraRef.current.takePictureAsync({ quality: 0.85 })
        if (shot?.uri) frames.push(shot.uri)
        if (i < SCAN_BURST_COUNT - 1) {
          await new Promise((r) => setTimeout(r, SCAN_BURST_INTERVAL_MS))
        }
      }
      if (frames.length === 0) throw new Error('Scan failed — no frames captured')

      // ponytail: file size as a sharpness proxy — a sharper frame carries more
      // high-frequency detail and compresses larger at the same JPEG quality.
      // Cheap, no native image analysis. Upgrade to on-device Laplacian
      // variance scoring if bad-frame picks show up in practice. This only
      // picks the pre-highlighted recommendation — the retailer still
      // chooses which frame to keep on the review screen below.
      const sized = frames.map((uri) => ({ uri, size: new File(uri).size }))
      const best = sized.reduce((a, b) => (b.size > a.size ? b : a))
      setScanFrames(frames)
      setScanBestUri(best.uri)
      setScanSelected([best.uri])
      setStep('scan_review')
    } catch (err) {
      showError(err, 'Could not scan product. Try again.', 'Scan Error')
    } finally {
      setIsScanning(false)
    }
  }

  const handlePickFromGallery = async () => {
    if (captureMode === 'pro') {
      const remaining = PRO_SHOT_LIMIT - proShots.length
      if (remaining <= 0) return
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      })
      if (result.canceled) return
      for (const asset of result.assets.slice(0, remaining)) {
        await addProShot(asset.uri)
      }
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return
    await processPhoto(result.assets[0].uri)
  }

  // ── Upload photo, return its UploadInfo ──────────────────────────

  const uploadPhoto = async (
    uri: string,
    onProgress?: (pct: number, msg: string) => void,
  ): Promise<UploadInfo> => {
    onProgress?.(20, 'Reading photo...')
    const blob = await readLocalImage(uri)
    onProgress?.(35, 'Getting upload link...')
    const uploadResult = await productApi.getUploadUrl('product.jpg', 'image/jpeg', blob.size)
    const info = uploadResult.data
    onProgress?.(55, 'Uploading to cloud...')
    await uploadImageToR2(uri, info.upload_url, 'image/jpeg')
    return info
  }

  // ── Save product ────────────────────────────────────────────────

  const handleSave = async () => {
    setStep('saving')

    // Photo/scan path: the photo uploads at save time — no blocking upload
    // screen mid-flow. The retailer just adds a price; AI tagging + cleanup
    // (incl. the auto-contrast backdrop) run in the background after save.
    // Pro path: proUploads[0] is already cleaned + on R2.
    let primary =
      proUploads[0] ??
      (uploadInfo ? { r2_key: uploadInfo.r2_key, url: uploadInfo.public_url } : null)
    if (!primary && photo) {
      try {
        const info = await uploadPhoto(photo)
        setUploadInfo(info)
        primary = { r2_key: info.r2_key, url: info.public_url }
      } catch (err) {
        setStep('edit')
        showError(err, 'Failed to upload photo. Please try again.')
        return
      }
    }
    if (!primary) return

    const priceInPaise = price ? Math.round(parseFloat(price) * 100) : undefined

    try {
      const created = await productApi.create({
        photo_r2_key: primary.r2_key,
        photo_url: primary.url,
        price_min: priceInPaise,
        price_max: priceInPaise,
        styles: selectedStyles,
        fabrics: selectedFabrics,
        search_tags: [],
        sizes: selectedSizes,
        category_id: categoryId ?? undefined,
        location_notes: location || undefined,
        notes: notes || undefined,
        auto_cleanup: autoCleanup,
        background_image_id: backgroundImageId,
        add_shadow: addShadow,
      })

      // Pro-path extras are already cleaned + on R2 — attach directly.
      // Scan-mode extras (local URIs) are uploaded after save below.
      // Both best-effort: one failing shouldn't undo a product that saved.
      const productId = (created.data as { id: string }).id
      for (const extra of proUploads.slice(1)) {
        try {
          await productApi.addPhoto(productId, {
            r2_key: extra.r2_key,
            url: extra.url,
            content_type: 'image/jpeg',
          })
        } catch (err) {
          console.warn('Pro photo attach failed', err)
        }
      }
      for (const uri of extraFrames) {
        try {
          const info = await uploadPhoto(uri)
          await productApi.addPhoto(productId, {
            r2_key: info.r2_key,
            url: info.public_url,
            content_type: 'image/jpeg',
          })
        } catch (err) {
          console.warn('Extra scan frame upload failed', err)
        }
      }

      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['retailer', 'stats'] })

      Alert.alert(
        'Product Added!',
        'AI is tagging your product in the background. Want to add a 360° spin view now?',
        [
          { text: 'Skip', style: 'cancel', onPress: () => router.back() },
          {
            text: 'Add Spin View',
            onPress: () => router.replace(`/product/${productId}/spin-video`),
          },
        ],
      )
    } catch (err) {
      setStep('edit')
      showError(err, 'Failed to save product')
    }
  }

  // ── Camera permission ───────────────────────────────────────────

  if (!permission) return <View className="flex-1 bg-black" />

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <Text className="text-white text-center text-base mb-6">
          Camera access needed to photograph products
        </Text>
        <AnimatedPressable
          onPress={() => void requestPermission()}
          className="bg-ink-600 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Allow Camera</Text>
        </AnimatedPressable>
      </View>
    )
  }

  // ── Camera step ────────────────────────────────────────────────

  if (step === 'camera') {
    return (
      <View className="flex-1 bg-black">
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        <AnimatedPressable
          onPress={() => router.back()}
          className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center"
          style={{ top: insets.top + 8 }}
          accessibilityLabel="Close camera"
          accessibilityRole="button"
        >
          <X size={20} color="white" />
        </AnimatedPressable>

        {/* Photo / Scan / Pro mode toggle */}
        <View className="absolute left-0 right-0 items-center" style={{ top: insets.top + 8 }}>
          <View className="flex-row items-center justify-center gap-2">
            <AnimatedPressable
              onPress={() => setCaptureMode('photo')}
              className={`px-4 py-1.5 rounded-full ${captureMode === 'photo' ? 'bg-ink-600' : 'bg-black/50'}`}
            >
              <Text className="text-white text-xs font-semibold">Photo</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => setCaptureMode('scan')}
              className={`px-4 py-1.5 rounded-full ${captureMode === 'scan' ? 'bg-ink-600' : 'bg-black/50'}`}
            >
              <Text className="text-white text-xs font-semibold">Scan</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => {
                // Probe runs at screen open — while the cleanup sidecar is
                // down the chip is disabled up-front (no wasted photo shoot).
                // Tapping a disabled chip re-checks: the sidecar may have
                // come back up since the screen opened.
                if (proAvailability === 'unavailable') {
                  checkProAvailability(true)
                  return
                }
                setCaptureMode('pro')
              }}
              className={`px-4 py-1.5 rounded-full ${
                captureMode === 'pro' && proAvailability !== 'unavailable'
                  ? 'bg-ink-600'
                  : proAvailability === 'unavailable'
                    ? 'bg-black/30'
                    : 'bg-black/50'
              }`}
            >
              <Text
                className={`text-white text-xs font-semibold ${
                  proAvailability === 'unavailable' ? 'opacity-50' : ''
                }`}
              >
                {proAvailability === 'checking' ? 'Pro…' : 'Pro'}
              </Text>
            </AnimatedPressable>
          </View>
          {proAvailability === 'unavailable' && (
            <Text className="text-white/70 text-[11px] mt-2 px-8 text-center">
              Pro photos are unavailable right now — tap Pro to re-check, or use Photo mode.
            </Text>
          )}
        </View>

        {/* Frame guide — pro mode nudges straight-on, garment-filled framing
            (the cheapest lever in the whole pipeline: a better raw photo needs
            less AI cleanup). */}
        <View className="flex-1 items-center justify-center">
          <View className="w-64 h-96 border-2 border-white/40 rounded-3xl" />
          <Text className="text-white/60 text-sm mt-4 px-8 text-center">
            {captureMode === 'scan'
              ? 'Pan slowly over the product'
              : captureMode === 'pro'
                ? 'Shoot straight-on · garment fills the frame · hook slightly out of silhouette'
                : 'Fit product top to bottom in frame'}
          </Text>
          {captureMode === 'pro' && (
            <Text className="text-white/40 text-xs mt-2 px-8 text-center">
              Take at least {PRO_MIN_KEEP} shots — front, back, detail ({proShots.length}/{PRO_SHOT_LIMIT})
            </Text>
          )}
        </View>

        {/* Controls */}
        <View className="items-center gap-6" style={{ paddingBottom: 48 + insets.bottom }}>
          <View className="flex-row items-center gap-10">
            <AnimatedPressable
              onPress={() => void handlePickFromGallery()}
            disabled={isScanning}
            className="w-14 h-14 bg-white/20 rounded-2xl items-center justify-center"
          >
            <ImagePlus size={24} color="white" />
          </AnimatedPressable>

            {/* Shutter */}
            <AnimatedPressable
              onPress={() => void (captureMode === 'scan' ? handleScanCapture() : handleCapture())}
              disabled={isScanning || capturingRef.current}
              className="w-20 h-20 rounded-full border-4 border-white items-center justify-center"
            >
              {isScanning ? (
                <ActivityIndicator color="white" />
              ) : (
                <View className="w-14 h-14 bg-white rounded-full" />
              )}
            </AnimatedPressable>

            <View className="w-14" />
          </View>
          <Text className="text-white/50 text-xs">
            {isScanning
              ? 'Scanning...'
              : captureMode === 'pro'
                ? 'Tap shutter for each angle · Gallery to import'
                : captureMode === 'scan'
                  ? 'Tap to scan · Gallery to import'
                  : 'Tap to capture · Gallery to import'}
          </Text>
        </View>

        {/* Pro mode: captured shots strip + Continue (enabled at ≥3) */}
        {captureMode === 'pro' && proShots.length > 0 && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="absolute left-0 right-0"
              style={{ bottom: 190 + insets.bottom }}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
            >
              {proShots.map((uri, idx) => (
                <View key={uri} className="w-14 h-14 rounded-lg overflow-hidden border-2 border-white/70">
                  <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  <Text className="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] px-1 rounded-tl">
                    {idx + 1}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <View className="absolute left-4 right-4" style={{ bottom: 120 + insets.bottom }}>
              <AnimatedPressable
                onPress={() => {
                  if (proShots.length < PRO_MIN_KEEP) return
                  // Pre-select all shots; the review screen lets the retailer
                  // drop any to reach the 3 minimum.
                  setProSelected(proShots)
                  const best = proShots.reduce((a, b) => (new File(b).size > new File(a).size ? b : a))
                  setProBestUri(best)
                  setStep('pro_review')
                }}
                disabled={proShots.length < PRO_MIN_KEEP}
                className={`py-3.5 rounded-2xl items-center ${proShots.length >= PRO_MIN_KEEP ? 'bg-ink-600' : 'bg-white/10'}`}
              >
                <Text className="text-white font-semibold">
                  {proShots.length < PRO_MIN_KEEP
                    ? `Take ${PRO_MIN_KEEP - proShots.length} more to continue`
                    : `Continue with ${proShots.length} shots →`}
                </Text>
              </AnimatedPressable>
            </View>
          </>
        )}
      </View>
    )
  }

  // ── Scan review step — pick which burst frames to keep ───────────

  if (step === 'scan_review') {
    const toggleFrame = (uri: string) => {
      setScanSelected((prev) =>
        prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri],
      )
    }

    const confirmSelection = () => {
      if (scanSelected.length === 0) return
      // Recommended frame leads if selected, else keep capture order.
      const ordered = scanBestUri && scanSelected.includes(scanBestUri)
        ? [scanBestUri, ...scanSelected.filter((u) => u !== scanBestUri)]
        : scanSelected
      const [primary, ...rest] = ordered
      setExtraFrames(rest)
      void processPhoto(primary)
    }

    return (
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top + 16 }}>
        <AnimatedPressable
          onPress={() => {
            setScanFrames([])
            setScanBestUri(null)
            setScanSelected([])
            setStep('camera')
          }}
          className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center z-10"
          style={{ top: insets.top + 8 }}
          accessibilityLabel="Discard and retake"
          accessibilityRole="button"
        >
          <X size={20} color="white" />
        </AnimatedPressable>

        <Text className="text-white text-center font-semibold mt-2">Pick shots to keep</Text>
        <Text className="text-white/50 text-xs text-center mt-1 mb-4 px-8">
          Recommended frame is pre-selected — tap thumbnails to add or remove, only selected shots are saved
        </Text>

        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View className="flex-row flex-wrap justify-center gap-3 px-4">
            {scanFrames.map((uri, idx) => {
              const isBest = uri === scanBestUri
              const isSelected = scanSelected.includes(uri)
              return (
                <AnimatedPressable
                  key={idx}
                  onPress={() => toggleFrame(uri)}
                  className={`w-28 h-40 rounded-xl overflow-hidden border-2 ${isSelected ? 'border-ink-400' : 'border-white/20'}`}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: '100%', height: '100%', opacity: isSelected ? 1 : 0.5 }}
                    contentFit="cover"
                  />
                  {isBest && (
                    <View className="absolute top-1.5 left-1.5 bg-ink-500 px-2 py-0.5 rounded-full">
                      <Text className="text-white text-[9px] font-bold">Best</Text>
                    </View>
                  )}
                  <View
                    className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full items-center justify-center border-2 ${isSelected ? 'bg-ink-500 border-ink-500' : 'bg-black/40 border-white/60'}`}
                  >
                    {isSelected && <Check size={14} color="white" />}
                  </View>
                </AnimatedPressable>
              )
            })}
          </View>
        </ScrollView>

        <View className="px-6" style={{ paddingBottom: 24 + insets.bottom }}>
          <AnimatedPressable
            onPress={confirmSelection}
            disabled={scanSelected.length === 0}
            className={`py-4 rounded-2xl items-center ${scanSelected.length === 0 ? 'bg-white/10' : 'bg-ink-600'}`}
          >
            <Text className="text-white font-semibold">
              {scanSelected.length <= 1
                ? 'Continue →'
                : `Continue with ${scanSelected.length} photos →`}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    )
  }

  // ── Pro review step — keep ≥3 of the captured shots ────────────

  if (step === 'pro_review') {
    const togglePro = (uri: string) => {
      setProSelected((prev) =>
        prev.includes(uri) ? prev.filter((u) => u !== uri) : [...prev, uri],
      )
    }
    const confirmPro = () => {
      if (proSelected.length < PRO_MIN_KEEP) return
      setStep('pro_options')
    }

    return (
      <View className="flex-1 bg-black" style={{ paddingTop: insets.top + 16 }}>
        <AnimatedPressable
          onPress={() => {
            setProSelected([])
            setProBestUri(null)
            setStep('camera')
          }}
          className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center z-10"
          style={{ top: insets.top + 8 }}
          accessibilityLabel="Discard and retake"
          accessibilityRole="button"
        >
          <X size={20} color="white" />
        </AnimatedPressable>

        <Text className="text-white text-center font-semibold mt-2">Keep at least {PRO_MIN_KEEP} shots</Text>
        <Text className="text-white/50 text-xs text-center mt-1 mb-4 px-8">
          Front, back and a detail close-up make the best catalog — tap to remove, keep {Math.max(0, PRO_MIN_KEEP - proSelected.length) === 0 ? 'all good' : `${PRO_MIN_KEEP - proSelected.length} more`}
        </Text>

        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
          <View className="flex-row flex-wrap justify-center gap-3 px-4">
            {proShots.map((uri, idx) => {
              const isBest = uri === proBestUri
              const isSelected = proSelected.includes(uri)
              return (
                <AnimatedPressable
                  key={uri}
                  onPress={() => togglePro(uri)}
                  className={`w-28 h-40 rounded-xl overflow-hidden border-2 ${isSelected ? 'border-ink-400' : 'border-white/20'}`}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: '100%', height: '100%', opacity: isSelected ? 1 : 0.5 }}
                    contentFit="cover"
                  />
                  {isBest && (
                    <View className="absolute top-1.5 left-1.5 bg-ink-500 px-2 py-0.5 rounded-full">
                      <Text className="text-white text-[9px] font-bold">Best</Text>
                    </View>
                  )}
                  <View
                    className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full items-center justify-center border-2 ${isSelected ? 'bg-ink-500 border-ink-500' : 'bg-black/40 border-white/60'}`}
                  >
                    {isSelected && <Check size={14} color="white" />}
                  </View>
                  <Text className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1 rounded">
                    {idx + 1}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </ScrollView>

        <View className="px-6" style={{ paddingBottom: 24 + insets.bottom }}>
          <AnimatedPressable
            onPress={confirmPro}
            disabled={proSelected.length < PRO_MIN_KEEP}
            className={`py-4 rounded-2xl items-center ${proSelected.length >= PRO_MIN_KEEP ? 'bg-ink-600' : 'bg-white/10'}`}
          >
            <Text className="text-white font-semibold">
              {proSelected.length < PRO_MIN_KEEP
                ? `Keep ${PRO_MIN_KEEP} photos to continue (${proSelected.length} selected)`
                : `Clean ${proSelected.length} photos →`}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    )
  }

  // ── Pro options step — backdrop + AI cleanup toggles ────────────

  if (step === 'pro_options') {
    return (
      <View className="flex-1 bg-ink-50">
        <View
          className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100"
          style={{ paddingTop: insets.top + 12 }}
        >
          <AnimatedPressable
            onPress={() => setStep('pro_review')}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900">Photo Settings</Text>
          <GradientButton
            label={proProcessing ? 'Processing…' : 'Process'}
            onPress={() => void handleProProcess()}
            loading={proProcessing}
          />
        </View>

        <ScrollView className="flex-1">
          <View className="px-4 py-4 gap-4">
            {/* Backdrop picker (F-011 library, White default) */}
            <View className="bg-white rounded-2xl p-4 border border-sand-100">
              <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
                Background
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  <AnimatedPressable
                    onPress={() => setBackgroundImageId(null)}
                    className={`w-16 h-16 rounded-xl items-center justify-center border-2 bg-white ${backgroundImageId === null ? 'border-ink-600' : 'border-sand-200'}`}
                  >
                    <Text className="text-[10px] text-sand-500">Auto</Text>
                  </AnimatedPressable>
                  {backgroundImages.map((bg) => (
                    <AnimatedPressable
                      key={bg.id}
                      onPress={() => setBackgroundImageId(bg.id)}
                      className={`w-16 h-16 rounded-xl overflow-hidden border-2 ${backgroundImageId === bg.id ? 'border-ink-600' : 'border-sand-200'}`}
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

            {/* AI hanger/mannequin removal */}
            <View className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-sand-900">Remove hanger / mannequin</Text>
                <Text className="text-xs text-sand-500 mt-0.5">
                  AI removes the stand, hook or hanger where it touches the garment — best for shots taken on a hanger or mannequin bust.
                </Text>
              </View>
              <Switch value={proRemoveHardware} onValueChange={setProRemoveHardware} />
            </View>

            {/* Tight-crop to garment */}
            <View className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-sand-900">Crop to garment</Text>
                <Text className="text-xs text-sand-500 mt-0.5">
                  Frames the garment edge-to-edge and drops dead space / watermarks from the final catalog shot.
                </Text>
              </View>
              <Switch value={proTightCrop} onValueChange={setProTightCrop} />
            </View>

            <Text className="text-xs text-center text-sand-400 px-4">
              {proSelected.length} photo{proSelected.length === 1 ? '' : 's'} will be cleaned — the sharpest becomes the main photo.
            </Text>
          </View>
        </ScrollView>
      </View>
    )
  }

  // ── Pro processing step ─────────────────────────────────────────

  if (step === 'pro_processing') {
    const cancelPro = () => {
      // Invalidate the in-flight run (its result will be dropped) and return
      // to options. Raw photos already uploaded are harmless orphans — the
      // cleaned copies are never written, so no quota is burned server-side
      // beyond what already ran.
      proRunRef.current += 1
      setProProcessing(false)
      setProStatus('')
      setStep('pro_options')
    }

    return (
      <View className="flex-1 bg-ink-50 items-center justify-center px-8" style={{ paddingTop: insets.top + 24 }}>
        <AnimatedPressable
          onPress={cancelPro}
          className="absolute left-4 w-10 h-10 bg-white rounded-full border border-sand-200 items-center justify-center"
          style={{ top: insets.top + 8 }}
          accessibilityLabel="Cancel photo processing"
          accessibilityRole="button"
          hitSlop={8}
        >
          <X size={20} color={colors.sand[700]} />
        </AnimatedPressable>
        <ActivityIndicator size="large" color={colors.ink[600]} />
        <Text className="text-sand-900 text-base font-semibold mt-6 text-center">
          Creating professional photos
        </Text>
        <Text className="text-sand-500 text-sm mt-2 text-center">{proStatus}</Text>
        <Text className="text-sand-400 text-xs mt-4 text-center px-6">
          Keep this screen open — AI background removal{proRemoveHardware ? ', hanger removal' : ''} takes about a minute per photo.
        </Text>
      </View>
    )
  }

  // ── Preview step ───────────────────────────────────────────────

  if (step === 'preview') {
    return (
      <View className="flex-1 bg-black">
        {photo && (
          <Image
            source={{ uri: photo }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
          />
        )}
        <View className="absolute bottom-12 left-0 right-0 flex-row gap-3 px-6">
          <AnimatedPressable
            onPress={() => {
              setPhoto(null)
              setExtraFrames([])
              setProUploads([])
              setStep('camera')
            }}
            disabled={rotatingPreview}
            className="flex-1 bg-white/20 py-4 rounded-2xl items-center"
          >
            <Text className="text-white font-semibold">Retake</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => void handleRotatePreviewPhoto()}
            disabled={rotatingPreview}
            className="flex-1 bg-white/20 py-4 rounded-2xl items-center"
            accessibilityLabel="Rotate photo 90 degrees"
            accessibilityRole="button"
          >
            {rotatingPreview ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold">
                {previewRotation ? `Rotate (${previewRotation}°)` : 'Rotate'}
              </Text>
            )}
          </AnimatedPressable>
          <View className="flex-1">
            <GradientButton label='Use Photo →' onPress={() => setStep('edit')} />
          </View>
        </View>
      </View>
    )
  }

  // ── Edit / Confirm step ───────────────────────────────────────────

  if (step === 'edit' && categoriesLoading) {
    return <ProductAddSkeleton />
  }

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header — fixed outside the scroll area so back/save stay reachable */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <AnimatedPressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
          <ChevronLeft size={24} color={colors.sand[700]} />
        </AnimatedPressable>
        <Text className="text-base font-bold text-sand-900">Product Details</Text>
        <GradientButton
          label="Save"
          onPress={() => void handleSave()}
          loading={step === 'saving'}
        />
      </View>

      <ScrollView className="flex-1">
      <View className="px-4 py-4 gap-4">
        {/* Photo preview */}
        {photo && (
          <View className="h-56 rounded-2xl overflow-hidden bg-sand-100">
            <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            {/* Pro-cleaned photos are already finished — no client-side
                tagging is pending for them (server tags after save), so the
                "AI tagging..." overlay would be a lying spinner here. */}
          </View>
        )}

        {/* Auto-clean toggle: crop + white-background removal (runs server-side after Save).
            Hidden on the pro path — photos were already professionally cleaned. */}
        {proUploads.length === 0 && (
          <View className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-sand-900">Auto-clean photo</Text>
              <Text className="text-xs text-sand-500 mt-0.5">
                Crop to the garment, remove the background, and match a contrasting backdrop (dark garment → light, light garment → dark). Turn off for a styled/mannequin shot you want as-is.
              </Text>
            </View>
            <Switch value={autoCleanup} onValueChange={setAutoCleanup} />
          </View>
        )}

        {/* Shadow toggle — F-030, only meaningful once auto-clean is on */}
        {autoCleanup && (
          <View className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-semibold text-sand-900">Shadow</Text>
              <Text className="text-xs text-sand-500 mt-0.5">
                Add a soft shadow under the product for a grounded, studio-like look.
              </Text>
            </View>
            <Switch value={addShadow} onValueChange={setAddShadow} />
          </View>
        )}

        {/* Background picker — F-011, only meaningful once auto-clean is on */}
        {proUploads.length === 0 && autoCleanup && backgroundImages.length > 0 && (
          <View className="bg-white rounded-2xl p-4 border border-sand-100">
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
              Background
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                <AnimatedPressable
                  onPress={() => setBackgroundImageId(null)}
                  className={`w-16 h-16 rounded-xl items-center justify-center border-2 bg-white ${
                    backgroundImageId === null ? 'border-ink-600' : 'border-sand-200'
                  }`}
                >
                  <Text className="text-[10px] text-sand-500">Auto</Text>
                </AnimatedPressable>
                {backgroundImages.map((bg) => (
                  <AnimatedPressable
                    key={bg.id}
                    onPress={() => setBackgroundImageId(bg.id)}
                    className={`w-16 h-16 rounded-xl overflow-hidden border-2 ${
                      backgroundImageId === bg.id ? 'border-ink-600' : 'border-sand-200'
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

        {/* Price */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
            Price (₹)
          </Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="e.g. 1500"
            keyboardType="numeric"
            className="text-lg font-bold text-sand-900"
            placeholderTextColor={colors.sand[400]}
          />
        </View>

        {/* Store location */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
            Store Location
          </Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Rack B · Shelf 3 · Stack 2"
            className="text-sm text-sand-900"
            placeholderTextColor={colors.sand[400]}
          />
        </View>

        {/* Category (retailer-curated merchandising group, optional) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
              Category
            </Text>
            <AnimatedPressable onPress={() => router.push('/category/new')}>
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
                const selected = categoryId === cat.id
                return (
                  <AnimatedPressable
                    key={cat.id}
                    onPress={() => setCategoryId(selected ? null : cat.id)}
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
                    setSelectedSizes((prev) =>
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

        {/* Style tags (dynamic, DB-backed — multi-select) */}
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
                    setSelectedStyles((prev) =>
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

        {/* Fabric tags (dynamic, DB-backed — multi-select) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Fabric
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {fabricOptions.map((f) => {
              const selected = selectedFabrics.includes(f.name)
              return (
                <AnimatedPressable
                  key={f.id}
                  onPress={() =>
                    setSelectedFabrics((prev) =>
                      selected ? prev.filter((v) => v !== f.name) : [...prev, f.name],
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
                    {f.name}
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
            onChangeText={setNotes}
            placeholder="Any additional notes for your staff..."
            multiline
            numberOfLines={2}
            className="text-sm text-sand-900"
            placeholderTextColor={colors.sand[400]}
          />
        </View>

        <Text className="text-xs text-center text-sand-400 px-4">
          AI will auto-fill category, color, fabric and pick the best background after you save
        </Text>
      </View>

      <View className="h-12" />
      </ScrollView>
    </View>
  )
}
