import { useRef, useState } from 'react'
import { COLORS } from '@kanchuki/shared'
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, ImagePlus } from 'lucide-react-native'
import { productApi, uploadImageToR2, readLocalImage } from '../../../src/lib/api'
import { showError } from '../../../src/lib/errors'
import { useTheme } from '../../../src/lib/theme'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'
import { GradientButton } from '../../../src/components/GradientButton'

// No manual color step in the happy path — AI detects the color and the
// variant saves itself. 'manual' is a fallback only for when detection fails.
type Step = 'camera' | 'detecting' | 'manual' | 'saving'

export default function AddColorVariantScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [step, setStep] = useState<Step>('camera')
  const [permission, requestPermission] = useCameraPermissions()
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [color, setColor] = useState('')
  const cameraRef = useRef<CameraView>(null)
  // Store upload result so we don't re-upload on save
  const uploadInfoRef = useRef<{ r2_key: string; public_url: string } | null>(null)

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
    setPhotoUri(compressed.uri)
    setStep('detecting')
    await uploadAndAutoSave(compressed.uri)
  }

  // Upload, detect color, save — no user interaction. Falls back to the
  // manual step only if upload or detection didn't produce a color.
  const uploadAndAutoSave = async (uri: string) => {
    try {
      const blob = await readLocalImage(uri)
      const uploadResult = await productApi.getUploadUrl('variant.jpg', 'image/jpeg', blob.size)
      const info = uploadResult.data
      await uploadImageToR2(uri, info.upload_url, 'image/jpeg')
      uploadInfoRef.current = { r2_key: info.r2_key, public_url: info.public_url }

      const colorResult = await productApi.detectColor(info.public_url)
      const detected = colorResult.data.color
      if (detected) {
        await saveVariant(detected)
      } else {
        setStep('manual')
      }
    } catch {
      // Upload or detection failed — fall back to manual entry
      setStep('manual')
    }
  }

  const saveVariant = async (colorValue: string) => {
    if (!colorValue.trim()) return
    setStep('saving')
    try {
      // Use pre-uploaded photo if available, otherwise upload now
      if (uploadInfoRef.current) {
        await productApi.addVariant(id, {
          color: colorValue.trim(),
          r2_key: uploadInfoRef.current.r2_key,
          url: uploadInfoRef.current.public_url,
        })
      } else if (photoUri) {
        const blob = await readLocalImage(photoUri)
        const uploadResult = await productApi.getUploadUrl('variant.jpg', 'image/jpeg', blob.size)
        const info = uploadResult.data
        await uploadImageToR2(photoUri, info.upload_url, 'image/jpeg')

        await productApi.addVariant(id, {
          color: colorValue.trim(),
          r2_key: info.r2_key,
          url: info.public_url,
        })
      }

      router.back()
    } catch (err) {
      setStep('manual')
      showError(err, 'Failed to add color')
    }
  }

  if (!permission) return <View className="flex-1 bg-black" />

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <Text className="text-white text-center text-base mb-6">
          Camera access needed to photograph this color
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

        <View className="absolute left-0 right-0 items-center" style={{ top: insets.top + 8 }}>
          <Text className="text-white text-sm font-semibold bg-black/50 px-3 py-1 rounded-full">
            Photograph the same design, this color
          </Text>
        </View>

        <View className="flex-1 items-center justify-center">
          <View className="w-72 h-80 border-2 border-white/40 rounded-3xl" />
          <Text className="text-white/60 text-sm mt-4">Real photo, not a color filter</Text>
        </View>

        <View className="items-center gap-6" style={{ paddingBottom: 48 + insets.bottom }}>
          <View className="flex-row items-center gap-10">
            <AnimatedPressable
              onPress={() => void handlePickFromGallery()}
              className="w-14 h-14 bg-white/20 rounded-2xl items-center justify-center"
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
          <Text className="text-white/50 text-xs">Tap to capture · Gallery to import</Text>
        </View>
      </View>
    )
  }

  // detecting / manual / saving
  return (
    <View className="flex-1 bg-black">
      {photoUri && <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />}

      <View className="absolute left-4" style={{ top: insets.top + 8 }}>
        <AnimatedPressable
          onPress={() => setStep('camera')}
          disabled={step === 'saving'}
          className="w-10 h-10 bg-black/50 rounded-full items-center justify-center"
          accessibilityLabel="Retake photo"
          accessibilityRole="button"
        >
          <X size={20} color="white" />
        </AnimatedPressable>
      </View>

      {(step === 'detecting' || step === 'saving') && (
        <View
          className="absolute bottom-0 left-0 right-0 bg-black/80 px-6 pt-4 flex-row items-center gap-3"
          style={{ paddingBottom: 40 + insets.bottom }}
        >
          <ActivityIndicator color="white" />
          <Text className="text-white text-sm font-semibold">
            {step === 'detecting' ? 'Detecting color…' : `Saving ${color}…`}
          </Text>
        </View>
      )}

      {step === 'manual' && (
        <View
          className="absolute bottom-0 left-0 right-0 bg-black/80 px-6 pt-4 gap-3"
          style={{ paddingBottom: 40 + insets.bottom }}
        >
          <Text className="text-white text-xs font-semibold uppercase tracking-wide">
            Couldn&apos;t detect color — enter it
          </Text>
          <TextInput
            value={color}
            onChangeText={setColor}
            placeholder="e.g. Maroon, Bottle Green, Mustard"
            placeholderTextColor={colors.sand[400]}
            className="bg-white/10 text-white px-4 py-3 rounded-xl text-base"
            autoFocus
          />
          <GradientButton
            label="Add Color Variant"
            onPress={() => void saveVariant(color)}
            disabled={!color.trim()}
          />
        </View>
      )}
    </View>
  )
}
