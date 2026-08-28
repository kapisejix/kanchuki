import { useState, useRef, useEffect, useCallback } from 'react'
import { Alert } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as LegacyFileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import type { ProductDetail } from '@kanchuki/shared'
import { productApi, ApiError } from '../lib/api'
import { growthApi } from '../lib/api/growth'
import { showError } from '../lib/errors'
import { pollWithBackoff } from '../lib/polling'

interface UseProductAiStudioProps {
  product: ProductDetail | undefined
  currentPhoto: { id: string; url: string; is_video?: boolean } | undefined
  currentPhotoIsOriginal: boolean
  displayPhotos: Array<{ id: string; url: string; is_video?: boolean; is_primary?: boolean }>
  selectedPhotoIndex: number
  setSelectedPhotoIndex: (index: number) => void
  setPhotoCacheBust: React.Dispatch<React.SetStateAction<Record<string, number>>>
}

export function useProductAiStudio({
  product,
  currentPhoto,
  currentPhotoIsOriginal,
  displayPhotos,
  selectedPhotoIndex,
  setSelectedPhotoIndex,
  setPhotoCacheBust,
}: UseProductAiStudioProps) {
  const queryClient = useQueryClient()

  // Studio modal & shoot generation states
  const [studioModalOpen, setStudioModalOpen] = useState(false)
  const [studioStarting, setStudioStarting] = useState(false)
  const [studioJob, setStudioJob] = useState<{ jobId: string; photoId: string } | null>(null)
  const [studioStatus, setStudioStatus] = useState<'processing' | 'ready' | 'failed' | null>(null)
  const [studioError, setStudioError] = useState<string | null>(null)
  const [studioUpgradeRequired, setStudioUpgradeRequired] = useState(false)
  const [studioResult, setStudioResult] = useState<{ photoId: string; url: string } | null>(null)
  const [studioProgress, setStudioProgress] = useState<number>(0)
  const [studioEtaMs, setStudioEtaMs] = useState<number>(0)
  const [studioTab, setStudioTab] = useState<'scenes' | 'models'>('scenes')

  // Background and shadow preferences
  const [photoBackgrounds, setPhotoBackgrounds] = useState<Record<string, string | null>>({})
  const [backgroundSaving, setBackgroundSaving] = useState(false)
  const [photoShadows, setPhotoShadows] = useState<Record<string, boolean>>({})
  const [shadowSaving, setShadowSaving] = useState(false)
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null)
  const [downloadingMedia, setDownloadingMedia] = useState(false)
  const [deletingMedia, setDeletingMedia] = useState(false)

  // Primary non-studio photo
  const originalPhoto =
    (product?.photos ?? []).find((p) => p.is_primary && !p.metadata?.studio) ||
    (product?.photos ?? []).find((p) => !p.metadata?.studio) ||
    product?.photos?.[0]

  // Studio quota query
  const { data: studioQuotaData, refetch: refetchStudioQuota } = useQuery({
    queryKey: ['studio-quota', product?.id, originalPhoto?.id],
    queryFn: () =>
      product && originalPhoto ? productApi.getStudioShootQuota(product.id, originalPhoto.id) : null,
    enabled: Boolean(product && originalPhoto),
  })
  const studioQuota = studioQuotaData?.data

  // Product videos query
  const [videoGenerating, setVideoGenerating] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoEtaMs, setVideoEtaMs] = useState(0)

  const videosQuery = useQuery({
    queryKey: ['growth', 'videos', product?.id],
    queryFn: () => (product ? growthApi.productVideos(product.id) : null),
    enabled: Boolean(product),
    refetchInterval: videoGenerating ? 1200 : false,
  })
  const productVideos = videosQuery.data?.data ?? product?.videos ?? []
  const prevVideoCountRef = useRef(productVideos.length)

  // Video progress animation
  useEffect(() => {
    if (!videoGenerating) return
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
  }, [videoGenerating])

  useEffect(() => {
    if (videoGenerating && productVideos.length > prevVideoCountRef.current) {
      setVideoProgress(100)
      setVideoEtaMs(0)
      const timer = setTimeout(() => {
        setVideoGenerating(false)
        setVideoProgress(0)
      }, 600)
      return () => clearTimeout(timer)
    }
    prevVideoCountRef.current = productVideos.length
  }, [productVideos.length, videoGenerating])

  const generateVideo = useMutation({
    mutationFn: () => growthApi.generateVideo(product!.id),
    onMutate: () => {
      setVideoGenerating(true)
      setVideoProgress(10)
      setVideoEtaMs(3500)
    },
    onSuccess: () => {
      setVideoGenerating(true)
      void queryClient.invalidateQueries({ queryKey: ['growth', 'videos', product?.id] })
      void queryClient.invalidateQueries({ queryKey: ['product', product?.id] })
    },
    onError: (err) => {
      setVideoGenerating(false)
      showError(err, 'Failed to generate product video')
    },
  })

  const handleProductVideoPress = () => {
    if (!product || generateVideo.isPending || videoGenerating) return
    Alert.alert(
      'Product Video',
      'Generate a 6-second dynamic Pan/Zoom catalog video for this product?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Generate Video', onPress: () => generateVideo.mutate() },
      ],
    )
  }

  const handleStartStudioShoot = async (
    template: string,
    options?: { engine?: string; model_id?: string },
  ) => {
    const photo = currentPhoto && !currentPhotoIsOriginal ? currentPhoto : originalPhoto
    if (!product || !photo) return
    setStudioModalOpen(false)
    setStudioStarting(true)
    setStudioError(null)
    setStudioUpgradeRequired(false)
    setStudioResult(null)
    try {
      const res = await productApi.startStudioShoot(product.id, photo.id, template, options)
      setStudioJob({ jobId: res.data.job_id, photoId: photo.id })
      setStudioStatus('processing')
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'FEATURE_UNAVAILABLE' || err.code === 'PLAN_LIMIT_EXCEEDED')
      ) {
        setStudioStatus('failed')
        setStudioError(err.message)
        setStudioUpgradeRequired(true)
      } else {
        showError(err, 'Could not start the studio shoot')
        setStudioStatus(null)
      }
    } finally {
      setStudioStarting(false)
    }
  }

  // Poll studio shoot job with backoff
  useEffect(() => {
    if (!product || !studioJob || studioStatus !== 'processing') return
    const stopPolling = pollWithBackoff({
      initialMs: 2000,
      maxMs: 16_000,
      maxAttempts: 60,
      onPoll: async () => {
        const res = await productApi.getStudioShootStatus(
          product.id,
          studioJob.photoId,
          studioJob.jobId,
        )
        const s = res.data
        if (s.status === 'ready' && s.photo_id && s.url) {
          setStudioStatus('ready')
          setStudioResult({ photoId: s.photo_id, url: s.url })
          setStudioProgress(100)
          setStudioEtaMs(0)
          void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
          void refetchStudioQuota()
          return true
        } else if (s.status === 'failed') {
          setStudioStatus('failed')
          setStudioError(s.error ?? 'The studio shoot failed. Please try again.')
          return true
        }
        if (s.progress != null) setStudioProgress(s.progress)
        if (s.etaMs != null) setStudioEtaMs(s.etaMs)
        return false
      },
    })
    return stopPolling
  }, [product, studioJob, studioStatus, queryClient, refetchStudioQuota])

  const handleSetPrimary = async (photoId: string) => {
    if (!product) return
    setSettingPrimaryId(photoId)
    try {
      await productApi.setPhotoPrimary(product.id, photoId)
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch (err) {
      showError(err, 'Failed to set main photo')
    } finally {
      setSettingPrimaryId(null)
    }
  }

  const handleSetBackground = async (bgId: string | null) => {
    if (!product || !currentPhoto || currentPhotoIsOriginal || backgroundSaving) return
    setBackgroundSaving(true)
    const photoId = currentPhoto.id
    try {
      await productApi.cleanupPhoto(product.id, photoId, bgId, shadowFor(photoId))
      setPhotoBackgrounds((prev) => ({ ...prev, [photoId]: bgId }))
      setPhotoCacheBust((prev) => ({ ...prev, [photoId]: Date.now() }))
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      showError(err, 'Failed to change background')
    } finally {
      setBackgroundSaving(false)
    }
  }

  const shadowFor = useCallback(
    (photoId: string) => photoShadows[photoId] ?? product?.add_shadow ?? false,
    [photoShadows, product],
  )

  const handleSetShadow = async (shadow: boolean) => {
    if (!product || !currentPhoto || currentPhotoIsOriginal || shadowSaving) return
    setShadowSaving(true)
    const photoId = currentPhoto.id
    try {
      const currentBgId = photoBackgrounds[photoId] ?? null
      await productApi.cleanupPhoto(product.id, photoId, currentBgId, shadow)
      setPhotoShadows((prev) => ({ ...prev, [photoId]: shadow }))
      setPhotoCacheBust((prev) => ({ ...prev, [photoId]: Date.now() }))
      void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
    } catch (err) {
      showError(err, 'Failed to update shadow')
    } finally {
      setShadowSaving(false)
    }
  }

  const handleDownloadCurrentMedia = useCallback(async () => {
    const photo = displayPhotos[selectedPhotoIndex]
    if (!photo || !product || downloadingMedia) return
    setDownloadingMedia(true)
    try {
      const isVideo = photo.is_video ?? false
      const ext = isVideo ? 'mp4' : 'jpg'
      const sanitizedName = (product.name || 'product')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .toLowerCase()
      const localFilename = `${sanitizedName}_${Date.now()}.${ext}`
      const fileUri = `${LegacyFileSystem.documentDirectory}${localFilename}`

      const downloadResult = await LegacyFileSystem.downloadAsync(photo.url, fileUri)
      if (downloadResult.status !== 200) {
        throw new Error(`Download failed with status ${downloadResult.status}`)
      }

      // OS share sheet (Save to Files, gallery apps, WhatsApp…). expo-sharing
      // ships in Expo Go and every dev/EAS build — expo-media-library's
      // ExpoMediaLibraryNext native module does not, and threw
      // "Cannot find native module 'ExpoMediaLibraryNext'" on import here
      // (git 31ac7d1, 835cb58).
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Not available', 'Sharing is not available on this device.')
        return
      }
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
        dialogTitle: isVideo ? 'Save or share video' : 'Save or share image',
      })
    } catch (err) {
      showError(err, 'Failed to download product media')
    } finally {
      setDownloadingMedia(false)
    }
  }, [displayPhotos, selectedPhotoIndex, product, downloadingMedia])

  const handleDeleteCurrentMedia = useCallback(() => {
    const photo = displayPhotos[selectedPhotoIndex]
    if (!photo || !product || deletingMedia) return

    const isVideo = photo.is_video ?? false
    Alert.alert(
      isVideo ? 'Delete Video' : 'Delete Photo',
      `Are you sure you want to delete this ${isVideo ? 'video' : 'photo'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingMedia(true)
            try {
              if (isVideo) {
                const videoId = photo.id.replace(/^video_/, '')
                await growthApi.deleteVideo(videoId)
                void queryClient.invalidateQueries({ queryKey: ['growth', 'videos', product.id] })
              } else {
                await productApi.deletePhoto(product.id, photo.id)
              }
              void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
              if (selectedPhotoIndex > 0) {
                setSelectedPhotoIndex(selectedPhotoIndex - 1)
              }
            } catch (err) {
              showError(err, `Failed to delete ${isVideo ? 'video' : 'photo'}`)
            } finally {
              setDeletingMedia(false)
            }
          },
        },
      ],
    )
  }, [displayPhotos, selectedPhotoIndex, product, deletingMedia, queryClient, setSelectedPhotoIndex])

  return {
    studioModalOpen,
    setStudioModalOpen,
    studioStarting,
    studioStatus,
    studioError,
    studioUpgradeRequired,
    studioResult,
    studioProgress,
    studioEtaMs,
    studioTab,
    setStudioTab,
    originalPhoto,
    studioQuota,
    productVideos,
    videoGenerating,
    videoProgress,
    videoEtaMs,
    generateVideo,
    handleProductVideoPress,
    handleStartStudioShoot,
    handleSetPrimary,
    settingPrimaryId,
    photoBackgrounds,
    setPhotoBackgrounds,
    backgroundSaving,
    handleSetBackground,
    photoShadows,
    setPhotoShadows,
    shadowSaving,
    shadowFor,
    handleSetShadow,
    downloadingMedia,
    deletingMedia,
    handleDownloadCurrentMedia,
    handleDeleteCurrentMedia,
  }
}
