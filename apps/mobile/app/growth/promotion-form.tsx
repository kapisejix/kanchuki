import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { growthApi, type Promotion } from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

function Chip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`px-4 py-2 rounded-2xl border ${active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'border-lavender-200 bg-lavender-50'}`}
    >
      <Text className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}>{label}</Text>
    </AnimatedPressable>
  )
}

function Label({ text }: { text: string }) {
  return <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5 mt-3">{text}</Text>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
      <Text
        style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
        className="text-base font-bold text-spaceCadet-900 mb-3.5"
      >
        {title}
      </Text>
      {children}
    </View>
  )
}

export default function PromotionFormScreen() {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ id?: string }>()
  const editingId = params.id
  const isEdit = !!editingId

  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FIXED'>('PERCENT')
  const [discountValue, setDiscountValue] = useState('')
  const [minOrder, setMinOrder] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)

  const { data: existingData, isLoading: existingLoading } = useQuery({
    queryKey: ['growth', 'promotions', editingId],
    queryFn: () =>
      growthApi.promotions().then((res) => res.data.find((p: Promotion) => p.id === editingId)),
    enabled: isEdit,
  })
  const existing = existingData

  useEffect(() => {
    if (!existing) return
    setCode(existing.code)
    setDiscountType(existing.discount_type)
    setDiscountValue(String(existing.discount_value))
    setMinOrder(existing.min_order_paise ? String(existing.min_order_paise / 100) : '')
    setIsActive(existing.is_active)
  }, [existing])

  const handleSave = async () => {
    if (!code.trim()) {
      Alert.alert('Missing info', 'Give the promotion a code, e.g. DIWALI10.')
      return
    }
    const value = parseInt(discountValue, 10)
    if (!value || value <= 0 || (discountType === 'PERCENT' && value > 100)) {
      Alert.alert('Invalid discount', discountType === 'PERCENT' ? 'Enter a % between 1 and 100.' : 'Enter a discount amount in ₹.')
      return
    }
    const min = Math.round((parseFloat(minOrder) || 0) * 100)
    const payload = {
      code: code.trim(),
      discount_type: discountType,
      discount_value: value,
      ...(min > 0 ? { min_order_paise: min } : {}),
      is_active: isActive,
    }
    setSaving(true)
    try {
      if (isEdit) {
        await growthApi.updatePromotion(editingId!, payload)
      } else {
        await growthApi.createPromotion(payload)
      }
      await queryClient.invalidateQueries({ queryKey: ['growth', 'promotions'] })
      router.back()
    } catch (err) {
      showError(err, isEdit ? 'Failed to update promotion' : 'Failed to create promotion')
      setSaving(false)
    }
  }

  if (isEdit && existingLoading) {
    return (
      <View className="flex-1 bg-[#F8F7FC] items-center justify-center">
        <Text className="text-xs text-heliotrope-500 font-medium">Loading…</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#F8F7FC]"
    >
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-5 pb-4 bg-white border-b border-lavender-200"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <ChevronLeft size={20} color="#231F48" />
          </AnimatedPressable>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-xl font-bold text-spaceCadet-900"
          >
            {isEdit ? 'Edit Promotion' : 'New Promotion'}
          </Text>
        </View>
        <GradientButton label={saving ? 'Saving…' : 'Save'} onPress={() => void handleSave()} loading={saving} />
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="gap-4">
          <Section title="Promo Code">
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase().replace(/\s+/g, '_'))}
              placeholder="e.g. DIWALI10"
              placeholderTextColor="#928EB2"
              autoCapitalize="characters"
              maxLength={20}
              className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
            />
            <Text className="text-xs text-heliotrope-500 mt-2 font-medium">
              Shown to customers at checkout — letters, numbers and underscores only.
            </Text>
          </Section>

          <Section title="Discount Configuration">
            <View className="flex-row gap-2 mb-3">
              <Chip label="% off" active={discountType === 'PERCENT'} onPress={() => setDiscountType('PERCENT')} />
              <Chip label="Flat ₹" active={discountType === 'FIXED'} onPress={() => setDiscountType('FIXED')} />
            </View>
            <Label text={discountType === 'PERCENT' ? 'Discount %' : 'Discount amount (₹)'} />
            <TextInput
              value={discountValue}
              onChangeText={(v) => setDiscountValue(v.replace(/[^\d]/g, ''))}
              placeholder={discountType === 'PERCENT' ? '10' : '500'}
              placeholderTextColor="#928EB2"
              keyboardType="number-pad"
              maxLength={6}
              className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
            />
            <Label text="Minimum order (₹, optional)" />
            <TextInput
              value={minOrder}
              onChangeText={(v) => setMinOrder(v.replace(/[^\d.]/g, ''))}
              placeholder="2000"
              placeholderTextColor="#928EB2"
              keyboardType="decimal-pad"
              className="text-sm font-bold text-spaceCadet-900 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3"
            />
          </Section>

          <Section title="Availability">
            <View className="flex-row gap-2">
              <Chip
                label="Active now"
                active={isActive}
                onPress={() => setIsActive(true)}
              />
              <Chip
                label="Paused"
                active={!isActive}
                onPress={() => setIsActive(false)}
              />
            </View>
          </Section>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
