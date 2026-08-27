import { formatPaiseShort } from '@kanchuki/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ChevronLeft, Percent, Plus, Tag, Trash2 } from 'lucide-react-native'
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Switch, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { growthApi, type Promotion } from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'


function promoBadge(p: Promotion) {
  if (p.discount_type === 'PERCENT') return `${p.discount_value}% off`
  return `${formatPaiseShort(p.discount_value)} off`
}

export default function PromotionsScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'promotions'],
    queryFn: () => growthApi.promotions(),
  })
  const promotions = data?.data ?? []

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      growthApi.updatePromotion(id, { is_active }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['growth', 'promotions'] }),
    onError: (err) => showError(err, 'Failed to update promotion'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => growthApi.deletePromotion(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['growth', 'promotions'] }),
    onError: (err) => showError(err, 'Failed to delete promotion'),
  })

  const confirmDelete = (p: Promotion) => {
    Alert.alert('Delete promotion?', `"${p.code}" will stop working for new orders.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(p.id) },
    ])
  }

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
            <Text className="text-base font-bold text-sand-900">Promotions</Text>
          </View>
          <AnimatedPressable
            onPress={() => router.push('/growth/promotion-form')}
            accessibilityLabel="New promotion"
            accessibilityRole="button"
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: `${primaryColor}1A` }}
          >
            <Plus size={20} color={primaryColor} />
          </AnimatedPressable>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : promotions.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <Percent size={28} color={primaryColor} />
            </View>
            <Text className="text-base font-bold text-sand-900">No promotions yet</Text>
            <Text className="text-xs text-sand-500 text-center mt-1.5 leading-4 max-w-[260px]">
              Create a discount code — percentage off or flat ₹ — for your store or specific products.
            </Text>
            <View className="w-48 mt-5">
              <GradientButton label="Create Promotion" onPress={() => router.push('/growth/promotion-form')} />
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          <View className="gap-2.5">
            {promotions.map((p) => (
              <View key={p.id} className="bg-white rounded-2xl p-4 border border-sand-100">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-2 flex-1 mr-2">
                    <View
                      className="w-9 h-9 rounded-xl items-center justify-center"
                      style={{ backgroundColor: `${primaryColor}1A` }}
                    >
                      <Tag size={16} color={primaryColor} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-sand-900" numberOfLines={1}>
                        {p.code}
                      </Text>
                      <Text className="text-xs text-sand-400">
                        {promoBadge(p)}
                        {p.min_order_paise ? ` · min ${formatPaiseShort(p.min_order_paise)}` : ''}
                        {p.times_used > 0 ? ` · used ${p.times_used}×` : ''}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={p.is_active}
                    onValueChange={(v) => toggleActive.mutate({ id: p.id, is_active: v })}
                    trackColor={{ true: primaryColor, false: colors.sand[200] }}
                    accessibilityLabel={`${p.code} active`}
                  />
                </View>
                <View className="flex-row items-center gap-2 mt-1">
                  <View className="bg-sand-50 rounded-full px-2.5 py-1">
                    <Text className="text-[10px] font-semibold text-sand-500 uppercase">
                      {p.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  {p.product_ids.length > 0 ? (
                    <Text className="text-[10px] text-sand-400">
                      {p.product_ids.length} product{p.product_ids.length > 1 ? 's' : ''} only
                    </Text>
                  ) : (
                    <Text className="text-[10px] text-sand-400">Store-wide</Text>
                  )}
                  <View className="flex-1" />
                  <AnimatedPressable
                    onPress={() => confirmDelete(p)}
                    hitSlop={8}
                    accessibilityLabel={`Delete ${p.code}`}
                    accessibilityRole="button"
                  >
                    <Trash2 size={15} color={colors.rust[500]} />
                  </AnimatedPressable>
                </View>
              </View>
            ))}
          </View>
          <View className="mt-5">
            <GradientButton label="+ New Promotion" onPress={() => router.push('/growth/promotion-form')} />
          </View>
        </ScrollView>
      )}
    </View>
  )
}
