import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { ChevronLeft, ChevronRight, Clapperboard, Sparkles, Star, Trash2, Upload, Search } from 'lucide-react-native'
import { useState, useEffect, useRef } from 'react'
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { productApi } from '../../src/lib/api'
import { growthApi, type ProductVideo } from '../../src/lib/api/growth'
import { readLocalImage, uploadImageToR2 } from '../../src/lib/api/client'
import { showError } from '../../src/lib/errors'

type PickedProduct = {
  id: string
  name: string | null
  sku: string | null
}

export default function VideosScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<PickedProduct | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)

  // Ken Burns 6s auto-slideshow generated server-side from product photos.
  const [generating, setGenerating] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoEtaMs, setVideoEtaMs] = useState(0)

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
    refetchInterval: generating ? 1200 : false,
  })
  const videos = videosQuery.data?.data ?? []
  const prevVideoCountRef = useRef(videos.length)

  // Smooth progress animation for video generation
  useEffect(() => {
    if (!generating) return
    setVideoProgress(15)
    setVideoEtaMs(3500)
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      if (elapsed < 3000) {
        const pct = Math.min(Math.round(15 + (elapsed / 3000) * 75), 90)
        setVideoProgress(pct)
        setVideoEtaMs(Math.max(3000 - elapsed, 500))
      } else {
        setVideoProgress(95)
        setVideoEtaMs(0)
      }
    }, 150)
    return () => clearInterval(interval)
  }, [generating])

  useEffect(() => {
    if (generating && videos.length > prevVideoCountRef.current) {
      setVideoProgress(100)
      setVideoEtaMs(0)
      const timer = setTimeout(() => {
        setGenerating(false)
        setVideoProgress(0)
      }, 600)
      return () => clearTimeout(timer)
    }
    prevVideoCountRef.current = videos.length
  }, [videos.length, generating])

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

  const generate = useMutation({
    mutationFn: () => growthApi.generateVideo(picked!.id),
    onMutate: () => {
      setGenerating(true)
      setVideoProgress(10)
      setVideoEtaMs(3500)
    },
    onSuccess: () => {
      setGenerating(true)
      void queryClient.invalidateQueries({ queryKey: ['growth', 'videos'] })
    },
    onError: (err) => {
      setGenerating(false)
      setVideoProgress(0)
      setVideoEtaMs(0)
      showError(err, 'Could not start video generation')
    },
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
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => (picked ? setPicked(null) : router.back())}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
            accessibilityLabel={picked ? 'Back to products' : 'Go back'}
            accessibilityRole="button"
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-xl font-bold text-spaceCadet-900 flex-1"
          >
            {picked ? picked.name ?? 'Product' : 'Reels & Video Showcase'}
          </Text>
        </View>
      </View>

      {!picked ? (
        <View className="flex-1">
          {/* Search */}
          <View className="bg-white border-b border-lavender-200 px-5 py-3 flex-row items-center gap-2.5">
            <Search size={16} color="#928EB2" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search design name or SKU…"
              placeholderTextColor="#928EB2"
              className="flex-1 text-sm font-bold text-spaceCadet-900"
            />
          </View>
          <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
            {productsQuery.isLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator color="#BB3F95" />
              </View>
            ) : products.length === 0 ? (
              <View className="items-center py-10">
                <Clapperboard size={32} color="#BB3F95" />
                <Text className="text-xs text-heliotrope-500 mt-3 text-center max-w-[260px] font-medium">
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
                    className="bg-white rounded-3xl p-4 border border-lavender-200 flex-row items-center shadow-sm"
                  >
                    <View
                      className="w-10 h-10 rounded-2xl items-center justify-center mr-3 bg-lavender-100 border border-lavender-200"
                    >
                      <Clapperboard size={18} color="#BB3F95" />
                    </View>
                    <View className="flex-1 mr-2">
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                        className="text-base font-bold text-spaceCadet-900"
                        numberOfLines={1}
                      >
                        {p.name ?? 'Unnamed design'}
                      </Text>
                      {p.sku ? <Text className="text-xs text-heliotrope-500 font-medium mt-0.5">{p.sku}</Text> : null}
                    </View>
                    <ChevronRight size={16} color="#928EB2" />
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
              <ActivityIndicator color="#BB3F95" />
            </View>
          ) : (
            <>
              {videos.length > 0 && (
                <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider px-1 mb-2.5">
                  {videos.length} of 3 video clips
                </Text>
              )}
              <View className="gap-3 mb-4">
                {videos.map((v) => (
                  <View key={v.id} className="bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm">
                    <View className="flex-row items-center gap-2">
                      {v.is_main && (
                        <View className="flex-row items-center gap-1 bg-fuchsia-500/10 rounded-full px-2.5 py-1 border border-fuchsia-500/20">
                          <Star size={11} color="#BB3F95" />
                          <Text className="text-[10px] font-bold text-fuchsia-700">Primary Showcase</Text>
                        </View>
                      )}
                      <Text className="text-xs text-heliotrope-500 font-medium flex-1">
                        {v.duration_sec ? `${v.duration_sec}s clip` : 'Video clip'}
                      </Text>
                      <AnimatedPressable
                        onPress={() => setMain.mutate(v)}
                        hitSlop={8}
                        accessibilityLabel="Set as main video"
                        accessibilityRole="button"
                        className="bg-lavender-100 rounded-full px-3 py-1 border border-lavender-200"
                      >
                        <Text className="text-[10px] font-bold text-spaceCadet-900">
                          Set primary
                        </Text>
                      </AnimatedPressable>
                      <AnimatedPressable
                        onPress={() => confirmDelete(v)}
                        hitSlop={8}
                        accessibilityLabel="Delete video"
                        accessibilityRole="button"
                      >
                        <Trash2 size={16} color="#dc2626" />
                      </AnimatedPressable>
                    </View>
                  </View>
                ))}
              </View>
              {videos.length >= 3 ? (
                <View className="bg-lavender-50 border border-lavender-200 rounded-3xl p-4">
                  <Text className="text-xs font-medium text-heliotrope-500 text-center">
                    Maximum 3 video clips per product reached.
                  </Text>
                </View>
              ) : (
                <>
                  <GradientButton
                    label={uploading ? `Uploading clip… ${uploadPct}%` : '+ Add Video Clip'}
                    onPress={() => void handleUpload()}
                    loading={uploading}
                    icon={<Upload size={16} color="white" />}
                  />
                  {generating ? (
                    <View className="bg-white border border-lavender-200 rounded-3xl p-4 mt-3 shadow-sm">
                      <View className="flex-row items-center gap-2">
                        <ActivityIndicator size="small" color="#BB3F95" />
                        <Text className="text-xs text-spaceCadet-900 flex-1 font-bold">
                          {videoProgress >= 100
                            ? 'Video ready! 100%'
                            : videoProgress > 0
                              ? `Creating 6s cinematic video... ${videoProgress}%`
                              : 'Creating 6s cinematic video...'}
                        </Text>
                        {videoEtaMs > 0 && videoProgress < 100 && (
                          <Text className="text-[10px] text-heliotrope-400 font-medium">
                            ~{Math.ceil(videoEtaMs / 1000)}s left
                          </Text>
                        )}
                      </View>
                      {/* Progress bar */}
                      <View className="mt-2.5 h-2 bg-lavender-100 rounded-full overflow-hidden">
                        <View
                          className="h-full rounded-full bg-fuchsia-600"
                          style={{
                            width: `${Math.min(Math.max(videoProgress, 5), 100)}%`,
                          }}
                        />
                      </View>
                    </View>
                  ) : (
                    <AnimatedPressable
                      onPress={() => generate.mutate()}
                      disabled={generate.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Generate video from photos"
                      className="flex-row items-center justify-center gap-2 bg-white border border-lavender-200 rounded-3xl py-3.5 mt-3 shadow-sm"
                    >
                      <Sparkles size={16} color="#BB3F95" />
                      <Text className="text-sm font-bold text-spaceCadet-900">
                        ✨ Generate 6s Ken Burns Video from Photos
                      </Text>
                    </AnimatedPressable>
                  )}
                </>
              )}
              <Text className="text-[11px] text-heliotrope-400 text-center mt-3.5 leading-relaxed font-medium">
                5–10 second clips (max 50MB, MP4 preferred). Featured on your customer web & mobile boutique storefront.
              </Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}
