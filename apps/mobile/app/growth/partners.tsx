import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ChevronLeft,
  Handshake,
  Plus,
  Users,
  Trash2,
  CreditCard,
  CalendarDays,
} from 'lucide-react-native'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import {
  growthApi,
  type Partner,
  type PartnerType,
} from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

// ─── Helpers ──────────────────────────────────────────────────────

const TYPE_LABELS: Record<PartnerType, string> = {
  SALON: 'Salon',
  TAILOR: 'Tailor',
  STYLIST: 'Stylist',
  MAKEUP_ARTIST: 'Makeup',
  OTHER: 'Other',
}

const TYPE_EMOJI: Record<PartnerType, string> = {
  SALON: '💅',
  TAILOR: '✂️',
  STYLIST: '👗',
  MAKEUP_ARTIST: '💄',
  OTHER: '🤝',
}

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`

// ─── Main Screen ──────────────────────────────────────────────────

export default function PartnersScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'partners'],
    queryFn: () => growthApi.partners(),
  })
  const partners = data?.data ?? []

  const remove = useMutation({
    mutationFn: (id: string) => growthApi.deletePartner(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'partners'] })
    },
    onError: (err) => showError(err, 'Failed to delete partner'),
  })

  const confirmDelete = (p: Partner) => {
    Alert.alert('Remove partner?', `\"${p.name}\" will be deactivated.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(p.id) },
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
            <Text className="text-base font-bold text-sand-900">Partners</Text>
          </View>
          <AnimatedPressable
            onPress={() => setCreating(true)}
            accessibilityLabel="Add partner"
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
      ) : partners.length === 0 && !creating ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <Handshake size={28} color={primaryColor} />
            </View>
            <Text className="text-base font-bold text-sand-900">No partners yet</Text>
            <Text className="text-xs text-sand-500 text-center mt-1.5 leading-4 max-w-[260px]">
              Add local salons, tailors, and stylists as partners.
              They refer customers to your store and earn commission.
            </Text>
            <View className="w-48 mt-5">
              <GradientButton label="Add Partner" onPress={() => setCreating(true)} />
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
            {partners.map((p) => (
              <View key={p.id} className="bg-white rounded-2xl p-4 border border-sand-100">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-2 flex-1 mr-2">
                    <View
                      className="w-9 h-9 rounded-xl items-center justify-center"
                      style={{ backgroundColor: `${primaryColor}1A` }}
                    >
                      <Text className="text-base">{TYPE_EMOJI[p.type]}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-sand-900" numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text className="text-xs text-sand-400">
                        {TYPE_LABELS[p.type]} · {p.referral_code}
                      </Text>
                    </View>
                  </View>
                  <AnimatedPressable
                    onPress={() => confirmDelete(p)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${p.name}`}
                    accessibilityRole="button"
                  >
                    <Trash2 size={15} color={colors.rust?.[500] ?? '#C2724D'} />
                  </AnimatedPressable>
                </View>

                <View className="flex-row items-center gap-2 mt-1">
                  <View
                    className="rounded-full px-2.5 py-1"
                    style={{
                      backgroundColor: p.is_active ? `${primaryColor}1A` : colors.sand[100],
                    }}
                  >
                    <Text
                      className="text-[10px] font-semibold uppercase"
                      style={{ color: p.is_active ? primaryColor : colors.sand[400] }}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  <Text className="text-[10px] text-sand-400">
                    {p.commission_type === 'PERCENTAGE_OF_SALE'
                      ? `${p.commission_rate}% commission`
                      : `${inr(p.commission_rate)} per referral`}
                  </Text>
                  {p.pending_referrals && p.pending_referrals > 0 ? (
                    <View className="ml-auto bg-amber-50 rounded-full px-2 py-0.5">
                      <Text className="text-[10px] font-semibold text-amber-600">
                        {p.pending_referrals} pending
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ))}
          </View>

          <View className="mt-5">
            <GradientButton label="+ Add Partner" onPress={() => setCreating(true)} />
          </View>
        </ScrollView>
      )}

      {/* Create form modal */}
      {creating && (
        <CreatePartnerModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            void queryClient.invalidateQueries({ queryKey: ['growth', 'partners'] })
          }}
        />
      )}
    </View>
  )
}

// ─── Create Partner Modal ──────────────────────────────────────────

function CreatePartnerModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()

  const [name, setName] = useState('')
  const [type, setType] = useState<PartnerType>('SALON')
  const [phone, setPhone] = useState('')
  const [commissionRate, setCommissionRate] = useState('10')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = name.trim() && commissionRate && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      await growthApi.createPartner({
        name: name.trim(),
        type,
        phone: phone.trim() || undefined,
        commission_rate: parseInt(commissionRate) || 0,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create partner')
      setSaving(false)
    }
  }

  const TYPES: { value: PartnerType; label: string; emoji: string }[] = [
    { value: 'SALON', label: 'Salon', emoji: '💅' },
    { value: 'TAILOR', label: 'Tailor', emoji: '✂️' },
    { value: 'STYLIST', label: 'Stylist', emoji: '👗' },
    { value: 'MAKEUP_ARTIST', label: 'Makeup', emoji: '💄' },
    { value: 'OTHER', label: 'Other', emoji: '🤝' },
  ]

  return (
    <View
      className="absolute inset-0 bg-black/60 items-center justify-end"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8">
        <Text className="text-base font-bold text-sand-900 mb-5">Add Partner</Text>

        {/* Name */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">Partner Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Style Studio Salon, Master Tailor…"
          placeholderTextColor={colors.sand[300]}
          className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-4"
        />

        {/* Type */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">Type</Text>
        <View className="flex-row gap-2 mb-4">
          {TYPES.map((t) => (
            <AnimatedPressable
              key={t.value}
              onPress={() => setType(t.value)}
              className="flex-1 items-center py-2 rounded-xl border"
              style={{
                backgroundColor: type === t.value ? `${primaryColor}1A` : colors.sand[50],
                borderColor: type === t.value ? primaryColor : colors.sand[200],
              }}
            >
              <Text className="text-base mb-0.5">{t.emoji}</Text>
              <Text
                className="text-[10px] font-semibold"
                style={{ color: type === t.value ? primaryColor : colors.sand[500] }}
              >
                {t.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        {/* Phone */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">Phone (optional)</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="98765 43210"
          placeholderTextColor={colors.sand[300]}
          className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-4"
        />

        {/* Commission */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">Commission (%)</Text>
        <TextInput
          value={commissionRate}
          onChangeText={(t) => setCommissionRate(t.replace(/[^\d]/g, ''))}
          keyboardType="numeric"
          placeholder="10"
          placeholderTextColor={colors.sand[300]}
          className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-4"
        />

        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
            <Text className="text-xs text-red-600">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <View className="flex-1">
            <GradientButton
              label={saving ? 'Adding…' : 'Add Partner'}
              onPress={() => void submit()}
              disabled={!canSubmit}
            />
          </View>
          <AnimatedPressable
            onPress={onClose}
            className="flex-1 items-center justify-center bg-sand-100 rounded-xl py-3"
          >
            <Text className="text-sm font-semibold text-sand-600">Cancel</Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  )
}
