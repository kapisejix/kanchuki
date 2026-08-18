import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ChevronLeft, ChevronRight, Plus, Store } from 'lucide-react-native'
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { growthApi } from '../../src/lib/api/growth'
import { useTheme } from '../../src/lib/theme'

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`

export default function SuppliersScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'suppliers'],
    queryFn: () => growthApi.suppliers(),
  })
  const suppliers = data?.data ?? []
  const totalPending = suppliers.reduce((s, x) => s + x.pending_amount_paise, 0)

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <AnimatedPressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <ChevronLeft size={24} color={colors.sand[700]} />
            </AnimatedPressable>
            <Text className="text-base font-bold text-sand-900">Suppliers</Text>
          </View>
          <AnimatedPressable
            onPress={() => router.push('/growth/supplier-form')}
            accessibilityLabel="Add supplier"
            accessibilityRole="button"
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: `${primaryColor}1A` }}
          >
            <Plus size={20} color={primaryColor} />
          </AnimatedPressable>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Pending summary */}
        <View className="bg-ink-600 rounded-2xl p-4 mb-4">
          <Text className="text-xs text-turmeric-300 font-semibold uppercase tracking-wide">
            Total pending to suppliers
          </Text>
          <Text className="text-2xl font-bold text-white mt-1">{inr(totalPending)}</Text>
          <Text className="text-[11px] text-white/50 mt-1">
            Unpaid stock orders minus payments — tracked per supplier below.
          </Text>
        </View>

        {isLoading ? (
          <View className="bg-white rounded-2xl p-6 border border-sand-100 items-center">
            <ActivityIndicator color={primaryColor} />
          </View>
        ) : suppliers.length === 0 ? (
          <View className="bg-white rounded-2xl p-6 border border-sand-100 items-center">
            <View
              className="w-12 h-12 rounded-2xl items-center justify-center mb-3"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <Store size={22} color={primaryColor} />
            </View>
            <Text className="text-sm font-semibold text-sand-700">No suppliers yet</Text>
            <Text className="text-xs text-sand-400 text-center mt-1 leading-4">
              Add the vendors you buy stock from, then log orders and payments to track what you owe.
            </Text>
            <View className="w-48 mt-4">
              <GradientButton label="Add Supplier" onPress={() => router.push('/growth/supplier-form')} />
            </View>
          </View>
        ) : (
          <View className="gap-2.5">
            {suppliers.map((s) => (
              <AnimatedPressable
                key={s.id}
                onPress={() => router.push(`/growth/supplier/${s.id}`)}
                accessibilityRole="button"
                className="bg-white rounded-2xl p-4 border border-sand-100"
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center"
                    style={{ backgroundColor: `${primaryColor}1A` }}
                  >
                    <Store size={18} color={primaryColor} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-sand-900" numberOfLines={1}>
                      {s.name}
                    </Text>
                    <Text className="text-xs text-sand-400" numberOfLines={1}>
                      {[s.city, s.phone].filter(Boolean).join(' · ') || 'No contact details'}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text
                      className={`text-sm font-bold ${s.pending_amount_paise > 0 ? 'text-rust-600' : 'text-sand-900'}`}
                    >
                      {inr(s.pending_amount_paise)}
                    </Text>
                    <Text className="text-[10px] text-sand-400">pending</Text>
                  </View>
                  <ChevronRight size={16} color={colors.sand[300]} />
                </View>
              </AnimatedPressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
