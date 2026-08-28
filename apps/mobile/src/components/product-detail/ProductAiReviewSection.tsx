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
        <View className="bg-lavender-100 border border-lavender-200 rounded-2xl px-4 py-3 flex-row items-center gap-2.5 shadow-sm">
          <ActivityIndicator size="small" color="#BB3F95" />
          <Text className="text-spaceCadet-900 font-bold text-xs">AI auto-tagging in progress...</Text>
        </View>
      )}

      {product.ai_tag_error && (
        <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 shadow-sm">
          <View className="flex-row items-center justify-between">
            <Text className="text-amber-800 text-xs font-bold">AI auto-tagging failed</Text>
            <AnimatedPressable
              onPress={handleRetag}
              disabled={retagging}
              className="flex-row items-center gap-1 bg-white px-3 py-1.5 rounded-xl border border-amber-200"
            >
              {retagging ? (
                <ActivityIndicator size="small" color="#BB3F95" />
              ) : (
                <RefreshCw size={12} color="#92400e" />
              )}
              <Text className="text-amber-900 text-[10px] font-bold">Retry AI</Text>
            </AnimatedPressable>
          </View>
          <Text className="text-amber-700 text-[10px] mt-1.5 leading-relaxed" numberOfLines={3}>
            {product.ai_tag_error}
          </Text>
        </View>
      )}
    </View>
  )
}

