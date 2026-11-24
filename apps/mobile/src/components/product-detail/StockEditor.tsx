import React from 'react'
import { View, Text, TextInput } from 'react-native'
import { Minus, Plus } from 'lucide-react-native'
import { FREE_SIZE, MAX_STOCK_QUANTITY } from '@kanchuki/shared'
import { AnimatedPressable } from '../AnimatedPressable'

/** Sizes that get a stepper: the selected sizes, or one FREE row when unsized. */
export const stockSizes = (selectedSizes: string[]) =>
  selectedSizes.length ? selectedSizes : [FREE_SIZE]

/** Quantity per displayed size; a size the retailer has not touched yet counts as 1. */
export const toStockPayload = (selectedSizes: string[], qty: Record<string, number>) =>
  stockSizes(selectedSizes).map((size) => ({ size, quantity: qty[size] ?? 1 }))

interface Props {
  selectedSizes: string[]
  qty: Record<string, number>
  onChange: (size: string, quantity: number) => void
}

export function StockEditor({ selectedSizes, qty, onChange }: Props) {
  const clamp = (n: number) => Math.min(MAX_STOCK_QUANTITY, Math.max(0, Math.floor(n) || 0))
  return (
    <View className="gap-2">
      {stockSizes(selectedSizes).map((size) => {
        const value = qty[size] ?? 1
        const label = size === FREE_SIZE ? '' : `${size} `
        return (
          <View key={size} className="flex-row items-center justify-between">
            <Text className="text-sm font-semibold text-spaceCadet-900">
              {size === FREE_SIZE ? 'Quantity' : size}
            </Text>
            <View className="flex-row items-center gap-2">
              <AnimatedPressable
                onPress={() => onChange(size, clamp(value - 1))}
                accessibilityRole="button"
                accessibilityLabel={`Decrease ${label}quantity`}
                className="w-9 h-9 rounded-full border border-lavender-200 items-center justify-center"
              >
                <Minus size={14} color="#1F2A44" />
              </AnimatedPressable>
              <TextInput
                value={String(value)}
                onChangeText={(t) => onChange(size, clamp(Number(t.replace(/\D/g, ''))))}
                keyboardType="number-pad"
                maxLength={5}
                accessibilityLabel={`${label}quantity`}
                // Android TextInput keeps ~10px default vertical padding, which clipped the digits in a 36px box.
                style={{ paddingVertical: 0, includeFontPadding: false, textAlignVertical: 'center' }}
                className="w-16 h-10 text-center text-sm font-bold text-spaceCadet-900 border border-lavender-200 rounded-lg"
              />
              <AnimatedPressable
                onPress={() => onChange(size, clamp(value + 1))}
                accessibilityRole="button"
                accessibilityLabel={`Increase ${label}quantity`}
                className="w-9 h-9 rounded-full border border-lavender-200 items-center justify-center"
              >
                <Plus size={14} color="#1F2A44" />
              </AnimatedPressable>
            </View>
          </View>
        )
      })}
    </View>
  )
}
