import React, { useState } from 'react'
import {
  View,
  Text,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { Image } from 'expo-image'
import { X, Sparkles, Wand2, CheckCircle2, AlertTriangle } from 'lucide-react-native'
import { STUDIO_TEMPLATES, STUDIO_MODELS, STUDIO_CREDITS_PER_IMAGE } from '@kanchuki/shared'
import { AnimatedPressable } from '../AnimatedPressable'
import { GradientButton } from '../GradientButton'

type StudioStatus = 'processing' | 'ready' | 'failed' | null

interface ProductStudioModalProps {
  visible: boolean
  onClose: () => void
  onStartShoot: (template: string, options?: { engine?: string; model_id?: string }) => void
  starting: boolean
  quota: { unlimited?: boolean; remaining?: number } | undefined
  primaryColor: string
  colors: any
  // Progress / result / error state (from useProductAiStudio)
  status: StudioStatus
  progress: number
  etaMs: number
  error: string | null
  upgradeRequired: boolean
  result: { photoId: string; url: string } | null
  onRetry: () => void
  onUseResult: (setAsMain: boolean) => void
}

// Local asset thumbnails when bundled, otherwise fallback to remote preview_image_url
const LOCAL_STUDIO_THUMBNAILS: Record<string, any> = {
  white_studio: require('../../../assets/studio-templates/white_studio.png'),
  warm_luxury: require('../../../assets/studio-templates/warm_luxury.png'),
  gold_festive: require('../../../assets/studio-templates/gold_festive.png'),
  diwali_lights: require('../../../assets/studio-templates/diwali_lights.png'),
  wedding_elegant: require('../../../assets/studio-templates/wedding_elegant.png'),
  flat_lay: require('../../../assets/studio-templates/flat_lay.png'),
}

export function ProductStudioModal({
  visible,
  onClose,
  onStartShoot,
  starting,
  quota,
  primaryColor,
  colors,
  status,
  progress,
  etaMs,
  error,
  upgradeRequired,
  result,
  onRetry,
  onUseResult,
}: ProductStudioModalProps) {
  const [tab, setTab] = useState<'scenes' | 'models'>('scenes')
  // `draft` is reserved for admin-test-bench-only styles — no rows use it
  // today (list trimmed to 9 on 2026-08-29), so this passes all of them.
  const sceneTemplates = STUDIO_TEMPLATES.filter((t) => !(t as { draft?: boolean }).draft)
  const [selectedTemplate, setSelectedTemplate] = useState<string>(sceneTemplates[0]?.id ?? 'runway')
  const [selectedModel, setSelectedModel] = useState<string>(STUDIO_MODELS[0]?.id ?? 'priya_bridal')

  const handleStart = () => {
    if (tab === 'scenes') {
      onStartShoot(selectedTemplate)
    } else {
      onStartShoot(selectedModel, { model_id: selectedModel })
    }
  }

  // ponytail: quota.remaining is whole images; credits shown = images * 8, so
  // the displayed value is always a multiple of STUDIO_CREDITS_PER_IMAGE and
  // "< 4" / "< 8" trigger at the same point (0 images left). Change the 8 in
  // @kanchuki/shared when the real per-image cost is set.
  const creditsLeft = quota?.unlimited
    ? Infinity
    : (quota?.remaining ?? 0) * STUDIO_CREDITS_PER_IMAGE
  const limitReached = !quota?.unlimited && creditsLeft < STUDIO_CREDITS_PER_IMAGE
  const runningLow =
    !quota?.unlimited && !limitReached && creditsLeft <= STUDIO_CREDITS_PER_IMAGE * 2
  const imagesLeft = Math.floor(creditsLeft / STUDIO_CREDITS_PER_IMAGE)

  const etaSeconds = Math.max(1, Math.round(etaMs / 1000))
  const pct = Math.min(100, Math.max(0, Math.round(progress)))

  const renderBody = () => {
    // ── Generating ──────────────────────────────────────────────────
    if (status === 'processing') {
      return (
        <View className="py-10 items-center">
          <ActivityIndicator size="large" color={primaryColor} />
          <Text className="text-sm font-bold text-sand-900 mt-4">Generating your studio shot…</Text>
          <Text className="text-xs text-sand-500 mt-1">
            {pct > 0 ? `${pct}%` : 'Starting'} · about {etaSeconds}s left
          </Text>
          <View className="w-full h-2 bg-sand-100 rounded-full mt-4 overflow-hidden">
            <View
              className="h-2 rounded-full"
              style={{ width: `${Math.max(pct, 4)}%`, backgroundColor: primaryColor }}
            />
          </View>
          <Text className="text-[11px] text-sand-400 mt-3 text-center px-4">
            You can close this — the photo appears in the gallery when it&apos;s ready.
          </Text>
        </View>
      )
    }

    // ── Failed ─────────────────────────────────────────────────────
    if (status === 'failed') {
      return (
        <View className="py-8 items-center">
          <View className="w-12 h-12 rounded-full bg-red-50 items-center justify-center">
            <AlertTriangle size={24} color="#DC2626" />
          </View>
          <Text className="text-sm font-bold text-sand-900 mt-3">
            {upgradeRequired ? 'AI Studio limit reached' : 'Studio shot failed'}
          </Text>
          <Text className="text-xs text-sand-500 mt-1 text-center px-4 leading-4">
            {error ?? 'Something went wrong. Please try again.'}
          </Text>
          <View className="w-full mt-5 gap-2">
            {!upgradeRequired && (
              <GradientButton
                label="Try Again"
                onPress={onRetry}
                colors={[primaryColor, colors.ink[800]]}
              />
            )}
            <AnimatedPressable
              onPress={onClose}
              className="py-3 items-center rounded-xl border border-sand-200"
            >
              <Text className="text-xs font-bold text-sand-600">Close</Text>
            </AnimatedPressable>
          </View>
        </View>
      )
    }

    // ── Ready ──────────────────────────────────────────────────────
    if (status === 'ready' && result) {
      return (
        <View className="py-4 items-center">
          <View className="flex-row items-center gap-1.5">
            <CheckCircle2 size={16} color="#16A34A" />
            <Text className="text-sm font-bold text-sand-900">Studio shot ready</Text>
          </View>
          <Image
            source={{ uri: result.url }}
            style={{ width: '100%', height: 320, borderRadius: 16, marginTop: 12 }}
            contentFit="contain"
          />
          <View className="w-full mt-5 gap-2">
            <GradientButton
              label="Set as Main Photo"
              onPress={() => onUseResult(true)}
              colors={[primaryColor, colors.ink[800]]}
            />
            <AnimatedPressable
              onPress={() => onUseResult(false)}
              className="py-3 items-center rounded-xl border border-sand-200"
            >
              <Text className="text-xs font-bold text-sand-600">Keep as extra photo</Text>
            </AnimatedPressable>
          </View>
        </View>
      )
    }

    // ── Picker (default) ───────────────────────────────────────────
    return (
      <>
        {/* Subtitle & Quota */}
        <View className="mt-3 mb-2 flex-row items-center justify-between">
          <Text className="text-xs text-sand-500">Transform raw photo into high-fashion catalog</Text>
          {quota && (
            <View
              className="px-2.5 py-1 rounded-full border"
              style={{
                backgroundColor: limitReached ? '#FEE2E2' : runningLow ? '#FEF3C7' : '#FEFCE8',
                borderColor: limitReached ? '#FCA5A5' : runningLow ? '#FCD34D' : '#FEF08A',
              }}
            >
              <Text
                className="text-[10px] font-bold"
                style={{ color: limitReached ? '#991B1B' : runningLow ? '#92400E' : '#854D0E' }}
              >
                {quota.unlimited ? 'Unlimited' : `${creditsLeft} credits left`}
              </Text>
            </View>
          )}
        </View>

        {/* Low-credit / limit-reached banner */}
        {(limitReached || runningLow) && (
          <View
            className="mb-3 px-3 py-2 rounded-xl"
            style={{ backgroundColor: limitReached ? '#FEE2E2' : '#FEF3C7' }}
          >
            <Text
              className="text-[11px] font-semibold leading-4"
              style={{ color: limitReached ? '#991B1B' : '#92400E' }}
            >
              {limitReached
                ? 'AI Studio limit reached. Recharge credits, wait for next month’s billing cycle, or contact the billing team.'
                : `Low on AI Studio credits — ${creditsLeft} left (about ${imagesLeft} image${imagesLeft === 1 ? '' : 's'}). Recharge soon.`}
            </Text>
          </View>
        )}

        {/* Tabs */}
        <View className="flex-row bg-sand-100 p-1 rounded-xl mb-4">
          <AnimatedPressable
            onPress={() => setTab('scenes')}
            className={`flex-1 py-2 rounded-lg items-center ${
              tab === 'scenes' ? 'bg-white shadow-xs' : ''
            }`}
          >
            <Text
              className={`text-xs font-bold ${tab === 'scenes' ? 'text-fuchsia-700' : 'text-sand-500'}`}
            >
              Backdrop Scenes
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => setTab('models')}
            className={`flex-1 py-2 rounded-lg items-center ${
              tab === 'models' ? 'bg-white shadow-xs' : ''
            }`}
          >
            <Text
              className={`text-xs font-bold ${tab === 'models' ? 'text-fuchsia-700' : 'text-sand-500'}`}
            >
              Fashion Models
            </Text>
          </AnimatedPressable>
        </View>

        <ScrollView className="mb-4" showsVerticalScrollIndicator={false}>
          {tab === 'scenes' ? (
            <View className="gap-3">
              {sceneTemplates.map((tpl) => {
                const isSelected = selectedTemplate === tpl.id
                const previewUrl = (tpl as { preview_image_url?: string }).preview_image_url
                const imgSource =
                  LOCAL_STUDIO_THUMBNAILS[tpl.id] ||
                  (previewUrl ? { uri: previewUrl } : null)
                return (
                  <AnimatedPressable
                    key={tpl.id}
                    onPress={() => setSelectedTemplate(tpl.id)}
                    className={`flex-row items-center p-3 rounded-2xl border-2 gap-3.5 ${
                      isSelected ? 'border-fuchsia-600 bg-fuchsia-50/50' : 'border-sand-100 bg-white'
                    }`}
                  >
                    <View className="w-14 h-14 rounded-xl overflow-hidden bg-sand-100 border border-sand-200 items-center justify-center">
                      {imgSource ? (
                        <Image
                          source={imgSource}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <Wand2 size={22} color={colors.sand[400]} />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-sand-900">{tpl.label}</Text>
                      <Text className="text-xs text-sand-500 mt-0.5 leading-4" numberOfLines={2}>
                        {tpl.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <View className="w-5 h-5 rounded-full bg-fuchsia-600 items-center justify-center">
                        <CheckCircle2 size={16} color="white" />
                      </View>
                    )}
                  </AnimatedPressable>
                )
              })}
            </View>
          ) : (
            <View className="gap-3">
              {STUDIO_MODELS.map((model) => {
                const isSelected = selectedModel === model.id
                const imgSource = model.model_image_url ? { uri: model.model_image_url } : null
                return (
                  <AnimatedPressable
                    key={model.id}
                    onPress={() => setSelectedModel(model.id)}
                    className={`flex-row items-center p-3 rounded-2xl border-2 gap-3.5 ${
                      isSelected ? 'border-fuchsia-600 bg-fuchsia-50/50' : 'border-sand-100 bg-white'
                    }`}
                  >
                    <View className="w-14 h-14 rounded-xl overflow-hidden bg-sand-100 border border-sand-200 items-center justify-center">
                      {imgSource ? (
                        <Image
                          source={imgSource}
                          style={{ width: '100%', height: '100%' }}
                          contentFit="cover"
                          transition={200}
                        />
                      ) : (
                        <Text className="text-2xl">💃</Text>
                      )}
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-sm font-bold text-sand-900">{model.name}</Text>
                        <Text className="text-[10px] font-bold text-fuchsia-700 bg-fuchsia-100 px-2 py-0.5 rounded-full">
                          {model.title}
                        </Text>
                      </View>
                      <Text className="text-xs text-sand-500 mt-0.5 leading-4" numberOfLines={2}>
                        {model.description}
                      </Text>
                    </View>
                    {isSelected && (
                      <View className="w-5 h-5 rounded-full bg-fuchsia-600 items-center justify-center">
                        <CheckCircle2 size={16} color="white" />
                      </View>
                    )}
                  </AnimatedPressable>
                )
              })}
            </View>
          )}
        </ScrollView>

        <GradientButton
          label={
            limitReached
              ? 'AI Studio limit reached'
              : starting
                ? 'Starting...'
                : 'Generate Studio Shot (10-30s)'
          }
          onPress={handleStart}
          disabled={starting || limitReached}
          colors={[primaryColor, colors.ink[800]]}
        />
      </>
    )
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-white rounded-t-3xl p-5 max-h-[85%]">
          {/* Header */}
          <View className="flex-row items-center justify-between pb-3 border-b border-sand-100">
            <View className="flex-row items-center gap-2">
              <Sparkles size={20} color={primaryColor} />
              <Text className="text-base font-bold text-sand-900">AI Studio Shoot</Text>
            </View>
            <AnimatedPressable onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.sand[600]} />
            </AnimatedPressable>
          </View>

          {renderBody()}
        </View>
      </View>
    </Modal>
  )
}
