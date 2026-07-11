import { useState, useRef, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X,
  Camera,
  ImagePlus,
  Check,
  Share2,
  RefreshCw,
} from 'lucide-react-native'
import ProductCard from '../../src/components/ProductCard'
import { productApi, tryOnApi, uploadImageToR2, readLocalImage } from '../../src/lib/api'

type Step = 'select' | 'capture' | 'preview' | 'uploading' | 'processing' | 'result'

type Product = {
  id: string
  category: string | null
  primary_color: string | null
  primary_photo_url: string | null
  price_min: number | null
  price_max: number | null
  status: string
}

export default function InStoreTryOnScreen() {
  const insets = useSafeAreaInsets()
  const { productId: preselectedProductId } = useLocalSearchParams<{ productId?: string }>()
  const [step, setStep] = useState<Step>(preselectedProductId ? 'capture' : 'select')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [customerPhotoUri, setCustomerPhotoUri] = useState<string | null>(null)
  const [tryOnJobId, setTryOnJobId] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [processingPhoto, setProcessingPhoto] = useState(false)

  const cameraRef = useRef<CameraView>(null)
  const queryClient = useQueryClient()

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'list'],
    queryFn: () => productApi.list({ limit: 50 }),
    staleTime: 30_000,
  })

  const products: Product[] = ((productsData as { data: Product[] } | undefined)?.data ?? [])
    .filter((p) => p.status === 'AVAILABLE')

  // ── Load preselected product ─────────────────────────────────

  const [selectedProductLoading, setSelectedProductLoading] = useState(!!preselectedProductId)

  useEffect(() => {
    if (!preselectedProductId) return

    setSelectedProductLoading(true)

    // First try to find it in the already-loaded products list
    const found = products.find((p) => p.id === preselectedProductId)
    if (found) {
      setSelectedProduct(found)
      setSelectedProductLoading(false)
      return
    }

    // If not in list, fetch individually
    productApi
      .get(preselectedProductId)
      .then((res) => {
        const p = (res as { data: Product }).data
        setSelectedProduct(p)
        setSelectedProductLoading(false)
      })
      .catch(() => {
        setError('Could not load product. Please try again.')
        setSelectedProductLoading(false)
        setStep('select')
      })
  }, [preselectedProductId, products]) // eslint-disable-line react-hooks/exhaustive-deps
  // products in deps so the find() retries after the list loads

  // ── Capture customer photo ───────────────────────────────────

  const handleCapture = async () => {
    if (!cameraRef.current) return
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 })
      if (!photo?.uri) {
        Alert.alert('Camera Error', 'Could not capture photo. Try again.')
        return
      }
      await processPhoto(photo.uri)
    } catch (err) {
      Alert.alert('Camera Error', err instanceof Error ? err.message : 'Could not capture photo')
    }
  }

  const handlePickFromGallery = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Gallery access is needed to select a photo.')
        return
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      })
      if (result.canceled) return
      if (!result.assets[0]?.uri) {
        Alert.alert('Selection Error', 'Could not read the selected photo. Try again.')
        return
      }
      await processPhoto(result.assets[0].uri)
    } catch (err) {
      Alert.alert('Gallery Error', err instanceof Error ? err.message : 'Could not open gallery')
    }
  }

  const processPhoto = async (uri: string) => {
    setProcessingPhoto(true)
    try {
      // A cloud-only gallery photo (iCloud "Optimize Storage", unsynced
      // Google Photos) can leave manipulateAsync hanging with no error —
      // race it against a timeout so the screen never looks frozen.
      const compressed = await Promise.race([
        ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), 15_000),
        ),
      ])
      setCustomerPhotoUri(compressed.uri)
      setStep('preview')
    } catch (err) {
      const timedOut = err instanceof Error && err.message === 'TIMEOUT'
      Alert.alert(
        'Could not use this photo',
        timedOut
          ? 'This looks like a cloud-only photo. Download it to your device first, then try again.'
          : 'Please pick a different photo and try again.',
      )
    } finally {
      setProcessingPhoto(false)
    }
  }

  // ── Run try-on ──────────────────────────────────────────────

  const handleRunTryOn = async () => {
    if (!customerPhotoUri) {
      setError('No customer photo. Please capture or select a photo first.')
      return
    }
    if (!selectedProduct) {
      setError('No product selected. Please go back and select a product.')
      return
    }
    setStep('uploading')
    setError(null)

    try {
      // Get presigned URL for customer photo
      const blob = await readLocalImage(customerPhotoUri)
      const uploadResult = await tryOnApi.getUploadUrl('image/jpeg', blob.size)
      const { upload_url, r2_key, public_url } = uploadResult.data

      // Upload customer photo to R2
      await uploadImageToR2(customerPhotoUri, upload_url, 'image/jpeg')

      // Sanity check the object landed — RN's fetch() often doesn't expose
      // Content-Length on HEAD responses through the CDN, so only fail on an
      // unambiguous signal (non-2xx, or an explicit 0-byte object). A missing
      // header is inconclusive, not a failure.
      const verifyResp = await fetch(public_url, { method: 'HEAD' })
      const contentLength = verifyResp.headers.get('content-length')
      if (!verifyResp.ok || contentLength === '0') {
        throw new Error('Photo upload was incomplete. Please try again.')
      }

      // Initiate try-on
      const initiateResult = await tryOnApi.initiate(selectedProduct.id, r2_key)
      const jobId = initiateResult.data.id
      setTryOnJobId(jobId)
      setStep('processing')

      // Poll for result
      const pollInterval = setInterval(async () => {
        try {
          const jobResult = await tryOnApi.getJob(jobId)
          const job = jobResult.data

          if (job.status === 'COMPLETED') {
            clearInterval(pollInterval)
            setResultUrl(job.result_url)
            setStep('result')
          } else if (job.status === 'FAILED') {
            clearInterval(pollInterval)
            setError(job.error_message ?? 'Try-on failed')
            setStep('preview')
          }
        } catch {
          clearInterval(pollInterval)
          setError('Failed to check try-on status')
          setStep('preview')
        }
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Try-on failed')
      setStep('preview')
    }
  }

  // ── Camera permission ───────────────────────────────────────

  if (!permission) return <View className="flex-1 bg-black" />

  if (!permission.granted && step === 'capture') {
    return (
      <View className="flex-1 bg-black items-center justify-center px-8">
        <Text className="text-white text-center text-base mb-6">
          Camera access needed to capture customer photo for try-on
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

  return (
    <View className="flex-1 bg-cyan-50">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-gray-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <X size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">
          {step === 'select' && 'Select Product'}
          {step === 'capture' && 'Capture Customer'}
          {step === 'preview' && 'Review & Try-On'}
          {step === 'uploading' && 'Uploading...'}
          {step === 'processing' && 'AI is Working...'}
          {step === 'result' && 'Try-On Result'}
        </Text>
        <View className="w-6" />
      </View>

      {/* Step: Select Product */}
      {step === 'select' && (
        <>
          {preselectedProductId ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#0891B2" />
            </View>
          ) : (
            <ScrollView className="flex-1 px-4 pt-4">
              <Text className="text-gray-500 text-sm mb-4">
                Select a product for the customer to try on
              </Text>
              {productsLoading ? (
                <ActivityIndicator className="mt-8" color="#0891B2" />
              ) : (
                <View className="flex-row flex-wrap gap-3">
                  {products.map((p) => (
                    <ProductCard
                      key={p.id}
                      imageUrl={p.primary_photo_url}
                      onPress={() => {
                        setSelectedProduct(p)
                        setStep('capture')
                      }}
                      flex={false}
                      style={{ width: '47%' }}
                      placeholderIcon="👕"
                      footer={
                        <View className="p-2">
                          <Text className="text-xs text-gray-500 truncate">
                            {p.category ?? 'Product'}
                          </Text>
                          <Text className="text-xs text-gray-700" numberOfLines={1}>
                            {p.primary_color ?? ''}
                          </Text>
                        </View>
                      }
                    />
                  ))}
                </View>
              )}
              <View className="h-8" />
            </ScrollView>
          )}
        </>
      )}

      {/* Step: Capture customer photo */}
      {step === 'capture' && (
        <View className="flex-1 bg-black">
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

          <TouchableOpacity
            onPress={() => setStep('select')}
            className="absolute left-4 w-10 h-10 bg-black/50 rounded-full items-center justify-center"
            style={{ top: insets.top + 8 }}
          >
            <X size={20} color="white" />
          </TouchableOpacity>

          <View className="absolute left-0 right-0 items-center" style={{ top: insets.top + 8 }}>
            <Text className="text-white text-sm font-semibold bg-black/50 px-3 py-1 rounded-full">
              Customer Photo · Full body
            </Text>
          </View>

          {/* Frame guide */}
          <View className="flex-1 items-center justify-center">
            <View className="w-64 h-96 border-2 border-white/40 rounded-3xl" />
            <Text className="text-white/60 text-sm mt-4">Full body, front facing, good lighting</Text>
          </View>

          {/* Controls */}
          <View className="items-center gap-6" style={{ paddingBottom: 48 + insets.bottom }}>
            <View className="flex-row items-center gap-10">
              <TouchableOpacity
                onPress={() => void handlePickFromGallery()}
                disabled={processingPhoto}
                className="w-14 h-14 bg-white/20 rounded-2xl items-center justify-center"
              >
                <ImagePlus size={24} color="white" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => void handleCapture()}
                disabled={processingPhoto}
                className="w-20 h-20 rounded-full border-4 border-white items-center justify-center"
              >
                <View className="w-14 h-14 bg-white rounded-full" />
              </TouchableOpacity>

              <View className="w-14" />
            </View>
            <Text className="text-white/50 text-xs">Tap to capture · Gallery to import</Text>
          </View>

          {processingPhoto && (
            <View className="absolute inset-0 bg-black/60 items-center justify-center gap-3">
              <ActivityIndicator size="large" color="white" />
              <Text className="text-white text-sm">Processing photo...</Text>
            </View>
          )}
        </View>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <View className="flex-1 px-4 pt-4">
          {error && (
            <View className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-4">
              <Text className="text-red-700 text-sm">{error}</Text>
            </View>
          )}

          <View className="flex-row gap-4">
            {/* Selected product */}
            {selectedProduct?.primary_photo_url && (
              <View className="flex-1">
                <Text className="text-xs text-gray-500 font-medium mb-2">Product</Text>
                <View className="aspect-[3/4] bg-gray-100 rounded-2xl overflow-hidden">
                  <Image
                    source={{ uri: selectedProduct.primary_photo_url }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                </View>
              </View>
            )}
            {/* Customer photo */}
            {customerPhotoUri && (
              <View className="flex-1">
                <Text className="text-xs text-gray-500 font-medium mb-2">Customer</Text>
                <View className="aspect-[3/4] bg-gray-100 rounded-2xl overflow-hidden">
                  <Image
                    source={{ uri: customerPhotoUri }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                </View>
              </View>
            )}
          </View>

          <View className="mt-6 gap-3">
            <TouchableOpacity
              onPress={() => void handleRunTryOn()}
              className="bg-cyan-600 py-4 rounded-2xl items-center"
              activeOpacity={0.8}
            >
              <Text className="text-white font-bold">✨ Try This On!</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setStep('capture')}
              className="py-3 rounded-2xl items-center border border-gray-200"
            >
              <Text className="text-gray-600 font-medium">Retake Photo</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step: Uploading */}
      {step === 'uploading' && (
        <View className="flex-1 items-center justify-center gap-4">
          <ActivityIndicator size="large" color="#0891B2" />
          <Text className="text-gray-900 font-semibold">Uploading customer photo...</Text>
        </View>
      )}

      {/* Step: Processing */}
      {step === 'processing' && (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <View className="w-20 h-20 bg-cyan-100 rounded-3xl items-center justify-center">
            <RefreshCw size={36} color="#0891B2" />
          </View>
          <Text className="text-gray-900 text-lg font-bold text-center">AI is working its magic...</Text>
          <Text className="text-gray-500 text-sm text-center">
            Generating a try-on preview. This takes about 10-20 seconds.
          </Text>
          <ActivityIndicator size="small" color="#0891B2" />
        </View>
      )}

      {/* Step: Result */}
      {step === 'result' && (
        <View className="flex-1 px-4 pt-4">
          <View className="flex-row gap-4 mb-6">
            {/* Side by side */}
            {selectedProduct?.primary_photo_url && (
              <View className="flex-1">
                <Text className="text-xs text-gray-500 font-medium mb-2">Original</Text>
                <View className="aspect-[3/4] bg-gray-100 rounded-2xl overflow-hidden">
                  <Image
                    source={{ uri: selectedProduct.primary_photo_url }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                </View>
              </View>
            )}
            {resultUrl && (
              <View className="flex-1">
                <Text className="text-xs text-cyan-600 font-medium mb-2">Try-On ✨</Text>
                <View className="aspect-[3/4] bg-gray-100 rounded-2xl overflow-hidden border-2 border-cyan-300">
                  <Image
                    source={{ uri: resultUrl }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                </View>
              </View>
            )}
          </View>

          <View className="gap-3">
            <TouchableOpacity
              onPress={() => {
                // Share the result
                router.back()
              }}
              className="bg-cyan-600 py-4 rounded-2xl items-center flex-row justify-center gap-2"
              activeOpacity={0.8}
            >
              <Share2 size={18} color="white" />
              <Text className="text-white font-bold">Share with Customer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setResultUrl(null)
                setCustomerPhotoUri(null)
                setError(null)
                setStep(preselectedProductId ? 'capture' : 'select')
              }}
              className="py-3 rounded-2xl items-center border border-gray-200"
            >
              <Text className="text-gray-600 font-medium">Try Another</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}
