import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, ImagePlus, Ruler, Check } from 'lucide-react-native'
import { customerApi, uploadImageToR2 } from '../../../src/lib/api'

type Slot = 'front' | 'back'
type Step = 'height' | 'camera' | 'preview' | 'uploading' | 'done'

export default function MeasurementCaptureScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('height')
  const [slot, setSlot] = useState<Slot>('front')
  const [permission, requestPermission] = useCameraPermissions()
  const [height, setHeight] = useState('')
  const [photos, setPhotos] = useState<{ front: string | null; back: string | null }>({
    front: null,
    back: null,
  })
  const [error, setError] = useState<string | null>(null)
  const cameraRef = useRef<CameraView>(null)

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
    const compressed = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    )
    setPhotos((prev) => ({ ...prev, [slot]: compressed.uri }))
    setStep('preview')
  }

  const startCapture = () => {
    const heightNum = parseFloat(height)
    if (!heightNum || heightNum < 50 || heightNum > 250) {
      Alert.alert('Height required', 'Enter a valid height between 50–250 cm.')
      return
    }
    setSlot('front')
    setStep('camera')
  }

  const useThisPhoto = () => {
    if (slot === 'front') {
      setSlot('back')
      setStep('camera')
    } else {
      void handleUpload()
    }
  }

  const handleUpload = async () => {
    if (!photos.front || !photos.back) return
    setStep('uploading')
    setError(null)
    try {
      const heightNum = parseFloat(height)
      const init = await customerApi.initPhotoMeasurement(id, heightNum)
      const { measurement_id, front_upload_url, back_upload_url } = init.data

      // Upload front photo
      await uploadImageToR2(photos.front, front_upload_url, 'image/jpeg')

      // Upload back photo
      await uploadImageToR2(photos.back, back_upload_url, 'image/jpeg')

      await customerApi.extractMeasurement(id, measurement_id)
      void queryClient.invalidateQueries({ queryKey: ['customers', id, 'measurements'] })
      setStep('done')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setError(message)
      setStep('preview')
    }
  }

  // ── Height step ─────────────────────────────────────────────────

  if (step === 'height') {
    return (
      <View className="flex-1 bg-cyan-50 px-6" style={{ paddingTop: insets.top + 24 }}>
        <TouchableOpacity onPress={() => router.back()} className="mb-6">
          <X size={22} color="#374151" />
        </TouchableOpacity>

        <View className="items-center mb-8">
          <View className="w-16 h-16 bg-cyan-100 rounded-full items-center justify-center mb-3">
            <Ruler size={28} color="#0891B2" />
          </View>
          <Text className="text-xl font-bold text-gray-900">Body Measurement</Text>
          <Text className="text-sm text-gray-500 text-center mt-1 px-4">
            Front + back photo, height only — AI reads bust/waist/hip/inseam. Photos are deleted
            right after processing.
          </Text>
        </View>

        <View className="bg-white rounded-2xl p-4 border border-gray-100 mb-6">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Height (cm)
          </Text>
          <TextInput
            value={height}
            onChangeText={setHeight}
            placeholder="e.g. 162"
            keyboardType="numeric"
            className="text-lg font-bold text-gray-900"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <TouchableOpacity
          onPress={startCapture}
          className="bg-cyan-600 py-4 rounded-2xl items-center"
        >
          <Text className="text-white font-semibold">Continue to Front Photo →</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (!permission) return <View className="flex-1 bg-black" />

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <Text className="text-white text-center text-base mb-6">
          Camera access needed to capture measurement photos
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

  // ── Camera step ──────────────────────────────────────────────────

  if (step === 'camera') {
    const label = slot === 'front' ? 'Front · full body' : 'Back · full body'
    return (
      <View className="flex-1 bg-black">
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        <TouchableOpacity
          onPress={() => (slot === 'back' ? setStep('preview') : router.back())}
          className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center"
          style={{ top: insets.top + 8 }}
        >
          <X size={20} color="white" />
        </TouchableOpacity>

        <View className="absolute left-0 right-0 items-center" style={{ top: insets.top + 8 }}>
          <Text className="text-white text-sm font-semibold bg-black/50 px-3 py-1 rounded-full">
            {label} · {slot === 'front' ? '1' : '2'} of 2
          </Text>
        </View>

        <View className="flex-1 items-center justify-center">
          <View className="w-64 h-96 border-2 border-white/40 rounded-3xl" />
          <Text className="text-white/60 text-sm mt-4">Stand straight, full body in frame</Text>
        </View>

        <View className="pb-12 items-center gap-6">
          <View className="flex-row items-center gap-10">
            <TouchableOpacity
              onPress={() => void handlePickFromGallery()}
              className="w-14 h-14 bg-white/20 rounded-2xl items-center justify-center"
            >
              <ImagePlus size={24} color="white" />
            </TouchableOpacity>

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

  // ── Preview step ─────────────────────────────────────────────────

  if (step === 'preview') {
    const uri = photos[slot]
    const otherSlot = slot === 'front' ? 'back' : 'front'
    const otherUri = photos[otherSlot]
    const bothReady = photos.front && photos.back
    return (
      <View className="flex-1 bg-black">
        {/* When both photos are ready — show them side-by-side */}
        {bothReady ? (
          <View className="flex-1 flex-row">
            <View className="flex-1">
              {photos.front && (
                <Image source={{ uri: photos.front }} className="flex-1" contentFit="contain" />
              )}
              <View className="absolute top-4 left-4 bg-cyan-600/80 px-2.5 py-1 rounded-full">
                <Text className="text-white text-xs font-semibold">Front</Text>
              </View>
            </View>
            <View className="w-[1px] bg-white/20" />
            <View className="flex-1">
              {photos.back && (
                <Image source={{ uri: photos.back }} className="flex-1" contentFit="contain" />
              )}
              <View className="absolute top-4 right-4 bg-purple-600/80 px-2.5 py-1 rounded-full">
                <Text className="text-white text-xs font-semibold">Back</Text>
              </View>
            </View>
          </View>
        ) : (
          /* Single photo — current slot */
          <>
            {uri && <Image source={{ uri }} className="flex-1" contentFit="contain" />}
            
            {/* Thumbnail strip showing both photos when available */}
            {otherUri && (
              <View className="absolute bottom-32 left-0 right-0 items-center">
                <View className="bg-black/60 rounded-xl px-4 py-2.5 flex-row gap-4">
                  <View className={`w-16 h-22 rounded-lg overflow-hidden border-2 ${slot === 'front' ? 'border-cyan-400' : 'border-transparent'}`}>
                    {photos.front && <Image source={{ uri: photos.front }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                    <View className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5">
                      <Text className="text-white text-[8px] text-center font-medium">Front</Text>
                    </View>
                  </View>
                  <View className={`w-16 h-22 rounded-lg overflow-hidden border-2 ${slot === 'back' ? 'border-cyan-400' : 'border-transparent'}`}>
                    {photos.back && <Image source={{ uri: photos.back }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                    <View className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5">
                      <Text className="text-white text-[8px] text-center font-medium">Back</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </>
        )}

        {error && (
          <View
            className="absolute left-4 right-4 bg-red-500/90 rounded-xl p-3"
            style={{ top: insets.top + 8 }}
          >
            <Text className="text-white text-sm">{error}</Text>
          </View>
        )}
        <View
          className="absolute left-0 right-0 flex-row gap-4 px-6"
          style={{ bottom: 48 + insets.bottom }}
        >
          <TouchableOpacity
            onPress={() => setStep('camera')}
            className="flex-1 bg-white/20 py-4 rounded-2xl items-center"
          >
            <Text className="text-white font-semibold">Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={useThisPhoto}
            className="flex-1 bg-cyan-600 py-4 rounded-2xl items-center"
          >
            <Text className="text-white font-semibold">
              {slot === 'front' ? 'Use Photo → Back' : bothReady ? 'Upload Both Photos ✓' : 'Use Photo ✓'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Uploading step ─────────────────────────────────────────────────

  if (step === 'uploading') {
    return (
      <View className="flex-1 bg-gray-900 items-center justify-center gap-5">
        <ActivityIndicator size="large" color="#0891B2" />
        <Text className="text-white text-base font-semibold">Uploading photos...</Text>
        <Text className="text-gray-400 text-sm">Queuing AI measurement extraction</Text>
      </View>
    )
  }

  // ── Done step ─────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-cyan-50 items-center justify-center px-8">
      <View className="w-16 h-16 bg-green-100 rounded-full items-center justify-center mb-4">
        <Check size={28} color="#16A34A" />
      </View>
      <Text className="text-lg font-bold text-gray-900 text-center">Measurement queued</Text>
      <Text className="text-sm text-gray-500 text-center mt-1">
        Bust/waist/hip/inseam will appear on the customer profile in a moment. Photos are deleted
        after processing.
      </Text>
      <TouchableOpacity
        onPress={() => router.back()}
        className="mt-6 bg-cyan-600 px-6 py-3 rounded-xl"
      >
        <Text className="text-white font-semibold">Back to Customer</Text>
      </TouchableOpacity>
    </View>
  )
}
