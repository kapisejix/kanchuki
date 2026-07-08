import { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  Dimensions,
} from 'react-native'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useQueryClient } from '@tanstack/react-query'
import {
  Camera,
  ImagePlus,
  Check,
  X,
  AlertTriangle,
  Upload,
} from 'lucide-react-native'
import { productApi, uploadImageToR2 } from '../../src/lib/api'

// ─── Types ────────────────────────────────────────────────────────

type PhotoItem = {
  localUri: string
  thumbUri: string
}

type ImportStatus =
  | { state: 'pending' }
  | { state: 'uploading' }
  | { state: 'creating' }
  | { state: 'done'; productId: string }
  | { state: 'failed'; error: string }

type Step = 'pick' | 'importing' | 'done'

const MAX_BATCH_SIZE = 20

// ─── Compress helper ──────────────────────────────────────────────

async function compressPhoto(uri: string): Promise<string> {
  const compressed = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
  )
  return compressed.uri
}

// ─── Main Screen ──────────────────────────────────────────────────

export default function BulkImportScreen() {
  const [step, setStep] = useState<Step>('pick')
  const [photos, setPhotos] = useState<PhotoItem[]>([])
  const [statuses, setStatuses] = useState<ImportStatus[]>([])
  const [completed, setCompleted] = useState(0)
  const [total, setTotal] = useState(0)
  const [failed, setFailed] = useState(0)

  const queryClient = useQueryClient()

  // ── Pick photos from gallery ──────────────────────────────────

  const handlePickPhotos = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: MAX_BATCH_SIZE,
    })

    if (result.canceled || !result.assets.length) return

    const newPhotos: PhotoItem[] = result.assets.map((a) => ({
      localUri: a.uri,
      thumbUri: a.uri,
    }))

    setPhotos((prev) => {
      const combined = [...prev, ...newPhotos]
      if (combined.length > MAX_BATCH_SIZE) return combined.slice(0, MAX_BATCH_SIZE)
      return combined
    })
  }, [])

  // ── Remove a photo from the list ──────────────────────────────

  const removePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // ── Import all photos ─────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (photos.length === 0) return

    setStep('importing')
    setStatuses(photos.map(() => ({ state: 'pending' })))
    setTotal(photos.length)
    setCompleted(0)
    setFailed(0)

    let doneCount = 0
    let failCount = 0

    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i]!

      // Mark as uploading
      setStatuses((prev) => {
        const next = [...prev]
        next[i] = { state: 'uploading' }
        return next
      })

      try {
        // Compress
        const compressedUri = await compressPhoto(photo.localUri)

        // Get upload URL
        const response = await fetch(compressedUri)
        const blob = await response.blob()
        const uploadResult = await productApi.getUploadUrl('product.jpg', 'image/jpeg', blob.size)
        const info = uploadResult.data

        // Mark as creating
        setStatuses((prev) => {
          const next = [...prev]
          next[i] = { state: 'creating' }
          return next
        })

        // Upload to R2
        await uploadImageToR2(compressedUri, info.upload_url, 'image/jpeg')

        // Create product
        const productResult = await productApi.create({
          photo_r2_key: info.r2_key,
          photo_url: info.public_url,
        })
        const productId = (productResult.data as { id: string }).id

        // Mark as done
        setStatuses((prev) => {
          const next = [...prev]
          next[i] = { state: 'done', productId }
          return next
        })
        doneCount++
        setCompleted(doneCount)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Import failed'
        setStatuses((prev) => {
          const next = [...prev]
          next[i] = { state: 'failed', error: message }
          return next
        })
        failCount++
        setFailed(failCount)
      }
    }

    // Invalidate product queries so catalog refreshes
    void queryClient.invalidateQueries({ queryKey: ['products'] })

    // All done — transition to summary screen
    setCompleted(doneCount)
    setFailed(failCount)
    setStep('done')
  }, [photos, queryClient])

  // ── Retry failed items ────────────────────────────────────────

  const handleRetry = useCallback(() => {
    const failedIndices = statuses
      .map((s, i) => (s.state === 'failed' ? i : -1))
      .filter((i) => i >= 0)

    if (failedIndices.length === 0) return

    // Keep only failed photos, reset
    const failedPhotos = failedIndices.map((i) => photos[i]!)
    setPhotos(failedPhotos)
    setStep('pick')
  }, [statuses, photos])

  // ── Status icon helper ────────────────────────────────────────

  const StatusIcon = ({ status }: { status: ImportStatus }) => {
    switch (status.state) {
      case 'pending':
        return <Text className="text-gray-300 text-base">⏳</Text>
      case 'uploading':
        return <ActivityIndicator size="small" color="#7C3AED" />
      case 'creating':
        return <ActivityIndicator size="small" color="#F59E0B" />
      case 'done':
        return <Check size={18} color="#10B981" />
      case 'failed':
        return <AlertTriangle size={18} color="#EF4444" />
    }
  }

  const StatusLabel = ({ status }: { status: ImportStatus }) => {
    switch (status.state) {
      case 'pending':
        return <Text className="text-xs text-gray-400">Pending</Text>
      case 'uploading':
        return <Text className="text-xs text-violet-600 font-medium">Uploading...</Text>
      case 'creating':
        return <Text className="text-xs text-amber-600 font-medium">Saving...</Text>
      case 'done':
        return <Text className="text-xs text-green-600 font-medium">Imported</Text>
      case 'failed':
        return (
          <Text className="text-xs text-red-500" numberOfLines={1}>
            {status.error}
          </Text>
        )
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => (step === 'importing' ? null : router.back())} disabled={step === 'importing'}>
          <X size={22} color={step === 'importing' ? '#D1D5DB' : '#374151'} />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">
          {step === 'pick' && 'Bulk Import'}
          {step === 'importing' && 'Importing...'}
          {step === 'done' && 'Import Complete'}
        </Text>
        <View className="w-6" />
      </View>

      {step === 'pick' && (
        <>
          {/* Photo grid */}
          <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 120 }}>
            {photos.length === 0 ? (
              <View className="items-center pt-20 gap-4">
                <View className="w-20 h-20 bg-violet-100 rounded-3xl items-center justify-center">
                  <Camera size={36} color="#7C3AED" />
                </View>
                <Text className="text-lg font-bold text-gray-900 text-center">
                  Import products in bulk
                </Text>
                <Text className="text-gray-500 text-sm text-center px-8 leading-5">
                  Select up to {MAX_BATCH_SIZE} photos from your gallery. AI will tag each product
                  automatically in the background.
                </Text>
                <TouchableOpacity
                  onPress={() => void handlePickPhotos()}
                  className="bg-violet-600 px-6 py-3.5 rounded-2xl flex-row items-center gap-2"
                  activeOpacity={0.8}
                >
                  <ImagePlus size={20} color="white" />
                  <Text className="text-white font-semibold">Select Photos</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View className="flex-row justify-between items-center mb-4">
                  <Text className="text-sm font-semibold text-gray-700">
                    {photos.length} photo{photos.length !== 1 ? 's' : ''} selected
                  </Text>
                  <TouchableOpacity
                    onPress={() => void handlePickPhotos()}
                    className="flex-row items-center gap-1"
                  >
                    <ImagePlus size={16} color="#7C3AED" />
                    <Text className="text-violet-600 text-sm font-medium">Add more</Text>
                  </TouchableOpacity>
                </View>

                <View className="flex-row flex-wrap gap-3">
                  {photos.map((photo, i) => (
                    <View key={`${photo.localUri}-${i}`} className="relative">
                      <Image
                        source={{ uri: photo.thumbUri }}
                        className="w-[30%] aspect-square rounded-xl bg-gray-200"
                        contentFit="cover"
                        style={{ width: (Dimensions.get('window').width - 48 - 6) / 3 }}
                      />
                      <TouchableOpacity
                        onPress={() => removePhoto(i)}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-gray-900/70 rounded-full items-center justify-center"
                      >
                        <X size={12} color="white" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </>
            )}
          </ScrollView>

          {/* Bottom bar */}
          <View className="bg-white border-t border-gray-100 px-4 py-4">
            <TouchableOpacity
              onPress={() => void handleImport()}
              disabled={photos.length === 0}
              className={`py-4 rounded-2xl items-center flex-row justify-center gap-2 ${
                photos.length > 0 ? 'bg-violet-600' : 'bg-gray-200'
              }`}
              activeOpacity={0.8}
            >
              <Upload size={18} color={photos.length > 0 ? 'white' : '#9CA3AF'} />
              <Text
                className={`font-bold text-base ${photos.length > 0 ? 'text-white' : 'text-gray-400'}`}
              >
                Import {photos.length > 0 ? `${photos.length} Product${photos.length !== 1 ? 's' : ''}` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {step === 'importing' && (
        <View className="flex-1 px-4 pt-4">
          {/* Overall progress */}
          <View className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-semibold text-gray-900">
                Importing {total} product{total !== 1 ? 's' : ''}
              </Text>
              <Text className="text-sm text-gray-500">
                {completed + failed}/{total}
              </Text>
            </View>
            {/* Progress bar */}
            <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <View
                className="h-full bg-violet-600 rounded-full"
                style={{ width: `${((completed + failed) / total) * 100}%` }}
              />
            </View>
            <Text className="text-xs text-gray-400 mt-2">
              {completed} succeeded{failed > 0 ? ` · ${failed} failed` : ''} · AI tagging runs in background
            </Text>
          </View>

          {/* Per-photo status list */}
          <FlatList
            data={photos}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item, index }) => {
              const status = statuses[index] ?? { state: 'pending' as const }
              return (
                <View className="flex-row items-center gap-3 py-3 border-b border-gray-100">
                  <Image
                    source={{ uri: item.thumbUri }}
                    className="w-10 h-10 rounded-lg bg-gray-200"
                    contentFit="cover"
                  />
                  <View className="flex-1">
                    <Text className="text-sm text-gray-700 truncate">
                      Photo {index + 1}
                    </Text>
                    <StatusLabel status={status} />
                  </View>
                  <StatusIcon status={status} />
                </View>
              )
            }}
            className="flex-1"
          />

          {/* Auto-advance spinner when complete */}
          {completed + failed === total && total > 0 && (
            <View className="bg-white border-t border-gray-100 px-0 py-6 items-center gap-2">
              <ActivityIndicator size="small" color="#7C3AED" />
              <Text className="text-sm text-gray-500">Finalizing...</Text>
            </View>
          )}
        </View>
      )}

      {step === 'done' && (
        <View className="flex-1 items-center justify-center px-8">
          <View className="w-24 h-24 bg-green-100 rounded-3xl items-center justify-center mb-6">
            <Text className="text-5xl">{failed > 0 ? '⚠️' : '🎉'}</Text>
          </View>

          <Text className="text-2xl font-bold text-gray-900 text-center">
            {failed > 0 ? 'Import complete with errors' : 'All products imported!'}
          </Text>
          <Text className="text-gray-500 text-base mt-2 text-center leading-5">
            {completed} product{completed !== 1 ? 's' : ''} added
            {failed > 0 ? ` · ${failed} failed` : ''}.
            {'\n'}AI is tagging them in the background.
          </Text>

          <View className="mt-8 w-full gap-3">
            {failed > 0 && (
              <TouchableOpacity
                onPress={() => handleRetry()}
                className="py-4 rounded-2xl items-center border-2 border-gray-200 flex-row justify-center gap-2"
                activeOpacity={0.7}
              >
                <AlertTriangle size={18} color="#374151" />
                <Text className="text-gray-700 font-semibold">Retry Failed ({failed})</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => {
                void queryClient.invalidateQueries({ queryKey: ['products'] })
                router.replace('/(tabs)')
              }}
              className="py-4 rounded-2xl items-center bg-violet-600"
              activeOpacity={0.8}
            >
              <Text className="text-white font-bold">View Catalog</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}


