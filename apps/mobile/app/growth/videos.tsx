import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { ChevronLeft, ChevronRight, Clapperboard, Plus, Search, Star, Trash2, Upload } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { productApi } from '../../src/lib/api'
import { growthApi, type ProductVideo } from '../../src/lib/api/growth'
import { readLocalImage, uploadImageToR2 } from '../../src/lib/api/client'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

type PickedProduct = {
  id: string
  name: string | null
  sku: string | null
}

export default function VideosScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<PickedProduct | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)

  const productsQuery = useQuery({
    queryKey: ['products', 'list', 'growth-videos', search],
    queryFn: () => productApi.list({ status: 'AVAILABLE', limit: 30, ...(search.trim() ? { sku: search.trim() } : {}) }),
    enabled: !picked,
  })
  const products = ((productsQuery.data?.data ?? []) as (PickedProduct & { name: string | null; sku: string | null })[])

  const videosQuery = useQuery({
    queryKey: ['growth', 'videos', picked?.id],
    queryFn: () => growthApi.productVideos(picked!.id),
    enabled: !!picked,
  })
  const videos = videosQuery.data?.data ?? []

  const setMain = useMutation({
    mutationFn: (video: ProductVideo) =>
      growthApi.registerVideo(video.product_id, {
        r2_key: video.r2_key,
        public_url: video.public_url,
        duration_sec: video.duration_sec ?? undefined,
        is_main: true,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['growth', 'videos'] }),
    onError: (err) => showError(err, 'Failed to set main video'),
  })

  const remove = useMutation({
    mutationFn: (videoId: string) => growthApi.deleteVideo(videoId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['growth', 'videos'] }),
    onError: (err) => showError(err, 'Failed to delete video'),
  })

  const handleUpload = async () => {
    if (!picked) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 1,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    setUploading(true)
    setUploadPct(0)
    try {
      const file = await readLocalImage(asset.uri)
      if (file.size > 50_000_000) {
        Alert.alert('Video too large', 'Keep clips under 50MB (about 5–10 seconds).')
        setUploading(false)
        return
      }
      const contentType: 'video/mp4' | 'video/webm' | 'video/quicktime' =
        asset.mimeType === 'video/webm'
          ? 'video/webm'
          : asset.mimeType === 'video/quicktime' || asset.fileName?.endsWith('.mov')
            ? 'video/quicktime'
            : 'video/mp4'
      const urlRes = await growthApi.videoUploadUrl(picked.id, {
        filename: asset.fileName ?? 'clip.mp4',
        content_type: contentType,
        size_bytes: file.size,
      })
      const info = urlRes.data
      await uploadImageToR2(asset.uri, info.upload_url, contentType, 120_000, (f) =>
        setUploadPct(Math.round(f * 100)),
      )
      await growthApi.registerVideo(picked.id, { r2_key: info.r2_key, public_url: info.public_url })
      await queryClient.invalidateQueries({ queryKey: ['growth', 'videos'] })
      setUploading(false)
      setUploadPct(0)
    } catch (err) {
      setUploading(false)
      setUploadPct(0)
      showError(err, 'Could not upload video')
    }
  }

  const confirmDelete = (v: ProductVideo) => {
    Alert.alert('Delete video?', 'Remove this clip from the product.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(v.id) },
    ])
  }

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => (picked ? setPicked(null) : router.back())}
            hitSlop={8}
            accessibilityLabel={picked ? 'Back to products' : 'Go back'}
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900 flex-1">
            {picked ? picked.name ?? 'Product' : 'Product Videos'}
          </Text>
        </View>
      </View>

      {!picked ? (
        <View className="flex-1">
          {/* Search */}
          <View className="bg-white border-b border-sand-100 px-4 py-3 flex-row items-center gap-2">
            <Search size={16} color={colors.sand[400]} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or SKU…"
              placeholderTextColor={colors.sand[400]}
              className="flex-1 text-sm text-sand-900"
            />
          </View>
          <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
            {productsQuery.isLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator color={primaryColor} />
              </View>
            ) : products.length === 0 ? (
              <View className="items-center py-10">
                <Clapperboard size={28} color={colors.sand[300]} />
                <Text className="text-sm text-sand-400 mt-3 text-center max-w-[260px]">
                  No available products found. Videos are added per product — pick one to start.
                </Text>
              </View>
            ) : (
              <View className="gap-2.5">
                {products.map((p) => (
                  <AnimatedPressable
                    key={p.id}
                    onPress={() => setPicked({ id: p.id, name: p.name, sku: p.sku })}
                    accessibilityRole="button"
                    className="bg-white rounded-2xl p-4 border border-sand-100 flex-row items-center"
                  >
                    <View
                      className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                      style={{ backgroundColor: `${primaryColor}1A` }}
                    >
                      <Clapperboard size={18} color={primaryColor} />
                    </View>
                    <View className="flex-1 mr-2">
                      <Text className="text-sm font-semibold text-sand-900" numberOfLines={1}>
                        {p.name ?? 'Unnamed product'}
                      </Text>
                      {p.sku ? <Text className="text-xs text-sand-400">{p.sku}</Text> : null}
                    </View>
                    <ChevronRight size={16} color={colors.sand[300]} />
                  </AnimatedPressable>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
          {videosQuery.isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator color={primaryColor} />
            </View>
          ) : (
            <>
              {videos.length > 0 && (
                <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide px-1 mb-2.5">
                  {videos.length} of 3 clips
                </Text>
              )}
              <View className="gap-2.5 mb-4">
                {videos.map((v) => (
                  <View key={v.id} className="bg-white rounded-2xl p-4 border border-sand-100">
                    <View className="flex-row items-center gap-2 mb-2">
                      {v.is_main && (
                        <View className="flex-row items-center gap-1 bg-turmeric-50 rounded-full px-2.5 py-1">
                          <Star size={11} color={colors.turmeric[600]} />
                          <Text className="text-[10px] font-semibold text-turmeric-700">Main</Text>
                        </View>
                      )}
                      <Text className="text-[11px] text-sand-400 flex-1">
                        {v.duration_sec ? `${v.duration_sec}s clip` : 'Video clip'}
                      </Text>
                      <AnimatedPressable
                        onPress={() => setMain.mutate(v)}
                        hitSlop={8}
                        accessibilityLabel="Set as main video"
                        accessibilityRole="button"
                      >
                        <Text className="text-[11px] font-semibold" style={{ color: primaryColor }}>
                          Set main
                        </Text>
                      </AnimatedPressable>
                      <AnimatedPressable
                        onPress={() => confirmDelete(v)}
                        hitSlop={8}
                        accessibilityLabel="Delete video"
                        accessibilityRole="button"
                      >
                        <Trash2 size={15} color={colors.rust[500]} />
                      </AnimatedPressable>
                    </View>
                  </View>
                ))}
              </View>
              {videos.length >= 3 ? (
                <View className="bg-sand-100 rounded-2xl p-4">
                  <Text className="text-xs text-sand-500 text-center">
                    Maximum 3 videos per product reached.
                  </Text>
                </View>
              ) : (
                <GradientButton
                  label={uploading ? `Uploading… ${uploadPct}%` : '+ Add Video'}
                  onPress={() => void handleUpload()}
                  loading={uploading}
                  icon={<Upload size={16} color="white" />}
                />
              )}
              <Text className="text-[11px] text-sand-400 text-center mt-3 leading-4">
                5–10 second clips (max 50MB, MP4 preferred). They appear on your customer storefront.
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}
