import React, { useState } from 'react'
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native'
import { Image } from 'expo-image'
import { X, Sparkles, Wand2 } from 'lucide-react-native'
import { STUDIO_TEMPLATES, STUDIO_MODELS, STUDIO_CREDITS_PER_IMAGE } from '@kanchuki/shared'
import { AnimatedPressable } from '../AnimatedPressable'
import { GradientButton } from '../GradientButton'

interface ProductStudioModalProps {
  visible: boolean
  onClose: () => void
  onStartShoot: (template: string, options?: { engine?: string; model_id?: string }) => void
  starting: boolean
  quota: { unlimited?: boolean; remaining?: number } | undefined
  primaryColor: string
  colors: any
}

const STUDIO_TEMPLATE_THUMBNAILS: Record<string, number> = {
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
}: ProductStudioModalProps) {
  const [tab, setTab] = useState<'scenes' | 'models'>('scenes')
  const [selectedTemplate, setSelectedTemplate] = useState<string>(STUDIO_TEMPLATES[0]?.id ?? 'white_studio')
  const [selectedModel, setSelectedModel] = useState<string>(STUDIO_MODELS[0]?.id ?? 'indian_female_1')
  const [customPrompt, setCustomPrompt] = useState('')

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
                className={`text-xs font-bold ${
                  tab === 'scenes' ? 'text-ink-700' : 'text-sand-500'
                }`}
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
                className={`text-xs font-bold ${
                  tab === 'models' ? 'text-ink-700' : 'text-sand-500'
                }`}
              >
                Fashion Models
              </Text>
            </AnimatedPressable>
          </View>

          <ScrollView className="mb-4" showsVerticalScrollIndicator={false}>
            {tab === 'scenes' ? (
              <View className="gap-3">
                {STUDIO_TEMPLATES.map((tpl) => {
                  const isSelected = selectedTemplate === tpl.id
                  return (
                    <AnimatedPressable
                      key={tpl.id}
                      onPress={() => setSelectedTemplate(tpl.id)}
                      className={`flex-row items-center p-3 rounded-2xl border-2 gap-3 ${
                        isSelected ? 'border-ink-600 bg-ink-50/50' : 'border-sand-100 bg-white'
                      }`}
                    >
                      {STUDIO_TEMPLATE_THUMBNAILS[tpl.id] ? (
                        <Image
                          source={STUDIO_TEMPLATE_THUMBNAILS[tpl.id]}
                          style={{ width: 56, height: 56 }}
                          contentFit="cover"
                          className="rounded-xl"
                        />
                      ) : (
                        <View className="w-14 h-14 rounded-xl bg-sand-100 items-center justify-center">
                          <Wand2 size={24} color={colors.sand[400]} />
                        </View>
                      )}
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-sand-900">{tpl.label}</Text>
                        <Text className="text-xs text-sand-500 mt-0.5" numberOfLines={2}>
                          {tpl.description}
                        </Text>
                      </View>
                    </AnimatedPressable>
                  )
                })}
              </View>
            ) : (
              <View className="gap-3">
                {STUDIO_MODELS.map((model) => {
                  const isSelected = selectedModel === model.id
                  return (
                    <AnimatedPressable
                      key={model.id}
                      onPress={() => setSelectedModel(model.id)}
                      className={`flex-row items-center p-3 rounded-2xl border-2 gap-3 ${
                        isSelected ? 'border-ink-600 bg-ink-50/50' : 'border-sand-100 bg-white'
                      }`}
                    >
                      <View className="w-14 h-14 rounded-xl bg-ink-100 items-center justify-center">
                        <Text className="text-2xl">💃</Text>
                      </View>
                      <View className="flex-1">
                        <Text className="text-sm font-bold text-sand-900">{model.name}</Text>
                        <Text className="text-xs text-sand-500 mt-0.5" numberOfLines={2}>
                          {model.description}
                        </Text>
                      </View>
                    </AnimatedPressable>
                  )
                })}
              </View>
            )}
          </ScrollView>

          {/* Start button */}
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
        </View>
      </View>
    </Modal>
  )
}
