import { useRef, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, Alert } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { X, ImagePlus, Check } from 'lucide-react-native'
import { productApi, uploadImageToR2, readLocalImage } from '../../../src/lib/api'
import { showError } from '../../../src/lib/errors'

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
      for (const uri of shots) {
        const blob = await readLocalImage(uri)
        const uploadResult = await productApi.getUploadUrl('product.jpg', 'image/jpeg', blob.size)
        const { upload_url, r2_key, public_url } = uploadResult.data
        await uploadImageToR2(uri, upload_url, 'image/jpeg')
        await productApi.addPhoto(id, { r2_key, url: public_url, content_type: 'image/jpeg' })
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
        <TouchableOpacity
          onPress={() => void requestPermission()}
          className="bg-ink-600 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Allow Camera</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const atLimit = shots.length >= maxShots

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

      <TouchableOpacity
        onPress={() => router.back()}
        className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center"
        style={{ top: insets.top + 8 }}
      >
        <X size={20} color="white" />
      </TouchableOpacity>

      <View className="absolute left-0 right-0 items-center" style={{ top: insets.top + 8 }}>
        <Text className="text-white text-sm font-semibold bg-black/50 px-3 py-1 rounded-full">
          Shoot a few angles of this product · {shots.length}/{maxShots}
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
            <TouchableOpacity
              key={uri}
              onPress={() => removeShot(idx)}
              className="w-16 h-16 rounded-lg overflow-hidden border-2 border-white/70"
            >
              <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View className="items-center gap-4" style={{ paddingBottom: 40 + insets.bottom }}>
        <View className="flex-row items-center gap-10">
          <TouchableOpacity
            onPress={() => void handlePickFromGallery()}
            disabled={atLimit}
            className={`w-14 h-14 bg-white/20 rounded-2xl items-center justify-center ${atLimit ? 'opacity-30' : ''}`}
          >
            <ImagePlus size={24} color="white" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => void handleCapture()}
            disabled={atLimit}
            className={`w-20 h-20 rounded-full border-4 border-white items-center justify-center ${atLimit ? 'opacity-30' : ''}`}
          >
            <View className="w-14 h-14 bg-white rounded-full" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => void handleSave()}
            disabled={shots.length === 0 || uploading}
            className={`w-14 h-14 rounded-2xl items-center justify-center ${shots.length > 0 ? 'bg-ink-600' : 'bg-white/10'}`}
          >
            {uploading ? <ActivityIndicator color="white" /> : <Check size={24} color="white" />}
          </TouchableOpacity>
        </View>
        <Text className="text-white/50 text-xs">Tap shutter for each angle · gallery to import · check to save</Text>
      </View>
    </View>
  )
}
