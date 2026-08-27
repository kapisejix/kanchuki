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
      <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
        <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-3">
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
                className={`flex-1 py-3 rounded-2xl border items-center justify-center ${
                  isSelected
                    ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm'
                    : 'bg-lavender-50 border-lavender-200'
                }`}
              >
                {statusUpdating && isSelected ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text
                    className={`text-xs font-bold ${
                      isSelected ? 'text-white' : 'text-spaceCadet-900'
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
          className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border border-red-200 bg-red-50/70"
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#dc2626" />
          ) : (
            <Trash2 size={16} color="#dc2626" />
          )}
          <Text className="text-red-700 text-xs font-bold uppercase tracking-wider">Delete Product</Text>
        </AnimatedPressable>
      </View>
    </View>
  )
}

