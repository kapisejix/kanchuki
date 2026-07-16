import { useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  StyleSheet,
  Switch,
} from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { File } from 'expo-file-system'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, ImagePlus, ChevronDown, ChevronLeft, Check } from 'lucide-react-native'
import { productApi, uploadImageToR2, readLocalImage } from '../../src/lib/api'
import { OCCASION_TYPES, PRODUCT_CATEGORIES } from '@kanchuki/shared'

type Step = 'camera' | 'scan_review' | 'preview' | 'ai_tagging' | 'edit' | 'saving'
type CaptureMode = 'photo' | 'scan'

type AiTags = {
  category: string | null
  primary_color: string | null
  fabric_estimate: string | null
  occasions: string[]
  search_tags: string[]
}

type UploadInfo = {
  upload_url: string
  r2_key: string
  public_url: string
  product_id: string
}

type UploadStage = 'preparing' | 'linking' | 'uploading' | 'finalizing'

type UploadProgress = {
  stage: UploadStage
  percent: number
  message: string
}

const UPLOAD_STEPS: { stage: UploadStage; label: string; icon: string }[] = [
  { stage: 'preparing', label: 'Prepare', icon: '📷' },
  { stage: 'linking', label: 'Link', icon: '🔗' },
  { stage: 'uploading', label: 'Upload', icon: '☁️' },
  { stage: 'finalizing', label: 'Done', icon: '✅' },
]

// Scan mode: burst a few stills while the retailer pans over the product,
// keep the sharpest one client-side. No video is ever recorded or uploaded.
const SCAN_BURST_COUNT = 5
const SCAN_BURST_INTERVAL_MS = 200

export default function AddProductScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('camera')
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo')
  const [isScanning, setIsScanning] = useState(false)
  const [permission, requestPermission] = useCameraPermissions()
  const [photo, setPhoto] = useState<string | null>(null)
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
  const [aiTags, setAiTags] = useState<AiTags | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    stage: 'preparing',
    percent: 0,
    message: 'Getting ready...',
  })
  const progressAnim = useRef(new Animated.Value(0)).current
  const spinnerRotate = useRef(new Animated.Value(0)).current

  // Editable fields
  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([])
  const [autoCleanup, setAutoCleanup] = useState(true)

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
      setPhoto(compressed.uri)
      setStep('preview')
    } catch (err) {
      Alert.alert(
        'Photo Error',
        err instanceof Error ? err.message : 'Could not process that photo. Try again.',
      )
    }
  }

  const handleCapture = async () => {
    if (!cameraRef.current) return
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 })
    if (!photo?.uri) return
    await processPhoto(photo.uri)
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
      Alert.alert('Scan Error', err instanceof Error ? err.message : 'Could not scan product. Try again.')
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

  // ── Update progress with smooth animation ───────────────────────

  const updateProgress = useCallback(
    (pct: number, stage: UploadStage, message: string) => {
      setUploadProgress({ stage, percent: pct, message })
      Animated.timing(progressAnim, {
        toValue: pct,
        duration: 500,
        useNativeDriver: false,
      }).start()
    },
    [progressAnim],
  )

  // ── Animated spinner rotation ───────────────────────────────────

  const spinnerStyle = {
    transform: [
      {
        rotate: spinnerRotate.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        }),
      },
    ],
  }

  // Start spinner animation on mount
  const startSpinner = useCallback(() => {
    spinnerRotate.setValue(0)
    Animated.loop(
      Animated.timing(spinnerRotate, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: false,
      }),
    ).start()
  }, [spinnerRotate])

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

  // ── Upload photo + queue AI tagging ──────────────────────────────

  const handleUploadAndTag = async () => {
    if (!photo) return
    setStep('ai_tagging')
    setAiError(null)
    startSpinner()

    try {
      updateProgress(5, 'preparing', 'Getting ready...')
      updateProgress(10, 'linking', 'Starting upload...')

      const info = await uploadPhoto(photo, (pct, msg) => {
        updateProgress(pct, 'uploading', msg)
      })
      setUploadInfo(info)

      updateProgress(90, 'finalizing', 'Almost done...')
      await new Promise((r) => setTimeout(r, 400))

      updateProgress(100, 'finalizing', 'Done!')
      await new Promise((r) => setTimeout(r, 300))

      // Stop spinner
      spinnerRotate.stopAnimation()

      // AI tagging happens server-side via BullMQ after product creation
      setAiTags(null)
      setStep('edit')
    } catch (err) {
      spinnerRotate.stopAnimation()
      setAiError(err instanceof Error ? err.message : 'Upload failed')
      setStep('preview')
    }
  }

  // ── Save product ────────────────────────────────────────────────

  const handleSave = async () => {
    if (!uploadInfo) return
    setStep('saving')

    const priceInPaise = price ? Math.round(parseFloat(price) * 100) : undefined

    try {
      const created = await productApi.create({
        photo_r2_key: uploadInfo.r2_key,
        photo_url: uploadInfo.public_url,
        price_min: priceInPaise,
        price_max: priceInPaise,
        category: aiTags?.category ?? undefined,
        primary_color: aiTags?.primary_color ?? undefined,
        fabric_estimate: aiTags?.fabric_estimate ?? undefined,
        occasions: selectedOccasions.length > 0 ? selectedOccasions : (aiTags?.occasions ?? []),
        search_tags: aiTags?.search_tags ?? [],
        location_notes: location || undefined,
        notes: notes || undefined,
        auto_cleanup: autoCleanup,
      })

      // Extra frames the retailer multi-selected on the scan review screen —
      // best-effort: one failing shouldn't undo a product that already saved.
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

      Alert.alert(
        'Product Added!',
        'AI is tagging your product in the background. Check your catalog in a moment.',
        [{ text: 'OK', onPress: () => router.back() }],
      )
    } catch (err) {
      setStep('edit')
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save product')
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
        <TouchableOpacity
          onPress={() => void requestPermission()}
          className="bg-cyan-600 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Allow Camera</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── Camera step ────────────────────────────────────────────────

  if (step === 'camera') {
    return (
      <View className="flex-1 bg-black">
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        <TouchableOpacity
          onPress={() => router.back()}
          className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center"
          style={{ top: insets.top + 8 }}
        >
          <X size={20} color="white" />
        </TouchableOpacity>

        {/* Photo / Scan mode toggle */}
        <View className="absolute left-0 right-0 flex-row items-center justify-center gap-2" style={{ top: insets.top + 8 }}>
          <TouchableOpacity
            onPress={() => setCaptureMode('photo')}
            className={`px-4 py-1.5 rounded-full ${captureMode === 'photo' ? 'bg-cyan-600' : 'bg-black/50'}`}
          >
            <Text className="text-white text-xs font-semibold">Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCaptureMode('scan')}
            className={`px-4 py-1.5 rounded-full ${captureMode === 'scan' ? 'bg-cyan-600' : 'bg-black/50'}`}
          >
            <Text className="text-white text-xs font-semibold">Scan</Text>
          </TouchableOpacity>
        </View>

        {/* Frame guide */}
        <View className="flex-1 items-center justify-center">
          <View className="w-64 h-96 border-2 border-white/40 rounded-3xl" />
          <Text className="text-white/60 text-sm mt-4">
            {captureMode === 'scan' ? 'Pan slowly over the product' : 'Fit product top to bottom in frame'}
          </Text>
        </View>

        {/* Controls */}
        <View className="items-center gap-6" style={{ paddingBottom: 48 + insets.bottom }}>
          <View className="flex-row items-center gap-10">
            <TouchableOpacity
              onPress={() => void handlePickFromGallery()}
              disabled={isScanning}
              className="w-14 h-14 bg-white/20 rounded-2xl items-center justify-center"
            >
              <ImagePlus size={24} color="white" />
            </TouchableOpacity>

            {/* Shutter */}
            <TouchableOpacity
              onPress={() => void (captureMode === 'scan' ? handleScanCapture() : handleCapture())}
              disabled={isScanning}
              className="w-20 h-20 rounded-full border-4 border-white items-center justify-center"
            >
              {isScanning ? (
                <ActivityIndicator color="white" />
              ) : (
                <View className="w-14 h-14 bg-white rounded-full" />
              )}
            </TouchableOpacity>

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
        <TouchableOpacity
          onPress={() => {
            setScanFrames([])
            setScanBestUri(null)
            setScanSelected([])
            setStep('camera')
          }}
          className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center z-10"
          style={{ top: insets.top + 8 }}
        >
          <X size={20} color="white" />
        </TouchableOpacity>

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
                <TouchableOpacity
                  key={idx}
                  onPress={() => toggleFrame(uri)}
                  className={`w-28 h-40 rounded-xl overflow-hidden border-2 ${isSelected ? 'border-cyan-400' : 'border-white/20'}`}
                >
                  <Image
                    source={{ uri }}
                    style={{ width: '100%', height: '100%', opacity: isSelected ? 1 : 0.5 }}
                    contentFit="cover"
                  />
                  {isBest && (
                    <View className="absolute top-1.5 left-1.5 bg-cyan-500 px-2 py-0.5 rounded-full">
                      <Text className="text-white text-[9px] font-bold">Best</Text>
                    </View>
                  )}
                  <View
                    className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-full items-center justify-center border-2 ${isSelected ? 'bg-cyan-500 border-cyan-500' : 'bg-black/40 border-white/60'}`}
                  >
                    {isSelected && <Check size={14} color="white" />}
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </ScrollView>

        <View className="px-6" style={{ paddingBottom: 24 + insets.bottom }}>
          <TouchableOpacity
            onPress={confirmSelection}
            disabled={scanSelected.length === 0}
            className={`py-4 rounded-2xl items-center ${scanSelected.length === 0 ? 'bg-white/10' : 'bg-cyan-600'}`}
          >
            <Text className="text-white font-semibold">
              {scanSelected.length <= 1
                ? 'Continue →'
                : `Continue with ${scanSelected.length} photos →`}
            </Text>
          </TouchableOpacity>
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
        {aiError && (
          <View className="absolute top-0 left-0 right-0 bg-red-500/90 px-4 py-3" style={{ paddingTop: insets.top + 12 }}>
            <Text className="text-white text-sm text-center">{aiError}</Text>
          </View>
        )}
        <View className="absolute bottom-12 left-0 right-0 flex-row gap-4 px-6">
          <TouchableOpacity
            onPress={() => {
              setPhoto(null)
              setAiError(null)
              setExtraFrames([])
              setStep('camera')
            }}
            className="flex-1 bg-white/20 py-4 rounded-2xl items-center"
          >
            <Text className="text-white font-semibold">Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void handleUploadAndTag()}
            className="flex-1 bg-cyan-600 py-4 rounded-2xl items-center"
          >
            <Text className="text-white font-semibold">{aiError ? 'Try Again' : 'Use Photo →'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── AI Tagging step ───────────────────────────────────────────────

  if (step === 'ai_tagging') {
    const currentStepIndex = UPLOAD_STEPS.findIndex((s) => s.stage === uploadProgress.stage)
    const totalSteps = UPLOAD_STEPS.length
    const isComplete = uploadProgress.percent === 100

    const animWidth = progressAnim.interpolate({
      inputRange: [0, 100],
      outputRange: ['0%', '100%'],
    })

    // Step state helpers
    const isCompletedStep = (idx: number) => idx < currentStepIndex
    const isActiveStep = (idx: number) => idx === currentStepIndex && !isComplete

    return (
      <View className="flex-1 bg-gray-950 px-6" style={{ paddingTop: insets.top + 24 }}>
        {/* Close button */}
        <TouchableOpacity
          onPress={() => {
            setAiError('Upload cancelled')
            setStep('preview')
          }}
          className="absolute left-4 w-10 h-10 bg-white/10 rounded-full items-center justify-center z-10"
          style={{ top: insets.top + 8 }}
        >
          <X size={20} color="white" />
        </TouchableOpacity>

        {/* Header */}
        <Text className="text-white text-xl font-bold text-center mb-1">
          {isComplete ? 'Upload Complete!' : 'Uploading Product'}
        </Text>
        <Text className="text-gray-500 text-sm text-center mb-8">
          {isComplete
            ? 'AI will tag it automatically'
            : 'Please wait while we process your photo'}
        </Text>

        {/* Photo preview */}
        <View className="items-center mb-6">
          <View className="relative">
            {photo && (
              <Image
                source={{ uri: photo }}
                contentFit="cover"
                style={{ width: 224, height: 288, borderRadius: 24, opacity: isComplete ? 0.9 : 0.4 }}
              />
            )}

            {/* Overlay badge */}
            {isComplete && (
              <View className="absolute top-3 right-3 bg-emerald-500 px-3 py-1 rounded-full flex-row items-center gap-1">
                <Text className="text-white text-xs font-bold">✓ Done</Text>
              </View>
            )}

            {/* Scanning ring */}
            {!isComplete && (
              <View className="absolute -inset-1.5 rounded-[26px] border-2 border-cyan-500/30">
                <View className="absolute top-0 left-0 right-0 h-0.5 bg-cyan-400 rounded-full" style={{ opacity: 0.6 }} />
              </View>
            )}
          </View>
        </View>

        {/* Progress bar */}
        <View className="mb-3">
          <View className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <Animated.View
              className={`h-full rounded-full ${isComplete ? 'bg-emerald-500' : 'bg-cyan-500'}`}
              style={{ width: animWidth }}
            />
          </View>
          <View className="flex-row justify-between mt-1.5">
            <Text className="text-gray-500 text-xs">
              Step {Math.min(currentStepIndex + 1, totalSteps)} of {totalSteps}
            </Text>
            <Text className="text-gray-400 text-xs font-mono">
              {uploadProgress.percent}%
            </Text>
          </View>
        </View>

        {/* Status message with animated spinner */}
        <View className="flex-row items-center justify-center gap-2.5 mt-1 mb-8">
          {!isComplete && (
            <Animated.View
              className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent"
              style={spinnerStyle}
            />
          )}
          <Text className="text-white text-base font-semibold">
            {uploadProgress.message}
          </Text>
        </View>

        {/* Step indicator */}
        <View className="flex-row items-start justify-center px-4">
          {UPLOAD_STEPS.map((stepDef, idx) => {
            const completed = isCompletedStep(idx)
            const active = isActiveStep(idx)
            const displayIcon = completed || isComplete ? '✅' : active ? stepDef.icon : '○'

            return (
              <View key={stepDef.stage} className="items-center flex-1">
                {/* Step icon circle */}
                <View
                  className={`w-9 h-9 rounded-full items-center justify-center mb-1.5 ${
                    active
                      ? 'bg-cyan-600'
                      : completed || isComplete
                        ? 'bg-emerald-600'
                        : 'bg-gray-800'
                  }`}
                >
                  <Text className="text-sm">{displayIcon}</Text>
                </View>
                {/* Step label */}
                <Text
                  className={`text-[10px] font-medium ${
                    active
                      ? 'text-cyan-400'
                      : completed || isComplete
                        ? 'text-emerald-400'
                        : 'text-gray-600'
                  }`}
                >
                  {stepDef.label}
                </Text>
              </View>
            )
          })}
        </View>

        {/* Error badge if upload failed earlier */}
        {aiError && (
          <View className="mt-6 bg-red-500/20 border border-red-500/30 rounded-xl p-3">
            <Text className="text-red-400 text-sm text-center">{aiError}</Text>
          </View>
        )}
      </View>
    )
  }

  // ── Edit / Confirm step ───────────────────────────────────────────

  return (
    <View className="flex-1 bg-cyan-50">
      {/* Header — fixed outside the scroll area so back/save stay reachable */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-gray-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">Product Details</Text>
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={step === 'saving'}
          className="bg-cyan-600 px-4 py-2 rounded-xl"
        >
          {step === 'saving'
            ? <ActivityIndicator size="small" color="white" />
            : <Text className="text-white font-semibold text-sm">Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView className="flex-1">
      <View className="px-4 py-4 gap-4">
        {/* Photo preview */}
        {photo && (
          <View className="h-56 rounded-2xl overflow-hidden bg-gray-100">
            <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            <View className="absolute top-3 right-3 bg-cyan-600/90 px-2 py-1 rounded-full flex-row items-center gap-1">
              <ActivityIndicator size="small" color="white" />
              <Text className="text-white text-xs">AI tagging...</Text>
            </View>
          </View>
        )}

        {/* Auto-clean toggle: crop + white-background removal (runs server-side after Save) */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-semibold text-gray-900">Auto-clean photo</Text>
            <Text className="text-xs text-gray-500 mt-0.5">
              Crop to the garment and remove the background. Turn off for a styled/mannequin shot you want to keep as-is.
            </Text>
          </View>
          <Switch value={autoCleanup} onValueChange={setAutoCleanup} />
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

        {/* Store location */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Store Location
          </Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Rack B · Shelf 3 · Stack 2"
            className="text-sm text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Occasion tags */}
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
                    selected
                      ? 'bg-cyan-600 border-cyan-600'
                      : 'bg-white border-gray-200'
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

        <Text className="text-xs text-center text-gray-400 px-4">
          AI will auto-fill category, color, and fabric in the background
        </Text>
      </View>

      <View className="h-12" />
      </ScrollView>
    </View>
  )
}
