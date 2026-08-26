import { useRef, useState } from 'react'
import { COLORS } from '@kanchuki/shared'
import { View, Text, TextInput, StyleSheet, ActivityIndicator } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQueryClient } from '@tanstack/react-query'
import { X, ImagePlus, Check } from 'lucide-react-native'
import { productApi, uploadImageToR2, readLocalImage } from '../../../src/lib/api'
import { showError } from '../../../src/lib/errors'
import { useTheme } from '../../../src/lib/theme'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'
import { GradientButton } from '../../../src/components/GradientButton'

type Step = 'camera' | 'detecting' | 'saving' | 'manual'

export default function AddColorVariantScreen() {
  const { colors, primaryColor } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
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

  // Upload, auto-detect color, save and return immediately without manual friction.
  const uploadAndAutoSave = async (uri: string) => {
    try {
      const blob = await readLocalImage(uri)
      const uploadResult = await productApi.getUploadUrl('variant.jpg', 'image/jpeg', blob.size)
      const info = uploadResult.data
      await uploadImageToR2(uri, info.upload_url, 'image/jpeg')
      uploadInfoRef.current = { r2_key: info.r2_key, public_url: info.public_url }

      let detected = 'New Color'
      try {
        const colorResult = await productApi.detectColor(info.public_url)
        if (colorResult?.data?.color?.trim()) {
          detected = colorResult.data.color.trim()
        }
      } catch {
        // Fallback color handled below
      }

      setColor(detected)
      await saveVariant(detected)
    } catch (err) {
      // If network or save fails, allow manual entry as safety fallback
      setStep('manual')
      showError(err, 'Could not auto-save color variant. Please check and retry.')
    }
  }

  const saveVariant = async (colorValue: string) => {
    const finalColor = colorValue.trim() || 'New Color'
    setStep('saving')
    try {
      if (uploadInfoRef.current) {
        await productApi.addVariant(id, {
          color: finalColor,
          r2_key: uploadInfoRef.current.r2_key,
          url: uploadInfoRef.current.public_url,
        })
      } else if (photoUri) {
        const blob = await readLocalImage(photoUri)
        const uploadResult = await productApi.getUploadUrl('variant.jpg', 'image/jpeg', blob.size)
        const info = uploadResult.data
        await uploadImageToR2(photoUri, info.upload_url, 'image/jpeg')

        await productApi.addVariant(id, {
          color: finalColor,
          r2_key: info.r2_key,
          url: info.public_url,
        })
      }

      // Invalidate queries so product detail and catalog refresh immediately
      await queryClient.invalidateQueries({ queryKey: ['products', id] })
      await queryClient.invalidateQueries({ queryKey: ['products'] })

      router.back()
    } catch (err) {
      setStep('manual')
      showError(err, 'Failed to add color variant')
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
          className="bg-rust-500 px-6 py-3 rounded-xl"
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
          <Text className="text-white text-sm font-semibold bg-black/60 px-4 py-1.5 rounded-full">
            Photograph the new color variant
          </Text>
        </View>

        <View className="flex-1 items-center justify-center">
          <View className="w-72 h-80 border-2 border-white/50 rounded-3xl" />
          <Text className="text-white/70 text-xs mt-4">AI will auto-detect the color and save it</Text>
        </View>

        <View className="items-center gap-6" style={{ paddingBottom: 48 + insets.bottom }}>
          <View className="flex-row items-center gap-10">
            <AnimatedPressable
              onPress={() => void handlePickFromGallery()}
              className="w-14 h-14 bg-white/20 rounded-2xl items-center justify-center active:bg-white/30"
              accessibilityLabel="Upload from gallery"
              accessibilityRole="button"
            >
              <ImagePlus size={24} color="white" />
            </AnimatedPressable>

            <AnimatedPressable
              onPress={() => void handleCapture()}
              className="w-20 h-20 rounded-full border-4 border-white items-center justify-center active:opacity-80"
              accessibilityLabel="Capture photo"
              accessibilityRole="button"
            >
              <View className="w-14 h-14 bg-white rounded-full" />
            </AnimatedPressable>

            <View className="w-14" />
          </View>
          <Text className="text-white/60 text-xs">Tap to capture · Gallery to upload</Text>
        </View>
      </View>
    )
  }

  // detecting / saving / manual fallback
  return (
    <View className="flex-1 bg-black">
      {photoUri && <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />}

      <View className="absolute left-4" style={{ top: insets.top + 8 }}>
        <AnimatedPressable
          onPress={() => {
            uploadInfoRef.current = null
            setPhotoUri(null)
            setStep('camera')
          }}
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
          className="absolute bottom-0 left-0 right-0 bg-black/85 px-6 pt-5 pb-6 flex-row items-center gap-3"
          style={{ paddingBottom: Math.max(24, 20 + insets.bottom) }}
        >
          <ActivityIndicator color={colors.rust[500]} size="small" />
          <View className="flex-1">
            <Text className="text-white text-sm font-semibold">
              {step === 'detecting' ? 'Auto-detecting color…' : `Saving ${color}…`}
            </Text>
            <Text className="text-white/60 text-xs mt-0.5">
              Adding new color variant to your product
            </Text>
          </View>
        </View>
      )}

      {step === 'manual' && (
        <View
          className="absolute bottom-0 left-0 right-0 bg-black/90 px-6 pt-5 gap-3"
          style={{ paddingBottom: Math.max(24, 20 + insets.bottom) }}
        >
          <Text className="text-white text-xs font-semibold uppercase tracking-wide">
            Enter Color Name
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
            label="Save Color Variant"
            onPress={() => void saveVariant(color)}
            disabled={!color.trim()}
          />
        </View>
      )}
    </View>
  )
}
