import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import {
  ChevronLeft,
  Gift,
  Plus,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingUp,
  Users,
  Zap,
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
  type IncentiveRule,
  type IncentiveDiscountType,
  type IncentiveTriggerType,
} from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

// ─── Helpers ──────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<IncentiveTriggerType, string> = {
  FIRST_VISIT: 'First Visit',
  BIRTHDAY: 'Birthday',
  ANNIVERSARY: 'Anniversary',
  LOYALTY_TIER: 'Loyalty',
}

const TRIGGER_EMOJI: Record<IncentiveTriggerType, string> = {
  FIRST_VISIT: '👋',
  BIRTHDAY: '🎂',
  ANNIVERSARY: '💍',
  LOYALTY_TIER: '⭐',
}

const fmtDiscount = (rule: IncentiveRule) =>
  rule.discount_type === 'PERCENT' ? `${rule.discount_value}% off` : `₹${(rule.discount_value / 100).toFixed(0)} off`

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : null

// ─── Main Screen ──────────────────────────────────────────────────

export default function IncentivesScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)

  const { data: rulesData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'incentives', 'rules'],
    queryFn: () => growthApi.incentiveRules(),
  })
  const rules = rulesData?.data ?? []

  const { data: statsData } = useQuery({
    queryKey: ['growth', 'incentives', 'stats'],
    queryFn: () => growthApi.incentiveStats(),
  })
  const stats = statsData?.data

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      growthApi.updateIncentiveRule(id, { active }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'incentives'] })
    },
    onError: (err) => showError(err, 'Failed to update rule'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => growthApi.deleteIncentiveRule(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'incentives'] })
    },
    onError: (err) => showError(err, 'Failed to delete rule'),
  })

  const confirmDelete = (rule: IncentiveRule) => {
    Alert.alert('Delete rule?', `\"${rule.name}\" will stop working for customers.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(rule.id) },
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
            <Text className="text-base font-bold text-sand-900">Incentives</Text>
          </View>
          <AnimatedPressable
            onPress={() => setCreating(true)}
            accessibilityLabel="New incentive rule"
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
      ) : rules.length === 0 && !creating ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <Gift size={28} color={primaryColor} />
            </View>
            <Text className="text-base font-bold text-sand-900">No incentive rules yet</Text>
            <Text className="text-xs text-sand-500 text-center mt-1.5 leading-4 max-w-[260px]">
              Create automated rewards — first-visit discounts, birthday offers,
              loyalty perks — to keep customers coming back.
            </Text>
            <View className="w-48 mt-5">
              <GradientButton label="Create Rule" onPress={() => setCreating(true)} />
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          {/* Stats strip */}
          {stats && (
            <View className="flex-row gap-2 mb-4">
              <StatChip icon={Zap} label={`${stats.active_rules} active`} color={primaryColor} />
              <StatChip icon={Users} label={`${stats.total_visits} visits`} color={colors.sand[500]} />
              <StatChip icon={TrendingUp} label={`${stats.visits_last_30d} this month`} color={colors.rust?.[500] ?? '#C2724D'} />
            </View>
          )}

          {/* Rules list */}
          <View className="gap-2.5">
            {rules.map((rule) => (
              <View key={rule.id} className="bg-white rounded-2xl p-4 border border-sand-100">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-2 flex-1 mr-2">
                    <View
                      className="w-9 h-9 rounded-xl items-center justify-center"
                      style={{ backgroundColor: `${primaryColor}1A` }}
                    >
                      <Text className="text-base">{TRIGGER_EMOJI[rule.trigger_type]}</Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-sand-900" numberOfLines={1}>
                        {rule.name}
                      </Text>
                      <Text className="text-xs text-sand-400">
                        {fmtDiscount(rule)} · {TRIGGER_LABELS[rule.trigger_type]}
                      </Text>
                    </View>
                  </View>
                  <AnimatedPressable
                    onPress={() => toggleActive.mutate({ id: rule.id, active: !rule.active })}
                    hitSlop={8}
                    accessibilityLabel={`${rule.name} ${rule.active ? 'active' : 'inactive'}`}
                    accessibilityRole="button"
                  >
                    {rule.active ? (
                      <ToggleRight size={28} color={primaryColor} />
                    ) : (
                      <ToggleLeft size={28} color={colors.sand[300]} />
                    )}
                  </AnimatedPressable>
                </View>

                <View className="flex-row items-center gap-2 mt-1">
                  <View
                    className="rounded-full px-2.5 py-1"
                    style={{
                      backgroundColor: rule.active ? `${primaryColor}1A` : colors.sand[100],
                    }}
                  >
                    <Text
                      className="text-[10px] font-semibold uppercase"
                      style={{ color: rule.active ? primaryColor : colors.sand[400] }}
                    >
                      {rule.active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  {rule.starts_at || rule.ends_at ? (
                    <Text className="text-[10px] text-sand-400">
                      {fmtDate(rule.starts_at) ?? '…'} — {fmtDate(rule.ends_at) ?? '…'}
                    </Text>
                  ) : (
                    <Text className="text-[10px] text-sand-400">Always active</Text>
                  )}
                  <View className="flex-1" />
                  <AnimatedPressable
                    onPress={() => confirmDelete(rule)}
                    hitSlop={8}
                    accessibilityLabel={`Delete ${rule.name}`}
                    accessibilityRole="button"
                  >
                    <Trash2 size={15} color={colors.rust?.[500] ?? '#DC2626'} />
                  </AnimatedPressable>
                </View>
              </View>
            ))}
          </View>

          <View className="mt-5">
            <GradientButton label="+ New Rule" onPress={() => setCreating(true)} />
          </View>
        </ScrollView>
      )}

      {/* Create form modal */}
      {creating && (
        <CreateRuleModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            void queryClient.invalidateQueries({ queryKey: ['growth', 'incentives'] })
          }}
        />
      )}
    </View>
  )
}

// ─── Stat Chip ────────────────────────────────────────────────────

function StatChip({
  icon: Icon,
  label,
  color,
}: {
  icon: typeof Zap
  label: string
  color: string
}) {
  return (
    <View className="flex-row items-center gap-1.5 bg-white rounded-full px-3 py-1.5 border border-sand-100">
      <Icon size={12} color={color} />
      <Text className="text-[10px] font-semibold text-sand-600">{label}</Text>
    </View>
  )
}

// ─── Create Rule Modal ────────────────────────────────────────────

function CreateRuleModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()

  const [name, setName] = useState('')
  const [triggerType, setTriggerType] = useState<IncentiveTriggerType>('FIRST_VISIT')
  const [discountType, setDiscountType] = useState<IncentiveDiscountType>('PERCENT')
  const [discountValue, setDiscountValue] = useState('10')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = name.trim() && discountValue && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      await growthApi.createIncentiveRule({
        name: name.trim(),
        trigger_type: triggerType,
        discount_type: discountType,
        discount_value: parseInt(discountValue) || 0,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create rule')
      setSaving(false)
    }
  }

  const TRIGGERS: { value: IncentiveTriggerType; label: string; emoji: string }[] = [
    { value: 'FIRST_VISIT', label: 'First Visit', emoji: '👋' },
    { value: 'BIRTHDAY', label: 'Birthday', emoji: '🎂' },
    { value: 'ANNIVERSARY', label: 'Anniversary', emoji: '💍' },
    { value: 'LOYALTY_TIER', label: 'Loyalty', emoji: '⭐' },
  ]

  return (
    <View
      className="absolute inset-0 bg-black/60 items-center justify-end"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8">
        <Text className="text-base font-bold text-sand-900 mb-5">New Incentive Rule</Text>

        {/* Name */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">Rule Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Welcome Gift, Festive Bonus…"
          placeholderTextColor={colors.sand[300]}
          className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-4"
        />

        {/* Trigger */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">Trigger</Text>
        <View className="flex-row gap-2 mb-4">
          {TRIGGERS.map((t) => (
            <AnimatedPressable
              key={t.value}
              onPress={() => setTriggerType(t.value)}
              className="flex-1 items-center py-2.5 rounded-xl border"
              style={{
                backgroundColor: triggerType === t.value ? `${primaryColor}1A` : colors.sand[50],
                borderColor: triggerType === t.value ? primaryColor : colors.sand[200],
              }}
            >
              <Text className="text-base mb-0.5">{t.emoji}</Text>
              <Text
                className="text-[10px] font-semibold"
                style={{ color: triggerType === t.value ? primaryColor : colors.sand[500] }}
              >
                {t.label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        {/* Discount */}
        <View className="flex-row gap-3 mb-4">
          <View className="flex-1">
            <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">Type</Text>
            <View className="flex-row gap-2">
              {(['PERCENT', 'FIXED_AMOUNT'] as const).map((dt) => (
                <AnimatedPressable
                  key={dt}
                  onPress={() => setDiscountType(dt)}
                  className="flex-1 items-center py-2 rounded-xl border"
                  style={{
                    backgroundColor: discountType === dt ? `${primaryColor}1A` : colors.sand[50],
                    borderColor: discountType === dt ? primaryColor : colors.sand[200],
                  }}
                >
                  <Text
                    className="text-xs font-semibold"
                    style={{ color: discountType === dt ? primaryColor : colors.sand[500] }}
                  >
                    {dt === 'PERCENT' ? '% Off' : '₹ Off'}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">Value</Text>
            <TextInput
              value={discountValue}
              onChangeText={(t) => setDiscountValue(t.replace(/[^\d]/g, ''))}
              keyboardType="numeric"
              placeholder={discountType === 'PERCENT' ? '10' : '500'}
              placeholderTextColor={colors.sand[300]}
              className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900"
            />
          </View>
        </View>

        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
            <Text className="text-xs text-red-600">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <View className="flex-1">
            <GradientButton
              label={saving ? 'Creating…' : 'Create Rule'}
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
