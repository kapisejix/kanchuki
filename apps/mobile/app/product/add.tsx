import { useState, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, Camera, ImagePlus, ChevronDown, Check, SkipForward } from 'lucide-react-native'
import { productApi, uploadImageToR2, readLocalImage } from '../../src/lib/api'
import { OCCASION_TYPES, PRODUCT_CATEGORIES } from '@kanchuki/shared'

type Slot = 'front' | 'back'
type Step = 'camera' | 'preview' | 'back_choice' | 'ai_tagging' | 'edit' | 'saving'

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

export default function AddProductScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('camera')
  const [slot, setSlot] = useState<Slot>('front')
  const [permission, requestPermission] = useCameraPermissions()
  const [photos, setPhotos] = useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  })
  const [uploadInfo, setUploadInfo] = useState<{ front: UploadInfo | null; back: UploadInfo | null }>({
    front: null,
    back: null,
  })
  const [aiTags, setAiTags] = useState<AiTags | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  // Editable fields
  const [price, setPrice] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [selectedOccasions, setSelectedOccasions] = useState<string[]>([])

  const cameraRef = useRef<CameraView>(null)

  // ── Camera capture ──────────────────────────────────────────────

  const handleCapture = async () => {
    if (!cameraRef.current) return
    const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 })
    if (!photo?.uri) return
    await processPhoto(photo.uri)
  }

  const handlePickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    })
    if (result.canceled || !result.assets[0]) return
    await processPhoto(result.assets[0].uri)
  }

  const processPhoto = async (uri: string) => {
    try {
      // Compress to target < 500KB
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      )
      setPhotos((prev) => ({ ...prev, [slot]: compressed.uri }))
      setStep('preview')
    } catch (err) {
      Alert.alert(
        'Photo Error',
        err instanceof Error ? err.message : 'Could not process that photo. Try again.',
      )
    }
  }

  // ── Upload one photo, return its UploadInfo ─────────────────────

  const uploadPhoto = async (uri: string): Promise<UploadInfo> => {
    const blob = await readLocalImage(uri)
    const uploadResult = await productApi.getUploadUrl('product.jpg', 'image/jpeg', blob.size)
    const info = uploadResult.data
    await uploadImageToR2(uri, info.upload_url, 'image/jpeg')
    return info
  }

  // ── Upload photo(s) + queue AI tagging ──────────────────────────

  const handleUploadAndTag = async () => {
    if (!photos.front) return
    setStep('ai_tagging')
    setAiError(null)

    try {
      const frontInfo = await uploadPhoto(photos.front)
      const backInfo = photos.back ? await uploadPhoto(photos.back) : null
      setUploadInfo({ front: frontInfo, back: backInfo })

      // AI tagging happens server-side via BullMQ after product creation
      setAiTags(null) // will be populated after creation
      setStep('edit')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Upload failed')
      setStep('back_choice')
    }
  }

  // ── Save product ────────────────────────────────────────────────

  const handleSave = async () => {
    if (!uploadInfo.front) return
    setStep('saving')

    const priceInPaise = price ? Math.round(parseFloat(price) * 100) : undefined

    try {
      await productApi.create({
        photo_r2_key: uploadInfo.front.r2_key,
        photo_url: uploadInfo.front.public_url,
        ...(uploadInfo.back
          ? { back_photo_r2_key: uploadInfo.back.r2_key, back_photo_url: uploadInfo.back.public_url }
          : {}),
        price_min: priceInPaise,
        price_max: priceInPaise,
        category: aiTags?.category ?? undefined,
        primary_color: aiTags?.primary_color ?? undefined,
        fabric_estimate: aiTags?.fabric_estimate ?? undefined,
        occasions: selectedOccasions.length > 0 ? selectedOccasions : (aiTags?.occasions ?? []),
        search_tags: aiTags?.search_tags ?? [],
        location_notes: location || undefined,
        notes: notes || undefined,
      })

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

  // ── Camera step (front or back, depending on `slot`) ─────────────

  if (step === 'camera') {
    const label = slot === 'front' ? 'Front photo' : 'Back photo'
    return (
      <View className="flex-1 bg-black">
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        <TouchableOpacity
          onPress={() => (slot === 'back' ? setStep('back_choice') : router.back())}
          className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center"
          style={{ top: insets.top + 8 }}
        >
          <X size={20} color="white" />
        </TouchableOpacity>

        <View className="absolute left-0 right-0 items-center" style={{ top: insets.top + 8 }}>
          <Text className="text-white text-sm font-semibold bg-black/50 px-3 py-1 rounded-full">
            {label} · 1 of 2
          </Text>
        </View>

        {/* Frame guide */}
        <View className="flex-1 items-center justify-center">
          <View className="w-72 h-80 border-2 border-white/40 rounded-3xl" />
          <Text className="text-white/60 text-sm mt-4">Place product in frame</Text>
        </View>

        {/* Controls */}
        <View className="items-center gap-6" style={{ paddingBottom: 48 + insets.bottom }}>
          <View className="flex-row items-center gap-10">
            <TouchableOpacity
              onPress={() => void handlePickFromGallery()}
              className="w-14 h-14 bg-white/20 rounded-2xl items-center justify-center"
            >
              <ImagePlus size={24} color="white" />
            </TouchableOpacity>

            {/* Shutter */}
            <TouchableOpacity
              onPress={() => void handleCapture()}
              className="w-20 h-20 rounded-full border-4 border-white items-center justify-center"
            >
              <View className="w-14 h-14 bg-white rounded-full" />
            </TouchableOpacity>

            <View className="w-14" />
          </View>
          <Text className="text-white/50 text-xs">Tap to capture · Gallery to import</Text>
        </View>
      </View>
    )
  }

  // ── Preview step (front or back) ──────────────────────────────────

  if (step === 'preview') {
    const uri = photos[slot]
    return (
      <View className="flex-1 bg-black">
        {uri && (
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
          />
        )}
        <View className="absolute bottom-12 left-0 right-0 flex-row gap-4 px-6">
          <TouchableOpacity
            onPress={() => setStep('camera')}
            className="flex-1 bg-white/20 py-4 rounded-2xl items-center"
          >
            <Text className="text-white font-semibold">Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setStep('back_choice')}
            className="flex-1 bg-cyan-600 py-4 rounded-2xl items-center"
          >
            <Text className="text-white font-semibold">
              {slot === 'front' ? 'Use Photo →' : 'Use Photo ✓'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Back-photo choice step ─────────────────────────────────────────

  if (step === 'back_choice') {
    const backDone = !!photos.back
    return (
      <View className="flex-1 bg-gray-950 px-6" style={{ paddingTop: insets.top + 24 }}>
        {aiError && (
          <View className="bg-red-500/90 rounded-xl p-3 mb-4">
            <Text className="text-white text-sm">{aiError}</Text>
          </View>
        )}

        <Text className="text-white text-xl font-bold mb-2">
          {backDone ? 'Back photo added' : 'Add a back photo?'}
        </Text>
        <Text className="text-gray-400 text-sm mb-6">
          Back photos help AI read fabric texture, embellishments, and design numbers on the tag.
        </Text>

        <View className="flex-row gap-4 mb-8">
          <View className="flex-1 h-48 rounded-2xl overflow-hidden bg-gray-800 border border-gray-700">
            {photos.front && (
              <Image source={{ uri: photos.front }} className="w-full h-full" contentFit="cover" />
            )}
            <Text className="absolute bottom-2 left-2 text-white text-xs bg-black/60 px-2 py-0.5 rounded-full">
              Front
            </Text>
          </View>
          <View className="flex-1 h-48 rounded-2xl overflow-hidden bg-gray-800 border border-gray-700 items-center justify-center">
            {photos.back ? (
              <>
                <Image source={{ uri: photos.back }} className="w-full h-full" contentFit="cover" />
                <Text className="absolute bottom-2 left-2 text-white text-xs bg-black/60 px-2 py-0.5 rounded-full">
                  Back
                </Text>
              </>
            ) : (
              <Camera size={28} color="#6B7280" />
            )}
          </View>
        </View>

        <View className="gap-3">
          {!backDone && (
            <TouchableOpacity
              onPress={() => {
                setSlot('back')
                setStep('camera')
              }}
              className="bg-cyan-600 py-4 rounded-2xl items-center flex-row justify-center gap-2"
            >
              <Camera size={18} color="white" />
              <Text className="text-white font-semibold">Take / Choose Back Photo</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => void handleUploadAndTag()}
            className="bg-white/10 py-4 rounded-2xl items-center flex-row justify-center gap-2"
          >
            {backDone ? (
              <Check size={18} color="white" />
            ) : (
              <SkipForward size={18} color="white" />
            )}
            <Text className="text-white font-semibold">
              {backDone ? 'Continue →' : 'Skip — front photo only'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── AI Tagging step ───────────────────────────────────────────────

  if (step === 'ai_tagging') {
    return (
      <View className="flex-1 bg-gray-900 items-center justify-center gap-5">
        {photos.front && (
          <Image source={{ uri: photos.front }} className="w-48 h-64 rounded-2xl" contentFit="cover" style={{ opacity: 0.5 }} />
        )}
        <ActivityIndicator size="large" color="#0891B2" />
        <Text className="text-white text-base font-semibold">Uploading product...</Text>
        <Text className="text-gray-400 text-sm">AI will tag it automatically</Text>
      </View>
    )
  }

  // ── Edit / Confirm step ───────────────────────────────────────────

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
          disabled={step === 'saving'}
          className="bg-cyan-600 px-4 py-2 rounded-xl"
        >
          {step === 'saving'
            ? <ActivityIndicator size="small" color="white" />
            : <Text className="text-white font-semibold text-sm">Save</Text>}
        </TouchableOpacity>
      </View>

      <View className="px-4 py-4 gap-4">
        {/* Photo preview */}
        <View className="flex-row gap-3">
          {photos.front && (
            <View className="flex-1 h-48 rounded-2xl overflow-hidden bg-gray-100">
              <Image source={{ uri: photos.front }} className="w-full h-full" contentFit="cover" />
              <View className="absolute top-3 right-3 bg-cyan-600/90 px-2 py-1 rounded-full flex-row items-center gap-1">
                <ActivityIndicator size="small" color="white" />
                <Text className="text-white text-xs">AI tagging...</Text>
              </View>
            </View>
          )}
          {photos.back && (
            <View className="flex-1 h-48 rounded-2xl overflow-hidden bg-gray-100">
              <Image source={{ uri: photos.back }} className="w-full h-full" contentFit="cover" />
            </View>
          )}
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
  )
}
