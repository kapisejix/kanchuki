// Task 28: Retailer taste analytics screen.
// Shows aggregated customer preference data with bar charts.
// K-anonymity: dimensions with <5 contributors are hidden.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ChevronLeft, Palette, Shirt, Sparkles, Wallet } from 'lucide-react-native'
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { request } from '../../src/lib/api'

interface TasteData {
  total_visitors: number
  passport_visitors: number
  top_colors: Record<string, number>
  top_styles: Record<string, number>
  top_fabrics: Record<string, number>
  top_occasions: Record<string, number>
  budget: { avg_min: number | null; avg_max: number | null; range_distribution: Record<string, number> }
  k_anonymity_threshold: number
  has_sufficient_data: boolean
}

function BarChart({ data, maxColor }: { data: Record<string, number>; maxColor: string }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a)
  const maxVal = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <View className="gap-2">
      {entries.map(([label, count]) => (
        <View key={label} className="flex-row items-center gap-2">
          <Text className="text-xs text-spaceCadet-700 w-20 text-right" numberOfLines={1}>
            {label}
          </Text>
          <View className="flex-1 h-5 bg-lavender-100 rounded-full overflow-hidden">
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.max(4, (count / maxVal) * 100)}%`,
                backgroundColor: maxColor,
              }}
            />
          </View>
          <Text className="text-[10px] text-spaceCadet-500 w-8">{count}</Text>
        </View>
      ))}
    </View>
  )
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-4">
      <View className="flex-row items-center gap-2 mb-3">
        {icon}
        <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">{title}</Text>
      </View>
      {children}
    </View>
  )
}

export default function TasteAnalyticsScreen() {
  const insets = useSafeAreaInsets()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['visitor-taste'],
    queryFn: () => request<{ data: TasteData }>('/v1/retailers/me/visitor-taste'),
    staleTime: 60_000,
  })

  const taste = data?.data

  return (
    <View className="flex-1 bg-ghostWhite-50" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center gap-3 px-4 py-3">
        <AnimatedPressable onPress={() => router.back()}>
          <ChevronLeft size={24} color="#231F48" />
        </AnimatedPressable>
        <Text className="text-lg font-bold text-spaceCadet-900 flex-1">Customer Taste Profile</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#BB3F95" />
        </View>
      ) : !taste ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-spaceCadet-500 text-center">Failed to load taste data</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} />}
        >
          {/* Summary Stats */}
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 bg-white rounded-2xl p-4 border border-lavender-200">
              <Text className="text-2xl font-bold text-heliotrope-600">{taste.total_visitors}</Text>
              <Text className="text-[10px] text-spaceCadet-500 mt-1">Total Visitors</Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl p-4 border border-lavender-200">
              <Text className="text-2xl font-bold text-heliotrope-600">{taste.passport_visitors}</Text>
              <Text className="text-[10px] text-spaceCadet-500 mt-1">Passport Users</Text>
            </View>
          </View>

          {!taste.has_sufficient_data && (
            <View className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
              <Text className="text-xs text-amber-700 font-medium">
                Need {taste.k_anonymity_threshold}+ passport users for detailed insights. Currently showing aggregated data only.
              </Text>
            </View>
          )}

          {/* Colors */}
          {Object.keys(taste.top_colors).length > 0 && (
            <Section icon={<Palette size={16} color="#BB3F95" />} title="Top Colors">
              <BarChart data={taste.top_colors} maxColor="#BB3F95" />
            </Section>
          )}

          {/* Styles */}
          {Object.keys(taste.top_styles).length > 0 && (
            <Section icon={<Shirt size={16} color="#BB3F95" />} title="Top Styles">
              <BarChart data={taste.top_styles} maxColor="#9B59B6" />
            </Section>
          )}

          {/* Fabrics */}
          {Object.keys(taste.top_fabrics).length > 0 && (
            <Section icon={<Sparkles size={16} color="#BB3F95" />} title="Top Fabrics">
              <BarChart data={taste.top_fabrics} maxColor="#3498DB" />
            </Section>
          )}

          {/* Budget */}
          {Object.keys(taste.budget.range_distribution).length > 0 && (
            <Section icon={<Wallet size={16} color="#BB3F95" />} title="Budget Ranges">
              <BarChart data={taste.budget.range_distribution} maxColor="#27AE60" />
              {taste.budget.avg_min && (
                <View className="mt-3 pt-3 border-t border-lavender-100">
                  <Text className="text-xs text-spaceCadet-500">
                    Avg Budget: ₹{Math.round(taste.budget.avg_min / 100)} – ₹{Math.round((taste.budget.avg_max || taste.budget.avg_min) / 100)}
                  </Text>
                </View>
              )}
            </Section>
          )}

          {Object.keys(taste.top_colors).length === 0 &&
            Object.keys(taste.top_styles).length === 0 &&
            Object.keys(taste.top_fabrics).length === 0 && (
            <View className="bg-white rounded-3xl p-6 border border-lavender-200 items-center">
              <Text className="text-spaceCadet-500 text-center text-sm">
                No taste data available yet. Data builds as customers browse and interact with your store.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}
