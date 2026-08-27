import { formatPaiseShort } from '@kanchuki/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ChevronLeft, Gift, Plus, RefreshCw, Ticket } from 'lucide-react-native'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { customerApi } from '../../src/lib/api'
import { growthApi, type Referral } from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'


export default function ReferralsScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [reward, setReward] = useState('')
  const [showCustomerPicker, setShowCustomerPicker] = useState(false)
  const [customerSearch, setCustomerSearch] = useState('')
  const [pickedCustomer, setPickedCustomer] = useState<{ id: string; name: string | null } | null>(null)
  const [creditingReferral, setCreditingReferral] = useState<Referral | null>(null)

  const settingsQuery = useQuery({
    queryKey: ['growth', 'referral-settings'],
    queryFn: () => growthApi.referralSettings(),
  })
  const referralsQuery = useQuery({
    queryKey: ['growth', 'referrals'],
    queryFn: () => growthApi.referrals(),
  })
  const customersQuery = useQuery({
    queryKey: ['customers', 'search', customerSearch],
    queryFn: () => customerApi.list(customerSearch || undefined, undefined),
    enabled: showCustomerPicker,
  })

  const settings = settingsQuery.data?.data
  const enabled = settings?.referral_enabled ?? false
  const rewardPaise = settings?.referral_reward_paise ?? 0
  const referrals = referralsQuery.data?.data ?? []
  const customers = (customersQuery.data?.data ?? []) as {
    id: string
    name: string | null
    phone: string
  }[]

  const saveSettings = useMutation({
    mutationFn: () =>
      growthApi.updateReferralSettings({
        referral_enabled: enabled,
        referral_reward_paise: Math.round((parseFloat(reward) || 0) * 100),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'referral-settings'] })
      setReward('')
    },
    onError: (err) => showError(err, 'Failed to save referral settings'),
  })

  const toggleEnabled = useMutation({
    mutationFn: (v: boolean) =>
      growthApi.updateReferralSettings({
        referral_enabled: v,
        referral_reward_paise: rewardPaise,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'referral-settings'] })
    },
    onError: (err) => showError(err, 'Failed to update referrals'),
  })

  const createCode = useMutation({
    mutationFn: (customerId: string) => growthApi.createReferralCode(customerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'referrals'] })
      setShowCustomerPicker(false)
      setPickedCustomer(null)
      setCustomerSearch('')
    },
    onError: (err) => showError(err, 'Failed to generate referral code'),
  })

  const credit = useMutation({
    mutationFn: ({ id, friendCustomerId }: { id: string; friendCustomerId: string }) =>
      growthApi.creditReferral(id, friendCustomerId),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'referrals'] })
      setShowCustomerPicker(false)
      setCreditingReferral(null)
      setPickedCustomer(null)
      setCustomerSearch('')
      Alert.alert('Reward credited', res.data.message ?? 'Discount applied to both parties.')
    },
    onError: (err) => showError(err, 'Could not credit this referral'),
  })

  const handleSaveSettings = () => {
    if (!reward || isNaN(parseFloat(reward)) || parseFloat(reward) <= 0) {
      Alert.alert('Reward amount', 'Enter a reward amount in ₹ for each successful referral.')
      return
    }
    saveSettings.mutate()
  }

  const handleCredit = (r: Referral) => {
    setCreditingReferral(r)
    setShowCustomerPicker(true)
  }

  const filteredCustomers = creditingReferral
    ? customers.filter((c) => c.id !== creditingReferral.customer_id)
    : customers.filter(
        (c) =>
          !c.name ||
          !referrals.some((r) => r.customer_id === c.id) ||
          (customerSearch.trim().length > 0 && referrals.some((r) => r.customer_id === c.id)),
      )

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900">Referrals</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Settings */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100 mb-4">
          <View className="flex-row items-center gap-2 mb-1">
            <Gift size={16} color={primaryColor} />
            <Text className="text-sm font-bold text-sand-900">Referral program</Text>
          </View>
          <Text className="text-xs text-sand-500 leading-4 mb-3">
            Give customers a code to share with friends. You get new leads; the friend gets a
            discount on their first order.
          </Text>
          <View className="flex-row items-center justify-between py-2 border-t border-sand-100">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-medium text-sand-800">Referrals enabled</Text>
              <Text className="text-xs text-sand-400 mt-0.5">
                Turn the program on to start generating codes
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(v) => toggleEnabled.mutate(v)}
              trackColor={{ true: primaryColor, false: colors.sand[200] }}
              accessibilityLabel="Referrals enabled"
            />
          </View>
          {enabled && (
            <View className="mt-2 border-t border-sand-100 pt-3">
              <Text className="text-xs font-medium text-sand-600 mb-1.5">Reward per referral (₹)</Text>
              <View className="flex-row gap-2">
                <TextInput
                  value={reward}
                  onChangeText={setReward}
                  placeholder={formatPaiseShort(rewardPaise)}
                  placeholderTextColor={colors.sand[400]}
                  keyboardType="decimal-pad"
                  className="flex-1 text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-2.5"
                />
                <View className="w-28">
                  <GradientButton
                    label={saveSettings.isPending ? 'Saving…' : 'Save'}
                    onPress={handleSaveSettings}
                    loading={saveSettings.isPending}
                  />
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Referral codes */}
        <View className="flex-row items-center justify-between mb-2.5 px-1">
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
            Referral codes
          </Text>
          <AnimatedPressable
            onPress={() => setShowCustomerPicker((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text className="text-xs font-semibold" style={{ color: primaryColor }}>
              + Generate code
            </Text>
          </AnimatedPressable>
        </View>

        {showCustomerPicker && (
          <View className="bg-white rounded-2xl p-4 border border-sand-100 mb-4">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-bold text-sand-900">
                {creditingReferral ? 'Who converted?' : 'Pick a customer'}
              </Text>
              {creditingReferral && (
                <AnimatedPressable
                  onPress={() => {
                    setShowCustomerPicker(false)
                    setCreditingReferral(null)
                  }}
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-sand-400">Cancel</Text>
                </AnimatedPressable>
              )}
            </View>
            <TextInput
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Search by name or phone…"
              placeholderTextColor={colors.sand[400]}
              className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-2.5 mb-2.5"
              autoFocus
            />
            {customersQuery.isLoading ? (
              <View className="py-6 items-center">
                <ActivityIndicator color={primaryColor} />
              </View>
            ) : (
              <ScrollView className="max-h-64" keyboardShouldPersistTaps="handled">
                <View className="gap-1.5">
                  {filteredCustomers.length === 0 ? (
                    <Text className="text-xs text-sand-400 py-3 text-center">
                      No matching customers — add them from the Customers tab first.
                    </Text>
                  ) : (
                    filteredCustomers.map((c) => (
                      <AnimatedPressable
                        key={c.id}
                        onPress={() => {
                          setPickedCustomer(c)
                          if (creditingReferral) {
                            credit.mutate({ id: creditingReferral.id, friendCustomerId: c.id })
                            return
                          }
                          if (!enabled) {
                            Alert.alert('Referrals off', 'Enable the referral program first.')
                            return
                          }
                          createCode.mutate(c.id)
                        }}
                        accessibilityRole="button"
                        className="flex-row items-center justify-between bg-sand-50 rounded-xl px-3 py-2.5 border border-sand-100"
                      >
                        <View className="flex-1 mr-2">
                          <Text className="text-sm font-semibold text-sand-800" numberOfLines={1}>
                            {c.name ?? 'Unnamed customer'}
                          </Text>
                          {c.phone ? <Text className="text-xs text-sand-400">{c.phone}</Text> : null}
                        </View>
                        {(createCode.isPending || credit.isPending) && pickedCustomer?.id === c.id ? (
                          <ActivityIndicator size="small" color={primaryColor} />
                        ) : (
                          <Text className="text-[11px] font-semibold" style={{ color: primaryColor }}>
                            {creditingReferral ? 'Select' : 'Generate'}
                          </Text>
                        )}
                      </AnimatedPressable>
                    ))
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        )}

        {referralsQuery.isLoading ? (
          <View className="bg-white rounded-2xl p-6 border border-sand-100 items-center">
            <ActivityIndicator color={primaryColor} />
          </View>
        ) : referrals.length === 0 ? (
          <View className="bg-white rounded-2xl p-6 border border-sand-100 items-center">
            <View className="w-12 h-12 rounded-2xl items-center justify-center mb-3" style={{ backgroundColor: `${primaryColor}1A` }}>
              <Ticket size={22} color={primaryColor} />
            </View>
            <Text className="text-sm font-semibold text-sand-700">No referral codes yet</Text>
            <Text className="text-xs text-sand-400 text-center mt-1 leading-4">
              Generate a code for a loyal customer and share it with them on WhatsApp.
            </Text>
          </View>
        ) : (
          <View className="gap-2.5">
            {referrals.map((r) => {
              const pendingCredits = r.credits.filter((c) => c.status === 'PENDING').length
              return (
                <View key={r.id} className="bg-white rounded-2xl p-4 border border-sand-100">
                  <View className="flex-row items-center justify-between mb-1.5">
                    <View className="flex-1 mr-2">
                      <Text className="text-sm font-bold text-sand-900" numberOfLines={1}>
                        {r.customer?.name ?? 'Customer'}
                      </Text>
                      {r.customer?.phone ? (
                        <Text className="text-xs text-sand-400">{r.customer.phone}</Text>
                      ) : null}
                    </View>
                    <View
                      className="rounded-lg px-2.5 py-1"
                      style={{ backgroundColor: `${primaryColor}1A` }}
                    >
                      <Text className="text-[11px] font-bold" style={{ color: primaryColor }}>
                        {r.code}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row gap-3 mt-2">
                    <View className="flex-1 bg-sand-50 rounded-xl px-3 py-2">
                      <Text className="text-base font-bold text-sand-900">{r.clicks}</Text>
                      <Text className="text-[10px] text-sand-400">clicks</Text>
                    </View>
                    <View className="flex-1 bg-sand-50 rounded-xl px-3 py-2">
                      <Text className="text-base font-bold text-sand-900">{r.signups}</Text>
                      <Text className="text-[10px] text-sand-400">signups</Text>
                    </View>
                    <View className="flex-1 bg-sand-50 rounded-xl px-3 py-2">
                      <Text className="text-base font-bold text-sand-900">{formatPaiseShort(r.reward_paise)}</Text>
                      <Text className="text-[10px] text-sand-400">reward</Text>
                    </View>
                  </View>
                  {pendingCredits > 0 && (
                    <View className="mt-2">
                      <View className="flex-row items-center gap-1.5 bg-turmeric-50 rounded-xl px-3 py-2 border border-turmeric-100">
                        <RefreshCw size={12} color={colors.turmeric[600]} />
                        <Text className="text-[11px] text-turmeric-700 font-medium">
                          {pendingCredits} PENDING reward credit{pendingCredits > 1 ? 's' : ''} — apply the
                          discount when the friend orders
                        </Text>
                      </View>
                    </View>
                  )}
                  <View className="mt-3">
                    <GradientButton
                      label={credit.isPending ? 'Crediting…' : 'Mark converted & credit'}
                      onPress={() => handleCredit(r)}
                      disabled={pendingCredits > 0 || !enabled}
                      loading={credit.isPending}
                    />
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
