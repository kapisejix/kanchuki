/**
 * F-034 T7b — "AI Promo Video" sheet. Same shell and states as
 * ProductStudioModal (picker / making / failed / ready), presentational only:
 * all flow state comes from useProductPromoVideo.
 *
 * Design (owner-approved 2026-11-18, T7a): no fake progress — elapsed time
 * only; blocked reasons replace the button label; no model names or slugs.
 */
import React, { useState } from 'react'
import { ActivityIndicator, Modal, ScrollView, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { VideoView } from 'expo-video'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AlertTriangle, CheckCircle2, Clapperboard, Info, X } from 'lucide-react-native'
import type { PromoVideoAspect, PromoVideoStyle } from '../../lib/api/products'
import {
  PROMO_ASPECTS,
  formatElapsed,
  promoBlockReason,
  resolveAspect,
} from '../../lib/promo-video'
import { useSafeVideoPlayer } from '../../lib/safe-video-player'
import { AnimatedPressable } from '../AnimatedPressable'
import { GradientButton } from '../GradientButton'
import { ReportAiContent } from '../ReportAiContent'
import type { PromoStatus } from '../../hooks/useProductPromoVideo'

interface ProductVideoModalProps {
  visible: boolean
  onClose: () => void
  onStart: (styleSlug: string, aspect: PromoVideoAspect) => void
  onRetry: () => void
  onPostToSocial: () => void
  styles: PromoVideoStyle[]
  stylesLoading: boolean
  quota: { remaining: number; unlimited: boolean } | undefined
  sourcePhotoUrl: string | undefined
  videoCount: number
  online: boolean
  kids: boolean
  starting: boolean
  status: PromoStatus
  error: string | null
  limitReached: boolean
  result: { videoId: string; url: string } | null
  elapsedMs: number
  primaryColor: string
  colors: any
}

function PromoClip({ url }: { url: string }) {
  const player = useSafeVideoPlayer(url, (p) => {
    p.loop = true
    p.muted = true
    p.play()
  })
  return (
    <View
      className="w-full bg-sand-950 rounded-2xl overflow-hidden mt-3"
      style={{ height: 320 }}
      accessibilityLabel="Your new promo video"
    >
      {player ? (
        <VideoView
          style={{ width: '100%', height: '100%' }}
          player={player}
          nativeControls
          contentFit="contain"
        />
      ) : (
        <View className="flex-1 items-center justify-center">
          <Clapperboard size={36} color="white" strokeWidth={1.5} />
        </View>
      )}
    </View>
  )
}

export function ProductVideoModal(props: ProductVideoModalProps) {
  const { visible, onClose, status, primaryColor, colors } = props
  const insets = useSafeAreaInsets()
  const [pickedSlug, setPickedSlug] = useState<string | null>(null)
  const [pickedAspect, setPickedAspect] = useState<PromoVideoAspect | null>(null)

  // Derived selection (RC-017): never an effect that re-picks on every new array.
  const style = props.styles.find((s) => s.slug === pickedSlug) ?? props.styles[0]
  const aspect = resolveAspect(pickedAspect, style)
  const block = promoBlockReason({
    online: props.online,
    videoCount: props.videoCount,
    quota: props.quota,
    styleCount: props.styles.length,
  })

  const secondary = (label: string, onPress: () => void) => (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="py-3 min-h-[44px] items-center justify-center rounded-xl border border-sand-200"
    >
      <Text className="text-sm font-bold text-sand-700">{label}</Text>
    </AnimatedPressable>
  )

  const renderBody = () => {
    if (status === 'processing' || status === 'stalled') {
      const stalled = status === 'stalled'
      return (
        <View className="py-10 items-center" accessibilityLiveRegion="polite">
          {!stalled && <ActivityIndicator size="large" color={primaryColor} />}
          <Text className="text-base font-bold text-sand-900 mt-4">
            {stalled ? 'Still working' : 'Making your promo video…'}
          </Text>
          {!stalled && (
            <Text className="text-sm text-sand-600 mt-1">
              {formatElapsed(props.elapsedMs)} · usually 1–3 minutes
            </Text>
          )}
          <Text className="text-sm text-sand-500 mt-3 text-center px-4 leading-5">
            {stalled
              ? 'Close this. The clip will show in the product gallery if it finishes.'
              : 'You can close this. The clip appears in the product gallery when it’s ready.'}
          </Text>
          {stalled && <View className="w-full mt-5">{secondary('Close', onClose)}</View>}
        </View>
      )
    }

    if (status === 'failed') {
      return (
        <View className="py-8 items-center">
          <AlertTriangle size={28} color={colors.danger} strokeWidth={1.5} />
          <Text className="text-base font-bold text-sand-900 mt-3">
            {props.limitReached ? 'Video limit reached' : 'Video not made'}
          </Text>
          <Text className="text-sm text-sand-600 mt-1 text-center px-4 leading-5">
            {props.error ?? 'Something went wrong. Please try again.'}
          </Text>
          <View className="w-full mt-5 gap-2">
            {!props.limitReached && (
              <GradientButton
                label="Try again"
                onPress={props.onRetry}
                colors={[primaryColor, colors.ink[800]]}
              />
            )}
            {secondary('Close', onClose)}
          </View>
        </View>
      )
    }

    if (status === 'ready' && props.result) {
      return (
        <View className="py-4">
          <View className="flex-row items-center gap-1.5 self-center">
            <CheckCircle2 size={18} color={colors.ink[700]} strokeWidth={1.5} />
            <Text className="text-base font-bold text-sand-900">Promo video ready</Text>
          </View>
          <PromoClip url={props.result.url} />
          <Text className="text-xs text-sand-600 mt-2 text-center leading-4">
            AI-made promo clip. Your photo stays the main photo.
          </Text>
          <View className="w-full mt-4 gap-2">
            <GradientButton
              label="Post to social"
              onPress={props.onPostToSocial}
              colors={[primaryColor, colors.ink[800]]}
            />
            {secondary('Keep in gallery', onClose)}
            <ReportAiContent feature="AI Promo Video" contentRef={props.result.videoId} />
          </View>
        </View>
      )
    }

    // ── Picker ──
    const remaining = props.quota?.unlimited
      ? 'Unlimited'
      : props.quota
        ? `${props.quota.remaining} ${props.quota.remaining === 1 ? 'video' : 'videos'} left`
        : null
    return (
      <>
        <View className="mt-3 flex-row items-center gap-3">
          <View className="w-12 h-12 rounded-xl overflow-hidden bg-sand-100 border border-sand-200">
            {props.sourcePhotoUrl && (
              <Image
                source={{ uri: props.sourcePhotoUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                accessibilityLabel="Photo the video is made from"
              />
            )}
          </View>
          <Text className="flex-1 text-sm text-sand-700">From this photo</Text>
          {remaining && (
            <Text
              className="text-xs font-bold"
              style={{ color: block?.limit ? colors.danger : colors.sand[700] }}
            >
              {remaining}
            </Text>
          )}
        </View>

        <Text className="text-xs font-bold text-sand-500 mt-4 mb-2">Shape</Text>
        <View className="flex-row flex-wrap gap-2">
          {PROMO_ASPECTS.map((a) => {
            const on = a.value === aspect
            return (
              <AnimatedPressable
                key={a.value}
                onPress={() => setPickedAspect(a.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${a.label} ${a.value}`}
                className={`px-3.5 min-h-[44px] justify-center rounded-full border ${
                  on ? 'border-ink-700 bg-ink-50' : 'border-sand-200 bg-white'
                }`}
              >
                <Text className={`text-sm ${on ? 'font-bold text-ink-800' : 'text-sand-700'}`}>
                  {a.label} <Text className="text-xs text-sand-500">{a.value}</Text>
                </Text>
              </AnimatedPressable>
            )
          })}
        </View>

        <ScrollView className="mt-4 max-h-[300px]" showsVerticalScrollIndicator={false}>
          {props.stylesLoading ? (
            <ActivityIndicator size="small" color={primaryColor} />
          ) : (
            <View className="gap-2.5 pb-2">
              {props.styles.map((s) => {
                const on = s.slug === style?.slug
                return (
                  <AnimatedPressable
                    key={s.slug}
                    onPress={() => setPickedSlug(s.slug)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={s.label}
                    className={`flex-row items-center p-3 rounded-2xl border-2 gap-3 ${
                      on ? 'border-ink-700 bg-ink-50' : 'border-sand-100 bg-white'
                    }`}
                  >
                    <View className="w-12 h-12 rounded-xl overflow-hidden bg-sand-100 items-center justify-center">
                      {s.thumbnail_url ? (
                        <Image
                          source={{ uri: s.thumbnail_url }}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                        />
                      ) : (
                        <Clapperboard size={20} color={colors.sand[400]} strokeWidth={1.5} />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-sand-900">{s.label}</Text>
                      {!!s.description && (
                        <Text className="text-xs text-sand-600 mt-0.5 leading-4" numberOfLines={2}>
                          {s.description}
                        </Text>
                      )}
                    </View>
                    <Text className="text-xs text-sand-500">{s.duration_sec ?? 5} s</Text>
                  </AnimatedPressable>
                )
              })}
            </View>
          )}
        </ScrollView>

        {props.kids && (
          <View className="flex-row gap-2 mt-3 p-3 rounded-xl bg-sand-50">
            <Info size={16} color={colors.sand[600]} strokeWidth={1.5} />
            <Text className="flex-1 text-xs text-sand-700 leading-4">
              Kids’ items get product-only clips. Use a photo with no child in it.
            </Text>
          </View>
        )}

        <View className="mt-4">
          <GradientButton
            label={block ? block.reason : props.starting ? 'Starting…' : 'Make video · about 1–3 min'}
            onPress={() => style && props.onStart(style.slug, aspect)}
            disabled={!!block || props.starting || props.stylesLoading || !style}
            colors={[primaryColor, colors.ink[800]]}
          />
        </View>
      </>
    )
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <View
          className="bg-white rounded-t-3xl p-5 max-h-[90%]"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <View className="flex-row items-center justify-between pb-3 border-b border-sand-100">
            <View className="flex-row items-center gap-2">
              <Clapperboard size={20} color={primaryColor} strokeWidth={1.5} />
              <Text className="text-base font-bold text-sand-900">AI Promo Video</Text>
            </View>
            <AnimatedPressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={22} color={colors.sand[600]} />
            </AnimatedPressable>
          </View>
          {renderBody()}
        </View>
      </View>
    </Modal>
  )
}
