import { useRef, useState } from 'react'
import { COLORS } from '@kanchuki/shared'
import { View, Text, TextInput, ActivityIndicator, Alert, StyleSheet, Switch } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, ImagePlus, Ruler, Check } from 'lucide-react-native'
import { customerApi, uploadImageToR2 } from '../../../src/lib/api'
import { logError } from '../../../src/lib/errors'
import { useTheme } from '../../../src/lib/theme'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'
import { GradientButton } from '../../../src/components/GradientButton'

type Slot = 'front' | 'back'
type Step = 'height' | 'camera' | 'preview' | 'uploading' | 'done'

export default function MeasurementCaptureScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('height')
  const [slot, setSlot] = useState<Slot>('front')
  const [permission, requestPermission] = useCameraPermissions()
  const [height, setHeight] = useState('')
  const [consentGiven, setConsentGiven] = useState(false)
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
    if (!consentGiven) {
      Alert.alert('Consent required', 'The customer must consent before their photos are captured.')
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
      const init = await customerApi.initPhotoMeasurement(id, heightNum, consentGiven)
      const { measurement_id, front_upload_url, back_upload_url } = init.data

      // Upload front photo. compress:false — body photos feed AI measurement
      // extraction; detail beats bytes (same exclusion as the server-side
      // batch compressor, scripts/compress-r2-images.ts).
      await uploadImageToR2(photos.front, front_upload_url, 'image/jpeg', undefined, undefined, { compress: false })

      // Upload back photo
      await uploadImageToR2(photos.back, back_upload_url, 'image/jpeg', undefined, undefined, { compress: false })

      await customerApi.extractMeasurement(id, measurement_id)
      void queryClient.invalidateQueries({ queryKey: ['customers', id, 'measurements'] })
      setStep('done')
    } catch (err) {
      logError(err)
      setError('Upload failed')
      setStep('preview')
    }
  }

  // ── Height step ─────────────────────────────────────────────────

  if (step === 'height') {
    return (
      <View className="flex-1 bg-[#F8F7FC] px-6" style={{ paddingTop: insets.top + 24 }}>
        <AnimatedPressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200 mb-6"
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <X size={20} color="#231F48" />
        </AnimatedPressable>

        <View className="items-center mb-8">
          <View className="w-16 h-16 bg-[#560A39] rounded-3xl items-center justify-center mb-3 border border-[#BB3F95]/30">
            <Ruler size={28} color="#BB3F95" />
          </View>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-2xl font-bold text-spaceCadet-900"
          >
            Body Measurement
          </Text>
          <Text className="text-xs text-heliotrope-500 text-center mt-1.5 px-4 font-medium leading-relaxed">
            Front + back photo, height only — AI reads bust/waist/hip/inseam. Photos are deleted
            right after processing.
          </Text>
        </View>

        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-5">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">
            Height (cm) *
          </Text>
          <TextInput
            value={height}
            onChangeText={setHeight}
            placeholder="e.g. 162"
            keyboardType="numeric"
            className="text-lg font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
            placeholderTextColor="#928EB2"
          />
        </View>

        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-6 flex-row items-center gap-3.5">
          <Switch
            value={consentGiven}
            onValueChange={setConsentGiven}
            trackColor={{ false: '#E0E1F6', true: '#BB3F95' }}
            thumbColor="#ffffff"
          />
          <Text className="flex-1 text-xs text-heliotrope-500 font-medium leading-relaxed">
            Customer has consented to their front/back photos being captured and used to
            estimate measurements for try-on.
          </Text>
        </View>

        <GradientButton label="Continue to Front Photo →" onPress={startCapture} disabled={!consentGiven} />
      </View>
    )
  }

  if (!permission) return <View className="flex-1 bg-black" />

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-[#231F48] items-center justify-center px-8">
        <Text className="text-white text-center text-base mb-6 font-bold">
          Camera access needed to capture measurement photos
        </Text>
        <AnimatedPressable
          onPress={() => void requestPermission()}
          className="bg-fuchsia-600 px-6 py-3.5 rounded-2xl"
        >
          <Text className="text-white font-bold text-xs uppercase tracking-wider">Allow Camera</Text>
        </AnimatedPressable>
      </View>
    )
  }

  // ── Camera step ──────────────────────────────────────────────────

  if (step === 'camera') {
    const label = slot === 'front' ? 'Front · full body' : 'Back · full body'
    return (
      <View className="flex-1 bg-black">
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

        <AnimatedPressable
          onPress={() => (slot === 'back' ? setStep('preview') : router.back())}
          className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center"
          style={{ top: insets.top + 8 }}
          accessibilityLabel="Close camera"
          accessibilityRole="button"
        >
          <X size={20} color="white" />
        </AnimatedPressable>

        <View className="absolute left-0 right-0 items-center" style={{ top: insets.top + 8 }}>
          <Text className="text-white text-xs font-bold bg-[#231F48]/85 px-4 py-1.5 rounded-full border border-white/20">
            {label} · {slot === 'front' ? '1' : '2'} of 2
          </Text>
        </View>

        <View className="flex-1 items-center justify-center">
          <View className="w-64 h-96 border-2 border-fuchsia-400/60 rounded-3xl" />
          <Text className="text-white/80 text-xs mt-4 font-semibold">Stand straight, full body in frame</Text>
        </View>

        <View className="pb-12 items-center gap-6">
          <View className="flex-row items-center gap-10">
            <AnimatedPressable
              onPress={() => void handlePickFromGallery()}
              className="w-14 h-14 bg-white/20 rounded-2xl items-center justify-center border border-white/30"
            >
              <ImagePlus size={24} color="white" />
            </AnimatedPressable>

            <AnimatedPressable
              onPress={() => void handleCapture()}
              className="w-20 h-20 rounded-full border-4 border-white items-center justify-center"
            >
              <View className="w-14 h-14 bg-white rounded-full" />
            </AnimatedPressable>

            <View className="w-14" />
          </View>
          <Text className="text-white/60 text-xs font-medium">Tap to capture · Gallery to import</Text>
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
          <View className="flex-1 flex-row" style={{ minHeight: 0 }}>
            <View className="flex-1" style={{ minHeight: 0 }}>
              {photos.front && (
                <Image
                  source={{ uri: photos.front }}
                  style={{ flex: 1, width: '100%', height: '100%' }}
                  contentFit="contain"
                />
              )}
              <View className="absolute top-4 left-4 bg-spaceCadet-900/90 px-3 py-1 rounded-full border border-white/20">
                <Text className="text-white text-xs font-bold">Front</Text>
              </View>
            </View>
            <View className="w-[1px] bg-white/20" />
            <View className="flex-1" style={{ minHeight: 0 }}>
              {photos.back && (
                <Image
                  source={{ uri: photos.back }}
                  style={{ flex: 1, width: '100%', height: '100%' }}
                  contentFit="contain"
                />
              )}
              <View className="absolute top-4 right-4 bg-spaceCadet-900/90 px-3 py-1 rounded-full border border-white/20">
                <Text className="text-white text-xs font-bold">Back</Text>
              </View>
            </View>
          </View>
        ) : (
          /* Single photo — current slot */
          <View className="flex-1">
            {uri && (
              <Image
                source={{ uri }}
                style={{ flex: 1, width: '100%', height: '100%' }}
                contentFit="contain"
              />
            )}
            
            {/* Thumbnail strip showing both photos when available */}
            {otherUri && (
              <View className="absolute bottom-32 left-0 right-0 items-center">
                <View className="bg-black/60 rounded-2xl px-4 py-2.5 flex-row gap-4 border border-white/20">
                  <View className={`w-16 h-24 rounded-xl overflow-hidden border-2 ${slot === 'front' ? 'border-fuchsia-500' : 'border-transparent'}`}>
                    {photos.front && <Image source={{ uri: photos.front }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                    <View className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5">
                      <Text className="text-white text-[8px] text-center font-bold">Front</Text>
                    </View>
                  </View>
                  <View className={`w-16 h-24 rounded-xl overflow-hidden border-2 ${slot === 'back' ? 'border-fuchsia-500' : 'border-transparent'}`}>
                    {photos.back && <Image source={{ uri: photos.back }} style={{ width: '100%', height: '100%' }} contentFit="cover" />}
                    <View className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5">
                      <Text className="text-white text-[8px] text-center font-bold">Back</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {error && (
          <View
            className="absolute left-4 right-4 bg-red-600/90 rounded-2xl p-3.5 border border-red-400"
            style={{ top: insets.top + 8 }}
          >
            <Text className="text-white text-xs font-bold text-center">{error}</Text>
          </View>
        )}
        <View
          className="absolute left-0 right-0 flex-row gap-4 px-6"
          style={{ bottom: 48 + insets.bottom }}
        >
          <AnimatedPressable
            onPress={() => setStep('camera')}
            className="flex-1 bg-white/20 py-4 rounded-2xl items-center border border-white/20"
          >
            <Text className="text-white font-bold text-xs uppercase tracking-wider">Retake</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={useThisPhoto}
            className="flex-1 bg-fuchsia-600 py-4 rounded-2xl items-center shadow-lg"
          >
            <Text className="text-white font-bold text-xs uppercase tracking-wider">
              {slot === 'front' ? 'Use Photo → Back' : bothReady ? 'Upload Both Photos ✓' : 'Use Photo ✓'}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    )
  }

  // ── Uploading step ─────────────────────────────────────────────────

  if (step === 'uploading') {
    return (
      <View className="flex-1 bg-[#231F48] items-center justify-center gap-5">
        <ActivityIndicator size="large" color="#BB3F95" />
        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-white text-xl font-bold"
        >
          Uploading photos...
        </Text>
        <Text className="text-[#E0E1F6] text-xs font-medium">Queuing AI measurement extraction</Text>
      </View>
    )
  }

  // ── Done step ─────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-[#F8F7FC] items-center justify-center px-8">
      <View className="w-16 h-16 bg-lavender-100 border border-lavender-200 rounded-3xl items-center justify-center mb-4">
        <Check size={28} color="#BB3F95" />
      </View>
      <Text
        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
        className="text-2xl font-bold text-spaceCadet-900 text-center"
      >
        Measurement Queued
      </Text>
      <Text className="text-xs text-heliotrope-500 text-center mt-1.5 font-medium leading-relaxed">
        Bust/waist/hip/inseam will appear on the customer profile in a moment. Photos are deleted
        after processing.
      </Text>
      <AnimatedPressable
        onPress={() => router.back()}
        className="mt-6 bg-spaceCadet-900 px-6 py-3.5 rounded-2xl"
      >
        <Text className="text-white text-xs font-bold uppercase tracking-wider">Back to Customer</Text>
      </AnimatedPressable>
    </View>
  )
}
