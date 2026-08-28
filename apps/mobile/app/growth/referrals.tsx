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
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
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
            Referral Program
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Settings */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-5">
          <View className="flex-row items-center gap-2 mb-1.5">
            <Gift size={18} color="#BB3F95" />
            <Text className="text-base font-bold text-spaceCadet-900">Program Settings</Text>
          </View>
          <Text className="text-xs text-heliotrope-500 leading-relaxed mb-4 font-medium">
            Give customers a code to share with friends. You get new leads; the friend gets a
            discount on their first order.
          </Text>
          <View className="flex-row items-center justify-between py-3 border-t border-lavender-200">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-bold text-spaceCadet-900">Referrals active</Text>
              <Text className="text-xs text-heliotrope-500 mt-0.5 font-medium">
                Turn on to generate sharable customer codes
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(v) => toggleEnabled.mutate(v)}
              trackColor={{ true: '#BB3F95', false: '#E0E1F6' }}
              thumbColor="#ffffff"
              accessibilityLabel="Referrals enabled"
            />
          </View>
          {enabled && (
            <View className="mt-2 border-t border-lavender-200 pt-3.5">
              <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider mb-2">Reward per referral (₹)</Text>
              <View className="flex-row gap-2.5">
                <TextInput
                  value={reward}
                  onChangeText={setReward}
                  placeholder={formatPaiseShort(rewardPaise)}
                  placeholderTextColor="#928EB2"
                  keyboardType="decimal-pad"
                  className="flex-1 text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
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
        <View className="flex-row items-center justify-between mb-3 px-1">
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">
            Active Referral Codes
          </Text>
          <AnimatedPressable
            onPress={() => setShowCustomerPicker((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text className="text-xs font-bold text-fuchsia-700">
              + Generate code
            </Text>
          </AnimatedPressable>
        </View>

        {showCustomerPicker && (
          <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-5">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm font-bold text-spaceCadet-900">
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
                  <Text className="text-xs font-bold text-heliotrope-500">Cancel</Text>
                </AnimatedPressable>
              )}
            </View>
            <TextInput
              value={customerSearch}
              onChangeText={setCustomerSearch}
              placeholder="Search by name or phone…"
              placeholderTextColor="#928EB2"
              className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 mb-3"
              autoFocus
            />
            {customersQuery.isLoading ? (
              <View className="py-6 items-center">
                <ActivityIndicator color="#BB3F95" />
              </View>
            ) : (
              <ScrollView className="max-h-64" keyboardShouldPersistTaps="handled">
                <View className="gap-2">
                  {filteredCustomers.length === 0 ? (
                    <Text className="text-xs text-heliotrope-500 py-3 text-center font-medium">
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
                        className="flex-row items-center justify-between bg-lavender-50 rounded-2xl px-4 py-3 border border-lavender-200"
                      >
                        <View className="flex-1 mr-2">
                          <Text className="text-sm font-bold text-spaceCadet-900" numberOfLines={1}>
                            {c.name ?? 'Unnamed customer'}
                          </Text>
                          {c.phone ? <Text className="text-xs text-heliotrope-500 mt-0.5 font-medium">{c.phone}</Text> : null}
                        </View>
                        {(createCode.isPending || credit.isPending) && pickedCustomer?.id === c.id ? (
                          <ActivityIndicator size="small" color="#BB3F95" />
                        ) : (
                          <Text className="text-xs font-bold text-fuchsia-700">
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
          <View className="bg-white rounded-3xl p-6 border border-lavender-200 items-center">
            <ActivityIndicator color="#BB3F95" />
          </View>
        ) : referrals.length === 0 ? (
          <View className="bg-white rounded-3xl p-6 border border-lavender-200 items-center">
            <View className="w-14 h-14 rounded-2xl items-center justify-center mb-3 bg-lavender-100 border border-lavender-200">
              <Ticket size={24} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-base font-bold text-spaceCadet-900"
            >
              No referral codes yet
            </Text>
            <Text className="text-xs text-heliotrope-500 text-center mt-1 leading-relaxed font-medium">
              Generate a code for a loyal customer and share it with them on WhatsApp.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {referrals.map((r) => {
              const pendingCredits = r.credits.filter((c) => c.status === 'PENDING').length
              return (
                <View key={r.id} className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-1 mr-2">
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular' }}
                        className="text-base font-bold text-spaceCadet-900"
                        numberOfLines={1}
                      >
                        {r.customer?.name ?? 'Customer'}
                      </Text>
                      {r.customer?.phone ? (
                        <Text className="text-xs text-heliotrope-500 mt-0.5 font-medium">{r.customer.phone}</Text>
                      ) : null}
                    </View>
                    <View
                      className="rounded-xl px-3 py-1 bg-fuchsia-500/15 border border-fuchsia-500/30"
                    >
                      <Text className="text-xs font-bold text-fuchsia-700">
                        {r.code}
                      </Text>
                    </View>
                  </View>
                  <View className="flex-row gap-2.5 mt-2.5">
                    <View className="flex-1 bg-lavender-50 rounded-2xl p-3 border border-lavender-200 items-center">
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular' }}
                        className="text-lg font-bold text-spaceCadet-900"
                      >
                        {r.clicks}
                      </Text>
                      <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider mt-0.5">clicks</Text>
                    </View>
                    <View className="flex-1 bg-lavender-50 rounded-2xl p-3 border border-lavender-200 items-center">
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular' }}
                        className="text-lg font-bold text-spaceCadet-900"
                      >
                        {r.signups}
                      </Text>
                      <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider mt-0.5">signups</Text>
                    </View>
                    <View className="flex-1 bg-lavender-50 rounded-2xl p-3 border border-lavender-200 items-center">
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular' }}
                        className="text-lg font-bold text-spaceCadet-900"
                      >
                        {formatPaiseShort(r.reward_paise)}
                      </Text>
                      <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider mt-0.5">reward</Text>
                    </View>
                  </View>
                  {pendingCredits > 0 && (
                    <View className="mt-3">
                      <View className="flex-row items-center gap-1.5 bg-fuchsia-500/10 rounded-2xl p-3 border border-fuchsia-500/20">
                        <RefreshCw size={13} color="#BB3F95" />
                        <Text className="text-xs text-fuchsia-800 font-bold">
                          {pendingCredits} PENDING reward credit{pendingCredits > 1 ? 's' : ''}
                        </Text>
                      </View>
                    </View>
                  )}
                  <View className="mt-4">
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
