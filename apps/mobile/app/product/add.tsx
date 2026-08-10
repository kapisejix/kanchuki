import { useState, useRef, useEffect } from 'react'
import { SIZE_OPTIONS } from '@kanchuki/shared'
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
import { X, ImagePlus, ChevronLeft, Check } from 'lucide-react-native'
import {
  productApi,
  categoryApi,
  productAttributeApi,
  uploadImageToR2,
  readLocalImage,
} from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { ProductAddSkeleton } from '../../src/components/Skeleton'
import { GradientButton } from '../../src/components/GradientButton'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

type Step =
  | 'camera'
  | 'scan_review'
  | 'preview'
  | 'edit'
  | 'saving'
type CaptureMode = 'photo' | 'scan'

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

export default function AddProductScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('camera')
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo')
  const [isScanning, setIsScanning] = useState(false)
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
  const [uploadInfo, setUploadInfo] = useState<UploadInfo | null>(null)

  // Editable fields
  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([])
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [selectedFabrics, setSelectedFabrics] = useState<string[]>([])
  const [selectedSizes, setSelectedSizes] = useState<string[]>([])
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [autoCleanup, setAutoCleanup] = useState(true)
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

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories', 'list'],
    queryFn: () => categoryApi.list(),
  })
  const categories = categoriesData?.data ?? []

  // Dynamic, retailer-editable Style/Occasion/Fabric taxonomy (DB-backed,
  // seeded from the admin default template — no hardcoded option lists).
  const { data: occasionsData } = useQuery({
    queryKey: ['attributes', 'OCCASION'],
    queryFn: () => productAttributeApi.list('OCCASION'),
  })
  const occasionOptions = occasionsData?.data ?? []
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

  const handleCapture = async () => {
    if (!cameraRef.current || capturingRef.current || isScanning) return
    capturingRef.current = true
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.85 })
      if (!shot?.uri) return
      await processPhoto(shot.uri)
    } finally {
      capturingRef.current = false
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

    // The photo uploads at save time — no blocking upload screen mid-flow.
    // The retailer just adds a price; AI tagging + cleanup (incl. the
    // auto-contrast backdrop) run in the background after save.
    let primary = uploadInfo
      ? { r2_key: uploadInfo.r2_key, url: uploadInfo.public_url }
      : null
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
        occasions: selectedOccasions,
        styles: selectedStyles,
        fabrics: selectedFabrics,
        search_tags: [],
        sizes: selectedSizes,
        category_id: categoryId ?? undefined,
        location_notes: location || undefined,
        notes: notes || undefined,
        auto_cleanup: autoCleanup,
        background_image_id: backgroundImageId,
      })

      // Scan-mode extras (local URIs) are uploaded after save below.
      // Best-effort: one failing shouldn't undo a product that saved.
      const productId = (created.data as { id: string }).id
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

        {/* Photo / Scan mode toggle */}
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
          </View>
        </View>

        {/* Frame guide — scan mode pans, photo mode frames the garment. */}
        <View className="flex-1 items-center justify-center">
          <View className="w-64 h-96 border-2 border-white/40 rounded-3xl" />
          <Text className="text-white/60 text-sm mt-4 px-8 text-center">
            {captureMode === 'scan'
              ? 'Pan slowly over the product'
              : 'Fit product top to bottom in frame'}
          </Text>
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
              : captureMode === 'scan'
                ? 'Tap to scan · Gallery to import'
                : 'Tap to capture · Gallery to import'}
          </Text>
        </View>

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
          </View>
        )}

        {/* Auto-clean toggle: crop + white-background removal (runs server-side after Save). */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-semibold text-sand-900">Auto-clean photo</Text>
            <Text className="text-xs text-sand-500 mt-0.5">
              Crop to the garment, remove the background, and match a contrasting backdrop (dark garment → light, light garment → dark). Turn off for a styled/mannequin shot you want as-is.
            </Text>
          </View>
          <Switch value={autoCleanup} onValueChange={setAutoCleanup} />
        </View>

        {/* Background picker — F-011, only meaningful once auto-clean is on */}
        {autoCleanup && backgroundImages.length > 0 && (
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

        {/* Occasion tags (dynamic, DB-backed — multi-select) */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
            Occasion
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {occasionOptions.map((occ) => {
              const selected = selectedOccasions.includes(occ.name)
              return (
                <AnimatedPressable
                  key={occ.id}
                  onPress={() =>
                    setSelectedOccasions((prev) =>
                      selected ? prev.filter((o) => o !== occ.name) : [...prev, occ.name],
                    )
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected
                      ? 'bg-ink-600 border-ink-600'
                      : 'bg-white border-sand-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>
                    {occ.name}
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
