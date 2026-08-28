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
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: insets.top + 12 }}
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
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              Promotions & Offers
            </Text>
          </View>
          <AnimatedPressable
            onPress={() => router.push('/growth/promotion-form')}
            accessibilityLabel="New promotion"
            accessibilityRole="button"
            className="w-10 h-10 rounded-2xl items-center justify-center bg-fuchsia-600 shadow-sm"
          >
            <Plus size={20} color="white" />
          </AnimatedPressable>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#BB3F95" />
        </View>
      ) : promotions.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4 bg-lavender-100 border border-lavender-200"
            >
              <Percent size={28} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              No Promotions Yet
            </Text>
            <Text className="text-xs text-heliotrope-500 text-center mt-1.5 leading-relaxed max-w-[260px] font-medium">
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
          <View className="gap-3.5">
            {promotions.map((p) => (
              <View key={p.id} className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-3 flex-1 mr-2">
                    <View
                      className="w-11 h-11 rounded-2xl items-center justify-center bg-lavender-100 border border-lavender-200"
                    >
                      <Tag size={18} color="#BB3F95" />
                    </View>
                    <View className="flex-1">
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular' }}
                        className="text-lg font-bold text-spaceCadet-900"
                        numberOfLines={1}
                      >
                        {p.code}
                      </Text>
                      <Text className="text-xs font-semibold text-fuchsia-700 mt-0.5">
                        {promoBadge(p)}
                        {p.min_order_paise ? ` · min ${formatPaiseShort(p.min_order_paise)}` : ''}
                        {p.times_used > 0 ? ` · used ${p.times_used}×` : ''}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={p.is_active}
                    onValueChange={(v) => toggleActive.mutate({ id: p.id, is_active: v })}
                    trackColor={{ true: '#BB3F95', false: '#E0E1F6' }}
                    thumbColor="#ffffff"
                    accessibilityLabel={`${p.code} active`}
                  />
                </View>
                <View className="flex-row items-center gap-2 mt-2 pt-3 border-t border-lavender-200">
                  <View className={`rounded-full px-3 py-1 ${p.is_active ? 'bg-fuchsia-500/15 border border-fuchsia-500/30' : 'bg-lavender-100 border border-lavender-200'}`}>
                    <Text className={`text-[10px] font-bold uppercase tracking-wider ${p.is_active ? 'text-fuchsia-700' : 'text-heliotrope-500'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  {p.product_ids.length > 0 ? (
                    <Text className="text-xs font-semibold text-heliotrope-500">
                      {p.product_ids.length} product{p.product_ids.length > 1 ? 's' : ''} only
                    </Text>
                  ) : (
                    <Text className="text-xs font-semibold text-heliotrope-500">Store-wide</Text>
                  )}
                  <View className="flex-1" />
                  <AnimatedPressable
                    onPress={() => confirmDelete(p)}
                    hitSlop={8}
                    accessibilityLabel={`Delete ${p.code}`}
                    accessibilityRole="button"
                  >
                    <Trash2 size={16} color="#dc2626" />
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
