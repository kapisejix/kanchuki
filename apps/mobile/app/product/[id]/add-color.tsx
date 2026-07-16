import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, ImagePlus } from 'lucide-react-native'
import { productApi, uploadImageToR2, readLocalImage } from '../../../src/lib/api'

type Step = 'camera' | 'preview' | 'saving'

export default function AddColorVariantScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [step, setStep] = useState<Step>('camera')
  const [permission, requestPermission] = useCameraPermissions()
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [color, setColor] = useState('')
  const [detectingColor, setDetectingColor] = useState(false)
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
    setStep('preview')

    // Auto-upload + AI color detect in background
    detectColorAsync(compressed.uri)
  }

  const detectColorAsync = async (uri: string) => {
    setDetectingColor(true)
    try {
      const blob = await readLocalImage(uri)
      const uploadResult = await productApi.getUploadUrl('variant.jpg', 'image/jpeg', blob.size)
      const info = uploadResult.data
      await uploadImageToR2(uri, info.upload_url, 'image/jpeg')

      // Store upload info so handleSave doesn't upload again
      uploadInfoRef.current = { r2_key: info.r2_key, public_url: info.public_url }

      // Quick AI color detection
      try {
        const colorResult = await productApi.detectColor(info.public_url)
        if (colorResult.data.color) {
          setColor(colorResult.data.color)
        }
      } catch {
        // Color detection is best-effort — user can type manually
      }
    } catch {
      // Upload failed — user can retry on save
    } finally {
      setDetectingColor(false)
    }
  }

  const handleSave = async () => {
    if (!photoUri || !color.trim()) return
    setStep('saving')
    try {
      // Use pre-uploaded photo if available, otherwise upload now
      if (uploadInfoRef.current) {
        await productApi.addVariant(id, {
          color: color.trim(),
          r2_key: uploadInfoRef.current.r2_key,
          url: uploadInfoRef.current.public_url,
        })
      } else {
        const blob = await readLocalImage(photoUri)
        const uploadResult = await productApi.getUploadUrl('variant.jpg', 'image/jpeg', blob.size)
        const info = uploadResult.data
        await uploadImageToR2(photoUri, info.upload_url, 'image/jpeg')

        await productApi.addVariant(id, {
          color: color.trim(),
          r2_key: info.r2_key,
          url: info.public_url,
        })
      }

      router.back()
    } catch (err) {
      setStep('preview')
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add color')
    }
  }

  if (!permission) return <View className="flex-1 bg-black" />

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <Text className="text-white text-center text-base mb-6">
          Camera access needed to photograph this color
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

  // preview + saving
  return (
    <View className="flex-1 bg-black">
      {photoUri && <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />}

      <View className="absolute left-4" style={{ top: insets.top + 8 }}>
        <TouchableOpacity
          onPress={() => setStep('camera')}
          className="w-10 h-10 bg-black/50 rounded-full items-center justify-center"
        >
          <X size={20} color="white" />
        </TouchableOpacity>
      </View>

      <View
        className="absolute bottom-0 left-0 right-0 bg-black/80 px-6 pt-4 gap-3"
        style={{ paddingBottom: 40 + insets.bottom }}
      >
        <Text className="text-white text-xs font-semibold uppercase tracking-wide">Color name</Text>
        <TextInput
          value={color}
          onChangeText={setColor}
          placeholder="e.g. Maroon, Bottle Green, Mustard"
          placeholderTextColor="#9CA3AF"
          className="bg-white/10 text-white px-4 py-3 rounded-xl text-base"
          autoFocus
        />
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={!color.trim() || step === 'saving'}
          className={`py-4 rounded-2xl items-center ${color.trim() ? 'bg-cyan-600' : 'bg-white/10'}`}
        >
          {step === 'saving' ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-semibold">Add Color Variant</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}
