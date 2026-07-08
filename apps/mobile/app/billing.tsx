import { useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, Linking, Alert, ActivityIndicator } from 'react-native'
import { Stack } from 'expo-router'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Check } from 'lucide-react-native'
import { billingApi } from '../src/lib/api'

const PLAN_FEATURES: Record<string, string[]> = {
  STARTER: ['500 products', '200 customers', '50 collection links/month'],
  GROWTH: ['2000 products', '1000 customers', 'Unlimited collection links', '100 try-on credits'],
  PRO: ['Unlimited products', 'Unlimited customers', 'Unlimited collection links', '500 try-on credits', 'WhatsApp API'],
}

export default function BillingScreen() {
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly')

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

  const plans = plansData?.data ?? []
  const current = subData?.data

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Choose Plan' }} />
      <ScrollView className="flex-1 bg-gray-50 px-4 pt-4">
        {current?.plan_status === 'TRIAL' && current.trial_ends_at && (
          <View className="bg-amber-50 rounded-xl p-3 mb-4">
            <Text className="text-amber-700 text-sm">
              Free trial ends {new Date(current.trial_ends_at).toLocaleDateString('en-IN')}.
              Subscribe now — you won&apos;t be charged until the trial ends.
            </Text>
          </View>
        )}

        {/* Period toggle */}
        <View className="flex-row bg-gray-200 rounded-xl p-1 mb-4">
          {(['monthly', 'annual'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg items-center ${period === p ? 'bg-white' : ''}`}
            >
              <Text className={`text-sm font-medium ${period === p ? 'text-gray-900' : 'text-gray-500'}`}>
                {p === 'monthly' ? 'Monthly' : 'Annual (save 20%)'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {plans.map((p) => {
          const isCurrent = current?.plan === p.plan && current?.plan_status === 'ACTIVE'
          const pricePaise = period === 'monthly' ? p.pricing.monthly : p.pricing.annual
          return (
            <View key={p.plan} className="bg-white rounded-2xl p-4 mb-3 border border-gray-100">
              <View className="flex-row items-baseline justify-between">
                <Text className="text-lg font-bold text-gray-900">{p.plan}</Text>
                <Text className="text-xl font-bold text-violet-600">
                  ₹{(pricePaise / 100).toLocaleString('en-IN')}
                  <Text className="text-xs text-gray-400 font-normal">
                    /{period === 'monthly' ? 'mo' : 'yr'}
                  </Text>
                </Text>
              </View>
              <View className="mt-3 gap-1.5">
                {(PLAN_FEATURES[p.plan] ?? []).map((f) => (
                  <View key={f} className="flex-row items-center gap-2">
                    <Check size={14} color="#10B981" />
                    <Text className="text-sm text-gray-600">{f}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                disabled={isCurrent || subscribe.isPending}
                onPress={() => subscribe.mutate({ plan: p.plan })}
                className={`mt-4 py-3 rounded-xl items-center ${
                  isCurrent ? 'bg-gray-100' : 'bg-violet-600'
                }`}
              >
                <Text className={`font-semibold ${isCurrent ? 'text-gray-400' : 'text-white'}`}>
                  {isCurrent ? 'Current Plan' : subscribe.isPending ? 'Opening…' : 'Subscribe'}
                </Text>
              </TouchableOpacity>
            </View>
          )
        })}

        <Text className="text-xs text-gray-400 text-center mt-2 mb-8">
          Payments via Razorpay (UPI, cards, netbanking). Prices include GST.
        </Text>
      </ScrollView>
    </>
  )
}
