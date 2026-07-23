import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Linking, Alert, ActivityIndicator } from 'react-native'
import { Stack } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, CreditCard, XCircle, ShieldAlert } from 'lucide-react-native'
import { billingApi } from '../src/lib/api'

const PLAN_FEATURES: Record<string, string[]> = {
  STARTER: ['500 products', 'Unlimited customers', '50 collection links/month'],
  GROWTH: ['2,000 products', 'Unlimited customers', 'Unlimited collection links', '100 try-on credits'],
  PRO: ['Unlimited products', 'Unlimited customers', 'Unlimited collection links', '500 try-on credits', 'WhatsApp API'],
}

export default function BillingScreen() {
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly')
  const queryClient = useQueryClient()

  const { data: plansData, isLoading } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => billingApi.getPlans(),
  })
  const { data: subData } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => billingApi.getSubscription(),
  })

  const subscribe = useMutation({
    mutationFn: ({ plan }: { plan: string }) => billingApi.subscribe(plan, period),
    onSuccess: async (res) => {
      await Linking.openURL(res.data.checkout_url)
    },
    onError: (err: Error) => {
      Alert.alert('Could not start subscription', err.message)
    },
  })

  const cancel = useMutation({
    mutationFn: () => billingApi.cancel(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['billing'] })
      Alert.alert('Cancelled', 'Subscription cancelled. You keep access until period end.')
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message || 'Could not cancel. Please contact support.')
    },
  })

  const confirmCancel = () => {
    Alert.alert(
      'Cancel Subscription?',
      'You will retain access until the end of the current billing period.',
      [
        { text: 'Keep Plan', style: 'cancel' },
        { text: 'Cancel', style: 'destructive', onPress: () => cancel.mutate() },
      ],
    )
  }

  const plans = plansData?.data ?? []
  const current = subData?.data
  const isTrial = current?.plan_status === 'TRIAL'
  const isActive = current?.plan_status === 'ACTIVE'
  const isCancelled = current?.plan_status === 'CANCELLED'

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#0891B2" />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Plans & Billing', headerShown: true }} />
      <ScrollView className="flex-1 bg-gray-50 px-4 pt-4">
        {/* Current plan banner */}
        {current && (
          <View className={`rounded-2xl p-4 mb-5 border ${
            isCancelled ? 'bg-red-50 border-red-200' :
            isActive ? 'bg-green-50 border-green-200' :
            'bg-amber-50 border-amber-200'
          }`}>
            <View className="flex-row items-center gap-2 mb-1">
              {isCancelled ? (
                <XCircle size={18} color="#DC2626" />
              ) : isActive ? (
                <CreditCard size={18} color="#16A34A" />
              ) : (
                <ShieldAlert size={18} color="#D97706" />
              )}
              <Text className={`font-bold text-sm ${
                isCancelled ? 'text-red-700' :
                isActive ? 'text-green-700' :
                'text-amber-700'
              }`}>
                {isCancelled ? 'Subscription Cancelled' :
                 isActive ? `${current.plan} Plan · Active` :
                 `${current.plan} Plan · Trial`}
              </Text>
            </View>
            {isTrial && current.trial_ends_at && (
              <Text className="text-amber-700 text-xs mt-1">
                Free trial ends{' '}
                {new Date(current.trial_ends_at).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}. Subscribe now — you won&apos;t be charged until then.
              </Text>
            )}
            {isActive && (
              <Text className="text-green-700 text-xs mt-1">
                Your subscription is active. You can switch plans at any time.
              </Text>
            )}
            {isCancelled && (
              <Text className="text-red-700 text-xs mt-1">
                Your subscription has ended. Choose a plan to reactivate.
              </Text>
            )}
          </View>
        )}

        {/* Period toggle — hide if cancelled */}
        {!isCancelled && (
          <View className="flex-row bg-gray-200 rounded-xl p-1 mb-4">
            {(['monthly', 'annual'] as const).map((p) => (
              <TouchableOpacity
                key={p}
                onPress={() => setPeriod(p)}
                className={`flex-1 py-2.5 rounded-lg items-center ${period === p ? 'bg-white shadow-sm' : ''}`}
              >
                <Text className={`text-sm font-medium ${period === p ? 'text-gray-900' : 'text-gray-500'}`}>
                  {p === 'monthly' ? 'Monthly' : 'Annual (save 20%)'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Plan cards */}
        {plans.map((p) => {
          const isCurrentPlan = current?.plan === p.plan && (isActive || isTrial)
          const pricePaise = period === 'monthly' ? p.pricing.monthly : p.pricing.annual
          const monthlyPrice = period === 'annual' ? Math.round(p.pricing.annual / 12) : p.pricing.monthly

          return (
            <View key={p.plan} className={`bg-white rounded-2xl p-5 mb-3 border ${
              isCurrentPlan ? 'border-cyan-300' : 'border-gray-100'
            }`}>
              <View className="flex-row items-baseline justify-between mb-1">
                <Text className="text-lg font-bold text-gray-900">{p.plan}</Text>
                <View className="items-end">
                  <Text className="text-xl font-bold text-cyan-600">
                    ₹{(pricePaise / 100).toLocaleString('en-IN')}
                    <Text className="text-xs text-gray-400 font-normal">
                      /{period === 'monthly' ? 'mo' : 'yr'}
                    </Text>
                  </Text>
                  {period === 'annual' && (
                    <Text className="text-xs text-gray-400">
                      ₹{(monthlyPrice / 100).toLocaleString('en-IN')}/mo billed yearly
                    </Text>
                  )}
                </View>
              </View>

              <View className="mt-3 gap-2">
                {(PLAN_FEATURES[p.plan] ?? []).map((f) => (
                  <View key={f} className="flex-row items-center gap-2">
                    <Check size={15} color="#10B981" />
                    <Text className="text-sm text-gray-600">{f}</Text>
                  </View>
                ))}
              </View>

              {/* Action button */}
              {!isCancelled && (
                <TouchableOpacity
                  disabled={isCurrentPlan || subscribe.isPending}
                  onPress={() => subscribe.mutate({ plan: p.plan })}
                  className={`mt-4 py-3 rounded-xl items-center ${
                    isCurrentPlan ? 'bg-gray-100' :
                    isActive && current?.plan !== p.plan ? 'bg-cyan-500' :
                    'bg-cyan-600'
                  }`}
                >
                  <Text className={`font-semibold text-sm ${
                    isCurrentPlan ? 'text-gray-400' : 'text-white'
                  }`}>
                    {isCurrentPlan ? '✓ Current Plan' :
                     subscribe.isPending ? 'Opening Razorpay…' :
                     isActive ? 'Switch to ' + p.plan :
                     'Subscribe to ' + p.plan}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )
        })}

        {/* Cancel subscription — only for active/trial */}
        {(isActive || isTrial) && (
          <TouchableOpacity
            onPress={confirmCancel}
            className="py-3 items-center mt-2"
          >
            <Text className="text-sm text-red-500 font-medium">
              Cancel subscription
            </Text>
            <Text className="text-xs text-gray-400 mt-1">
              You can keep using Kanchuki until the period ends
            </Text>
          </TouchableOpacity>
        )}

        <Text className="text-xs text-gray-400 text-center mt-4 mb-10">
          Secure payments via Razorpay · UPI, Cards & Netbanking · Prices include GST
        </Text>
      </ScrollView>
    </>
  )
}
