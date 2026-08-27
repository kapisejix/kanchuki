import React from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { Sparkles, RefreshCw } from 'lucide-react-native'
import { AnimatedPressable } from '../AnimatedPressable'
import type { ProductDetail } from '@kanchuki/shared'

interface ProductAiReviewSectionProps {
  product: ProductDetail
  retagging: boolean
  handleRetag: () => void
  primaryColor: string
  colors: any
}

export function ProductAiReviewSection({
  product,
  retagging,
  handleRetag,
  primaryColor,
  colors,
}: ProductAiReviewSectionProps) {
  return (
    <View className="mx-4 mt-3">
      {!product.ai_tagged && !product.ai_tag_error && (
        <View className="bg-ink-50 border border-ink-100 rounded-xl px-3 py-2 flex-row items-center gap-2">
          <ActivityIndicator size="small" color={primaryColor} />
          <Text className="text-ink-700 text-xs">AI tagging in progress...</Text>
        </View>
      )}

      {product.ai_tag_error && (
        <View className="bg-turmeric-50 border border-turmeric-100 rounded-xl px-3 py-2">
          <View className="flex-row items-center justify-between">
            <Text className="text-turmeric-700 text-xs font-semibold">AI tagging failed</Text>
            <AnimatedPressable
              onPress={handleRetag}
              disabled={retagging}
              className="flex-row items-center gap-1 bg-white px-2 py-1 rounded-lg border border-turmeric-200"
            >
              {retagging ? (
                <ActivityIndicator size="small" color={primaryColor} />
              ) : (
                <RefreshCw size={12} color={colors.turmeric[700]} />
              )}
              <Text className="text-turmeric-800 text-[10px] font-bold">Retry AI</Text>
            </AnimatedPressable>
          </View>
          <Text className="text-turmeric-600 text-[10px] mt-1 leading-relaxed" numberOfLines={3}>
            {product.ai_tag_error}
          </Text>
        </View>
      )}
    </View>
  )
}

