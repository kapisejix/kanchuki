import { formatPaiseShort } from '@kanchuki/shared'
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


// ─── Main Screen ──────────────────────────────────────────────────

export default function PartnersScreen() {
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
    Alert.alert('Remove partner?', `"${p.name}" will be deactivated.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(p.id) },
    ])
  }

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
              Partner Network
            </Text>
          </View>
          <AnimatedPressable
            onPress={() => setCreating(true)}
            accessibilityLabel="Add partner"
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
      ) : partners.length === 0 && !creating ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4 bg-lavender-100 border border-lavender-200"
            >
              <Handshake size={28} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              No Partners Yet
            </Text>
            <Text className="text-xs text-heliotrope-500 text-center mt-1.5 leading-relaxed max-w-[260px] font-medium">
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
          <View className="gap-3.5">
            {partners.map((p) => (
              <View key={p.id} className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-3 flex-1 mr-2">
                    <View
                      className="w-11 h-11 rounded-2xl items-center justify-center bg-lavender-100 border border-lavender-200"
                    >
                      <Text className="text-xl">{TYPE_EMOJI[p.type]}</Text>
                    </View>
                    <View className="flex-1">
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                        className="text-base font-bold text-spaceCadet-900"
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                      <Text className="text-xs text-heliotrope-500 font-medium mt-0.5">
                        {TYPE_LABELS[p.type]} · <Text className="font-bold text-fuchsia-700">{p.referral_code}</Text>
                      </Text>
                    </View>
                  </View>
                  <AnimatedPressable
                    onPress={() => confirmDelete(p)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${p.name}`}
                    accessibilityRole="button"
                  >
                    <Trash2 size={16} color="#dc2626" />
                  </AnimatedPressable>
                </View>

                <View className="flex-row items-center gap-2 mt-2 pt-3 border-t border-lavender-200">
                  <View
                    className={`rounded-full px-3 py-1 ${
                      p.is_active ? 'bg-fuchsia-500/15 border border-fuchsia-500/30' : 'bg-lavender-100 border border-lavender-200'
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-bold uppercase tracking-wider ${
                        p.is_active ? 'text-fuchsia-700' : 'text-heliotrope-500'
                      }`}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  <Text className="text-xs font-semibold text-heliotrope-500">
                    {p.commission_type === 'PERCENTAGE_OF_SALE'
                      ? `${p.commission_rate}% commission`
                      : `${formatPaiseShort(p.commission_rate)} per referral`}
                  </Text>
                  {p.pending_referrals && p.pending_referrals > 0 ? (
                    <View className="ml-auto bg-fuchsia-500/10 rounded-full px-2.5 py-0.5 border border-fuchsia-500/20">
                      <Text className="text-[10px] font-bold text-fuchsia-700">
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
      <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8 border-t border-lavender-200">
        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-xl font-bold text-spaceCadet-900 mb-5"
        >
          Add Partner
        </Text>

        {/* Name */}
        <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">Partner Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Style Studio Salon, Master Tailor…"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
        />

        {/* Type */}
        <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">Type</Text>
        <View className="flex-row gap-2 mb-4">
          {TYPES.map((t) => (
            <AnimatedPressable
              key={t.value}
              onPress={() => setType(t.value)}
              className={`flex-1 items-center py-2.5 rounded-2xl border ${
                type === t.value ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
              }`}
            >
              <Text className="text-base mb-0.5">{t.emoji}</Text>
              <Text
                className={`text-[10px] font-bold ${
                  type === t.value ? 'text-white' : 'text-spaceCadet-900'
                }`}
              >
                {t.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        {/* Phone */}
        <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">Phone (optional)</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="98765 43210"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
        />

        {/* Commission */}
        <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">Commission (%)</Text>
        <TextInput
          value={commissionRate}
          onChangeText={(t) => setCommissionRate(t.replace(/[^\d]/g, ''))}
          keyboardType="numeric"
          placeholder="10"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
        />

        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
            <Text className="text-xs text-red-600 font-bold">{error}</Text>
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
            className="flex-1 items-center justify-center bg-lavender-100 rounded-2xl py-3 border border-lavender-200"
          >
            <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">Cancel</Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  )
}
