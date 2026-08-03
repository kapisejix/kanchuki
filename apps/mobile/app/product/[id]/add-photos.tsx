import { useRef, useState } from 'react'
import { COLORS } from '@kanchuki/shared'
import { View, Text, ActivityIndicator, ScrollView, Alert } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, ImagePlus, Check } from 'lucide-react-native'
import { productApi, uploadImageToR2, readLocalImage } from '../../../src/lib/api'
import { showError } from '../../../src/lib/errors'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'

const PHOTO_LIMIT = 10
const MAX_SHOTS_PER_SESSION = 4

export default function AddPhotosScreen() {
  const insets = useSafeAreaInsets()
  const { id, existingCount } = useLocalSearchParams<{ id: string; existingCount?: string }>()
  const remainingSlots = Math.max(0, PHOTO_LIMIT - Number(existingCount ?? '0'))
  const maxShots = Math.min(MAX_SHOTS_PER_SESSION, remainingSlots || MAX_SHOTS_PER_SESSION)

  const [permission, requestPermission] = useCameraPermissions()
  const [shots, setShots] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const cameraRef = useRef<CameraView>(null)

  const addShot = async (uri: string) => {
    const compressed = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1200 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    )
    setShots((prev) => (prev.length >= maxShots ? prev : [...prev, compressed.uri]))
  }

  const handleCapture = async () => {
    if (!cameraRef.current || shots.length >= maxShots) return
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 })
      if (photo?.uri) await addShot(photo.uri)
    } catch (err) {
      showError(err, 'Could not capture photo')
    }
  }

  const handlePickFromGallery = async () => {
    const remaining = maxShots - shots.length
    if (remaining <= 0) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
    })
    if (result.canceled) return
    for (const asset of result.assets.slice(0, remaining)) {
      await addShot(asset.uri)
    }
  }

  const removeShot = (idx: number) => setShots((prev) => prev.filter((_, i) => i !== idx))

  const handleSave = async () => {
    if (shots.length === 0) return
    setUploading(true)
    try {
      // Issue #4: adding a photo of a NEW color should attach it to THIS
      // product's image slider (never a new product) and auto-create a color
      // swatch, ecommerce-style. Load the product's existing colors first so
      // we only add a variant when the detected color is actually new — extra
      // angles of the same color stay plain photos.
      let existingColors = new Set<string>()
      // If the product fetch fails, existingColors would stay empty and every
      // detected color would look "new" — creating duplicate swatches of the
      // product's own color. So variant creation is skipped entirely unless we
      // successfully loaded the existing colors.
      let colorsLoaded = false
      try {
        const existing = await productApi.get(id)
        const prod = (existing as {
          data: { primary_color?: string | null; variants?: { color: string }[] } | null
        }).data
        if (prod) {
          if (prod.primary_color) existingColors.add(prod.primary_color.trim().toLowerCase())
          for (const v of prod.variants ?? []) existingColors.add(v.color.trim().toLowerCase())
          colorsLoaded = true
        }
      } catch {
        // Non-fatal — variant creation is skipped when existing colors are unknown
      }

      for (const uri of shots) {
        const blob = await readLocalImage(uri)
        const uploadResult = await productApi.getUploadUrl('product.jpg', 'image/jpeg', blob.size)
        const { upload_url, r2_key, public_url } = uploadResult.data
        await uploadImageToR2(uri, upload_url, 'image/jpeg')
        await productApi.addPhoto(id, { r2_key, url: public_url, content_type: 'image/jpeg' })

        // Auto-detect the color; if it's new, add it as a color variant so the
        // product shows a solid color name + circular swatch (like shopping
        // cart sites). Best-effort — the photo is already saved regardless.
        if (!colorsLoaded) continue
        try {
          const colorResult = await productApi.detectColor(public_url)
          const color = colorResult?.data?.color?.trim()
          if (color && !existingColors.has(color.toLowerCase())) {
            await productApi.addVariant(id, { color, r2_key, url: public_url })
            existingColors.add(color.toLowerCase())
          }
        } catch {
          // Color detection is best-effort
        }
      }
      router.back()
    } catch (err) {
      showError(err, 'Failed to add photos')
    } finally {
      setUploading(false)
    }
  }

  if (remainingSlots <= 0) {
    Alert.alert('Photo limit reached', `Maximum ${PHOTO_LIMIT} photos per product.`, [
      { text: 'OK', onPress: () => router.back() },
    ])
    return <View className="flex-1 bg-black" />
  }

  if (!permission) return <View className="flex-1 bg-black" />

  if (!permission.granted) {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <Text className="text-white text-center text-base mb-6">
          Camera access needed to add photos
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

  const atLimit = shots.length >= maxShots

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

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
          Shoot a few angles · {shots.length}/{maxShots} · new colors auto-detect as swatches
        </Text>
      </View>

      {/* Captured shots so far — tap one to discard it */}
      {shots.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="absolute left-0 right-0"
          style={{ bottom: 152 + insets.bottom }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {shots.map((uri, idx) => (
            <AnimatedPressable
              key={uri}
              onPress={() => removeShot(idx)}
              className="w-16 h-16 rounded-lg overflow-hidden border-2 border-white/70"
            >
              <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            </AnimatedPressable>
          ))}
        </ScrollView>
      )}

      <View className="items-center gap-4" style={{ paddingBottom: 40 + insets.bottom }}>
        <View className="flex-row items-center gap-10">
          <AnimatedPressable
            onPress={() => void handlePickFromGallery()}
            disabled={atLimit}
            className={`w-14 h-14 bg-white/20 rounded-2xl items-center justify-center ${atLimit ? 'opacity-30' : ''}`}
          >
            <ImagePlus size={24} color="white" />
          </AnimatedPressable>

          <AnimatedPressable
            onPress={() => void handleCapture()}
            disabled={atLimit}
            className={`w-20 h-20 rounded-full border-4 border-white items-center justify-center ${atLimit ? 'opacity-30' : ''}`}
          >
            <View className="w-14 h-14 bg-white rounded-full" />
          </AnimatedPressable>

          <AnimatedPressable
            onPress={() => void handleSave()}
            disabled={shots.length === 0 || uploading}
            className={`w-14 h-14 rounded-2xl items-center justify-center ${shots.length > 0 ? 'bg-ink-600' : 'bg-white/10'}`}
          >
            {uploading ? <ActivityIndicator color="white" /> : <Check size={24} color="white" />}
          </AnimatedPressable>
        </View>
        <Text className="text-white/50 text-xs">Tap shutter for each angle · gallery to import · check to save</Text>
      </View>
    </View>
  )
}
