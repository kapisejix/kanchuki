/**
 * F-034 T7b — AI promo video flow for one product (start, poll, result).
 * Kept apart from useProductAiStudio (already 400+ lines); same shape.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProductDetail } from '@kanchuki/shared'
import { ApiError, productApi } from '../lib/api'
import type { PromoVideoAspect } from '../lib/api/products'
import { apiMessage } from '../lib/errors'
import { pollWithBackoff } from '../lib/polling'
import { PROMO_STALL_MS } from '../lib/promo-video'

export type PromoStatus = 'processing' | 'ready' | 'failed' | 'stalled' | null

export function useProductPromoVideo({
  product,
  sourcePhotoId,
}: {
  product: ProductDetail | undefined
  /** D5: the photo on screen (original photo when a video slide is showing). */
  sourcePhotoId: string | undefined
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [status, setStatus] = useState<PromoStatus>(null)
  const [error, setError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState(false)
  const [result, setResult] = useState<{ videoId: string; url: string } | null>(null)
  const [startedAt, setStartedAt] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)

  const stylesQuery = useQuery({
    queryKey: ['promo-video-styles', product?.id],
    queryFn: () => (product ? productApi.getPromoVideoStyles(product.id) : null),
    enabled: !!product,
  })
  const styles = stylesQuery.data?.data ?? []
  const meta = stylesQuery.data?.meta
  const refetchStyles = stylesQuery.refetch

  const start = useCallback(
    async (styleSlug: string, aspect: PromoVideoAspect) => {
      // RC-015/132/135: state reaches the button a render late; the ref does not.
      if (startingRef.current || !product || !sourcePhotoId) return
      startingRef.current = true
      setStarting(true)
      setError(null)
      setLimitReached(false)
      setResult(null)
      try {
        const res = await productApi.startPromoVideo(product.id, {
          photo_id: sourcePhotoId,
          style_slug: styleSlug,
          aspect,
        })
        setJobId(res.data.job_id)
        setStartedAt(Date.now())
        setElapsedMs(0)
        setStatus('processing')
      } catch (err) {
        setStatus('failed')
        setLimitReached(err instanceof ApiError && err.code === 'PLAN_LIMIT_EXCEEDED')
        setError(apiMessage(err, 'Could not start the video. Please try again.'))
      } finally {
        startingRef.current = false
        setStarting(false)
      }
    },
    [product, sourcePhotoId],
  )

  // Poll the job. Stops on ready/failed, or when the stall timer below flips status.
  useEffect(() => {
    if (!product || !jobId || status !== 'processing') return
    return pollWithBackoff({
      initialMs: 5000,
      maxMs: 15_000,
      maxAttempts: 40,
      onPoll: async () => {
        const s = (await productApi.getPromoVideoStatus(product.id, jobId)).data
        if (s.status === 'ready' && s.video_id && s.url) {
          setResult({ videoId: s.video_id, url: s.url })
          setStatus('ready')
          void queryClient.invalidateQueries({ queryKey: ['growth', 'videos', product.id] })
          void queryClient.invalidateQueries({ queryKey: ['products', product.id] })
          void refetchStyles()
          return true
        }
        if (s.status === 'failed') {
          setError(s.error ?? 'The video could not be made. Please try again.')
          setStatus('failed')
          void refetchStyles()
          return true
        }
        return false
      },
    })
  }, [product, jobId, status, queryClient, refetchStyles])

  // Elapsed clock (the only number shown while waiting) + give up after PROMO_STALL_MS.
  useEffect(() => {
    if (status !== 'processing') return
    const t = setInterval(() => {
      const ms = Date.now() - startedAt
      setElapsedMs(ms)
      if (ms >= PROMO_STALL_MS) setStatus('stalled')
    }, 1000)
    return () => clearInterval(t)
  }, [status, startedAt])

  const reset = useCallback(() => {
    setJobId(null)
    setStatus(null)
    setError(null)
    setLimitReached(false)
    setResult(null)
    setElapsedMs(0)
  }, [])

  const close = useCallback(() => {
    // A running job keeps polling with the sheet hidden; the clip lands in the gallery.
    if (status !== 'processing') reset()
    setOpen(false)
  }, [status, reset])

  const postToSocial = useCallback(() => {
    const r = result
    close()
    if (r && product) router.push(`/social/create?product_id=${product.id}&video_id=${r.videoId}`)
  }, [result, product, close])

  return {
    open,
    setOpen,
    styles,
    available: meta?.available ?? false,
    quota: meta?.quota,
    stylesLoading: stylesQuery.isLoading,
    starting,
    status,
    error,
    limitReached,
    result,
    elapsedMs,
    start,
    reset,
    close,
    postToSocial,
  }
}
