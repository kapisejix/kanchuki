import { formatPaiseShort } from '@kanchuki/shared'
import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ChevronLeft, ChevronRight, Plus, Store } from 'lucide-react-native'
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { growthApi } from '../../src/lib/api/growth'
import { useTheme } from '../../src/lib/theme'


import { LinearGradient } from 'expo-linear-gradient'

export default function SuppliersScreen() {
  const insets = useSafeAreaInsets()

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'suppliers'],
    queryFn: () => growthApi.suppliers(),
  })
  const suppliers = data?.data ?? []
  const totalPending = suppliers.reduce((s, x) => s + x.pending_amount_paise, 0)

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <AnimatedPressable
              onPress={() => router.back()}
              hitSlop={8}
              className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <ChevronLeft size={20} color="#231F48" />
            </AnimatedPressable>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              Supplier Ledger
            </Text>
          </View>
          <AnimatedPressable
            onPress={() => router.push('/growth/supplier-form')}
            accessibilityLabel="Add supplier"
            accessibilityRole="button"
            className="w-10 h-10 rounded-2xl items-center justify-center bg-fuchsia-600 shadow-sm"
          >
            <Plus size={20} color="white" />
          </AnimatedPressable>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Pending summary - Signature Gradient */}
        <LinearGradient
          colors={['#231F48', '#560A39']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="rounded-3xl p-5 mb-5 shadow-sm"
        >
          <Text className="text-xs text-[#E0E1F6] font-bold uppercase tracking-wider">
            Total Outstanding to Suppliers
          </Text>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-3xl font-bold text-white mt-1.5"
          >
            {formatPaiseShort(totalPending)}
          </Text>
          <Text className="text-xs text-white/70 mt-1 font-medium">
            Unpaid stock orders minus payments — tracked per vendor ledger.
          </Text>
        </LinearGradient>

        {isLoading ? (
          <View className="bg-white rounded-3xl p-6 border border-lavender-200 items-center">
            <ActivityIndicator color="#BB3F95" />
          </View>
        ) : suppliers.length === 0 ? (
          <View className="bg-white rounded-3xl p-6 border border-lavender-200 items-center">
            <View
              className="w-14 h-14 rounded-2xl items-center justify-center mb-3 bg-lavender-100 border border-lavender-200"
            >
              <Store size={24} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-base font-bold text-spaceCadet-900"
            >
              No Suppliers Added
            </Text>
            <Text className="text-xs text-heliotrope-500 text-center mt-1 leading-relaxed font-medium">
              Add the vendors you buy stock from, then log orders and payments to track what you owe.
            </Text>
            <View className="w-48 mt-4">
              <GradientButton label="Add Supplier" onPress={() => router.push('/growth/supplier-form')} />
            </View>
          </View>
        ) : (
          <View className="gap-3.5">
            {suppliers.map((s) => (
              <AnimatedPressable
                key={s.id}
                onPress={() => router.push(`/growth/supplier/${s.id}`)}
                accessibilityRole="button"
                className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm"
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-11 h-11 rounded-2xl items-center justify-center bg-lavender-100 border border-lavender-200"
                  >
                    <Store size={18} color="#BB3F95" />
                  </View>
                  <View className="flex-1">
                    <Text
                      style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                      className="text-base font-bold text-spaceCadet-900"
                      numberOfLines={1}
                    >
                      {s.name}
                    </Text>
                    <Text className="text-xs text-heliotrope-500 font-medium mt-0.5" numberOfLines={1}>
                      {[s.city, s.phone].filter(Boolean).join(' · ') || 'No contact details'}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text
                      style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                      className={`text-base font-bold ${s.pending_amount_paise > 0 ? 'text-fuchsia-700' : 'text-spaceCadet-900'}`}
                    >
                      {formatPaiseShort(s.pending_amount_paise)}
                    </Text>
                    <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider mt-0.5">pending</Text>
                  </View>
                  <ChevronRight size={16} color="#928EB2" />
                </View>
              </AnimatedPressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
