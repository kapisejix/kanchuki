import { useState } from 'react'
import { COLORS } from '@kanchuki/shared'
import { View, Text, ScrollView, Linking, Alert } from 'react-native'
import { router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, CreditCard, XCircle, ShieldAlert, ShoppingCart, ChevronLeft } from 'lucide-react-native'
import { billingApi, retailerApi } from '../src/lib/api'
import { showError } from '../src/lib/errors'
import { useTheme } from '../src/lib/theme'
import { BillingSkeleton } from '../src/components/Skeleton'
import { AnimatedPressable } from '../src/components/AnimatedPressable'

const RESOURCE_LABELS: Record<string, string> = {
  PRODUCT_UPLOAD: 'Product uploads',
  AI_TAGGING_CALL: 'AI tagging calls',
  TRY_ON: 'Try-ons',
  IMAGE_CROP: 'Image crops',
  BG_REMOVAL: 'Background removals',
  API_REQUEST: 'API requests',
}

const PLAN_FEATURES: Record<string, string[]> = {
  STARTER: ['500 products', 'Unlimited customers', '50 collection links/month'],
  GROWTH: ['2,000 products', 'Unlimited customers', 'Unlimited collection links', '100 try-on credits'],
  PRO: ['Unlimited products', 'Unlimited customers', 'Unlimited collection links', '500 try-on credits', 'WhatsApp API'],
}

export default function BillingScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly')
  const [buyingResource, setBuyingResource] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: plansData, isLoading } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => billingApi.getPlans(),
  })
  const { data: subData } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => billingApi.getSubscription(),
  })

  const { data: usageData } = useQuery({
    queryKey: ['retailer', 'usage'],
    queryFn: () => retailerApi.getUsage(),
  })

  const { data: addonPricingData } = useQuery({
    queryKey: ['billing', 'addon-pricing'],
    queryFn: () => billingApi.getAddonPricing(),
  })

  const subscribe = useMutation({
    mutationFn: ({ plan }: { plan: string }) => billingApi.subscribe(plan, period),
    onSuccess: async (res) => {
      await Linking.openURL(res.data.checkout_url)
    },
    onError: (err: Error) => {
      showError(err, 'Please try again.', 'Could not start subscription')
    },
  })

  const cancel = useMutation({
    mutationFn: () => billingApi.cancel(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['billing'] })
      Alert.alert('Cancelled', 'Subscription cancelled. You keep access until period end.')
    },
    onError: (err: Error) => {
      showError(err, 'Could not cancel. Please contact support.')
    },
  })

  const addonCheckout = useMutation({
    mutationFn: ({
      resourceType,
      packIndex,
    }: {
      resourceType: string
      packIndex: number
    }) => billingApi.addonCheckout(resourceType, packIndex),
    onSuccess: async (res) => {
      setBuyingResource(null)
      // Open Razorpay Payment Link in browser
      if (res.data.checkout_url) {
        await Linking.openURL(res.data.checkout_url)
        // After returning from browser, refresh usage data
        setTimeout(async () => {
          await queryClient.invalidateQueries({ queryKey: ['retailer', 'usage'] })
        }, 2000)
      }
    },
    onError: (err: Error) => {
      setBuyingResource(null)
      showError(err, 'Could not start addon checkout', 'Purchase failed')
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
    return <BillingSkeleton />
  }

  return (
    <View className="flex-1 bg-sand-50">
      <View
        className="flex-row items-center px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <AnimatedPressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
          <ChevronLeft size={24} color={colors.sand[700]} />
        </AnimatedPressable>
        <Text className="text-base font-bold text-sand-900 ml-3">Plans & Billing</Text>
      </View>
      <ScrollView className="flex-1 bg-sand-50 px-4 pt-4">
        {/* Current plan banner */}
        {current && (
          <View className={`rounded-2xl p-4 mb-5 border ${
            isCancelled ? 'bg-rust-50 border-rust-200' :
            isActive ? 'bg-turmeric-50 border-turmeric-200' :
            'bg-turmeric-50 border-turmeric-200'
          }`}>
            <View className="flex-row items-center gap-2 mb-1">
              {isCancelled ? (
                <XCircle size={18} color={colors.rust[600]} />
              ) : isActive ? (
                <CreditCard size={18} color={colors.turmeric[600]} />
              ) : (
                <ShieldAlert size={18} color={colors.turmeric[600]} />
              )}
              <Text className={`font-bold text-sm ${
                isCancelled ? 'text-rust-700' :
                isActive ? 'text-turmeric-700' :
                'text-turmeric-700'
              }`}>
                {isCancelled ? 'Subscription Cancelled' :
                 isActive ? `${current.plan} Plan · Active` :
                 `${current.plan} Plan · Trial`}
              </Text>
            </View>
            {isTrial && current.trial_ends_at && (
              <Text className="text-turmeric-700 text-xs mt-1">
                Free trial ends{' '}
                {new Date(current.trial_ends_at).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'long', year: 'numeric',
                })}. Subscribe now — you won&apos;t be charged until then.
              </Text>
            )}
            {isActive && (
              <Text className="text-turmeric-700 text-xs mt-1">
                Your subscription is active. You can switch plans at any time.
              </Text>
            )}
            {isCancelled && (
              <Text className="text-rust-700 text-xs mt-1">
                Your subscription has ended. Choose a plan to reactivate.
              </Text>
            )}
          </View>
        )}

        {/* Period toggle — hide if cancelled */}
        {!isCancelled && (
          <View className="flex-row bg-sand-200 rounded-xl p-1 mb-4">
            {(['monthly', 'annual'] as const).map((p) => (
              <AnimatedPressable
                key={p}
                onPress={() => setPeriod(p)}
                className={`flex-1 py-2.5 rounded-lg items-center ${period === p ? 'bg-white shadow-sm' : ''}`}
              >
                <Text className={`text-sm font-medium ${period === p ? 'text-sand-900' : 'text-sand-500'}`}>
                  {p === 'monthly' ? 'Monthly' : 'Annual (save 20%)'}
                </Text>
              </AnimatedPressable>
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
              isCurrentPlan ? 'border-ink-300' : 'border-sand-100'
            }`}>
              <View className="flex-row items-baseline justify-between mb-1">
                <Text className="text-lg font-bold text-sand-900">{p.plan}</Text>
                <View className="items-end">
                  <Text className="text-xl font-bold text-ink-600">
                    ₹{(pricePaise / 100).toLocaleString('en-IN')}
                    <Text className="text-xs text-sand-400 font-normal">
                      /{period === 'monthly' ? 'mo' : 'yr'}
                    </Text>
                  </Text>
                  {period === 'annual' && (
                    <Text className="text-xs text-sand-400">
                      ₹{(monthlyPrice / 100).toLocaleString('en-IN')}/mo billed yearly
                    </Text>
                  )}
                </View>
              </View>

              <View className="mt-3 gap-2">
                {(PLAN_FEATURES[p.plan] ?? []).map((f) => (
                  <View key={f} className="flex-row items-center gap-2">
                    <Check size={15} color={colors.turmeric[500]} />
                    <Text className="text-sm text-sand-600">{f}</Text>
                  </View>
                ))}
              </View>

              {/* Action button */}
              {!isCancelled && (
                <AnimatedPressable
                  disabled={isCurrentPlan || subscribe.isPending}
                  onPress={() => subscribe.mutate({ plan: p.plan })}
                  className={`mt-4 py-3 rounded-xl items-center ${
                    isCurrentPlan ? 'bg-sand-100' :
                    isActive && current?.plan !== p.plan ? 'bg-ink-500' :
                    'bg-ink-600'
                  }`}
                >
                  <Text className={`font-semibold text-sm ${
                    isCurrentPlan ? 'text-sand-400' : 'text-white'
                  }`}>
                    {isCurrentPlan ? '✓ Current Plan' :
                     subscribe.isPending ? 'Opening Razorpay…' :
                     isActive ? 'Switch to ' + p.plan :
                     'Subscribe to ' + p.plan}
                  </Text>
                </AnimatedPressable>
              )}
            </View>
          )
        })}

        {/* Cancel subscription — only for active/trial */}
        {(isActive || isTrial) && (
          <AnimatedPressable
            onPress={confirmCancel}
            className="py-3 items-center mt-2"
          >
            <Text className="text-sm text-rust-500 font-medium">
              Cancel subscription
            </Text>
            <Text className="text-xs text-sand-400 mt-1">
              You can keep using Kanchuki until the period ends
            </Text>
          </AnimatedPressable>
        )}

        {/* ─── Buy More Addons ───────────────────────────────── */}
        <View className="mt-6 mb-4">
          <View className="flex-row items-center gap-2 mb-3">
            <ShoppingCart size={18} color={primaryColor} />
            <Text className="text-base font-bold text-sand-900">Need More?</Text>
          </View>
          <Text className="text-xs text-sand-500 mb-3">
            Purchase extra credits if you&apos;ve hit your plan limits.
          </Text>

          {usageData?.data?.map((resource: {
            resource_type: string
            limit: number
            used: number
            period: string
            source: string
          }) => {
            const limit = resource.limit
            const used = resource.used
            const pct = limit > 0 ? Math.round((used / limit) * 100) : 0
            const isNearLimit = pct >= 80
            const isAtLimit = pct >= 100

            if (resource.source === 'unlimited' || limit === -1) return null

            const packs = addonPricingData?.data?.[resource.resource_type]
            if (!packs || packs.length === 0) return null

            return (
              <View key={resource.resource_type} className="bg-white rounded-xl p-4 mb-2 border border-sand-100">
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-sm font-medium text-sand-700">
                    {RESOURCE_LABELS[resource.resource_type] ?? resource.resource_type}
                  </Text>
                  <Text className={`text-xs font-medium ${isAtLimit ? 'text-rust-500' : isNearLimit ? 'text-turmeric-500' : 'text-sand-400'}`}>
                    {used}/{limit === 999999 ? '∞' : limit}
                  </Text>
                </View>
                {/* Progress bar */}
                <View className="h-1.5 bg-sand-100 rounded-full mb-3 overflow-hidden">
                  <View
                    className={`h-full rounded-full ${isAtLimit ? 'bg-rust-500' : isNearLimit ? 'bg-turmeric-400' : 'bg-ink-400'}`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </View>
                {/* Pack buttons */}
                <View className="flex-row gap-2">
                  {packs.slice(0, 2).map((pack, idx) => (
                    <AnimatedPressable
                      key={idx}
                      onPress={() => {
                        setBuyingResource(resource.resource_type)
                        addonCheckout.mutate({
                          resourceType: resource.resource_type,
                          packIndex: idx,
                        })
                      }}
                      disabled={addonCheckout.isPending && buyingResource === resource.resource_type}
                      className="flex-1 py-2 px-3 rounded-lg bg-ink-50 border border-ink-200 items-center"
                    >
                      <Text className="text-xs font-semibold text-ink-700">
                        {pack.label}
                      </Text>
                      <Text className="text-xs font-bold text-ink-600 mt-0.5">
                        ₹{(pack.price_paise / 100).toLocaleString('en-IN')}
                      </Text>
                    </AnimatedPressable>
                  ))}
                </View>
              </View>
            )
          })}
        </View>

        <Text className="text-xs text-sand-400 text-center mt-4 mb-10">
          Secure payments via Razorpay · UPI, Cards & Netbanking · Prices include GST
        </Text>
      </ScrollView>
    </View>
  )
}
