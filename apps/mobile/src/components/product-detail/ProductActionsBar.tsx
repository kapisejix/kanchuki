import React from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { Trash2, Check } from 'lucide-react-native'
import { STATUS_OPTIONS } from './types'
import { AnimatedPressable } from '../AnimatedPressable'
import type { ProductDetail, ProductStatus } from '@kanchuki/shared'

interface ProductActionsBarProps {
  product: ProductDetail
  statusUpdating: boolean
  handleStatusChange: (status: ProductStatus) => void
  deleting: boolean
  handleDelete: () => void
  primaryColor: string
  colors: any
}

export function ProductActionsBar({
  product,
  statusUpdating,
  handleStatusChange,
  deleting,
  handleDelete,
  primaryColor,
  colors,
}: ProductActionsBarProps) {
  return (
    <View className="px-4 py-4 gap-4">
      {/* Product Status Selector */}
      <View className="bg-white rounded-2xl p-4 border border-sand-100">
        <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
          Product Availability
        </Text>
        <View className="flex-row gap-2">
          {STATUS_OPTIONS.map((opt) => {
            const isSelected = product.status === opt.value
            return (
              <AnimatedPressable
                key={opt.value}
                onPress={() => handleStatusChange(opt.value)}
                disabled={statusUpdating}
                className={`flex-1 py-2.5 rounded-xl border items-center justify-center ${
                  isSelected
                    ? 'bg-ink-600 border-ink-600'
                    : 'bg-sand-50 border-sand-200'
                }`}
              >
                {statusUpdating && isSelected ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? 'text-white' : 'text-sand-700'
                    }`}
                  >
                    {opt.label}
                  </Text>
                )}
              </AnimatedPressable>
            )
          })}
        </View>
      </View>

      {/* Delete Product Button */}
      <View className="pt-2">
        <AnimatedPressable
          onPress={handleDelete}
          disabled={deleting}
          className="flex-row items-center justify-center gap-2 py-3 rounded-2xl border border-rust-200 bg-rust-50/60"
        >
          {deleting ? (
            <ActivityIndicator size="small" color={colors.rust[600]} />
          ) : (
            <Trash2 size={16} color={colors.rust[600]} />
          )}
          <Text className="text-rust-700 text-sm font-semibold">Delete Product</Text>
        </AnimatedPressable>
      </View>
    </View>
  )
}

