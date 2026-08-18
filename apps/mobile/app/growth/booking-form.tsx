import { useRouter } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react-native'
import { useState } from 'react'
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
import { growthApi } from '../../src/lib/api/growth'
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
  const { primaryColor, colors } = useTheme()
  return (
    <AnimatedPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`px-3.5 py-2 rounded-xl border ${active ? 'border-ink-600' : 'border-sand-200 bg-white'}`}
      style={active ? { backgroundColor: primaryColor } : undefined}
    >
      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-sand-600'}`}>{label}</Text>
    </AnimatedPressable>
  )
}

function Label({ text }: { text: string }) {
  return <Text className="text-xs font-medium text-sand-600 mb-1.5 mt-3">{text}</Text>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl p-4 border border-sand-100">
      <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">{title}</Text>
      {children}
    </View>
  )
}

/** Build the next 7 days as date chips (key = YYYY-MM-DD, label = Today/Tomorrow/weekday). */
function nextDays(count = 7): { key: string; label: string; sub: string }[] {
  const out: { key: string; label: string; sub: string }[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-IN', { weekday: 'short' })
    const sub = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    out.push({ key, label, sub })
  }
  return out
}

/** Half-hour slots across the shop day, e.g. 10:00 → 20:00. */
function slotsForDay(dayKey: string): { key: string; label: string }[] {
  const slots: { key: string; label: string }[] = []
  for (let h = 10; h <= 19; h++) {
    for (const m of [0, 30] as const) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const label = new Date(2000, 0, 1, h, m).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
      slots.push({ key: `${dayKey}T${hh}:${mm}:00`, label })
    }
  }
  return slots
}

export default function BookingFormScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()

  const days = nextDays()
  const [dayKey, setDayKey] = useState(days[0].key)
  const slots = slotsForDay(dayKey)
  const [slotKey, setSlotKey] = useState<string | null>(null)
  const [duration, setDuration] = useState(30)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Missing info', "Enter the customer's name.")
      return
    }
    if (!/^[0-9+\-\s]{10,20}$/.test(phone.trim())) {
      Alert.alert('Missing info', 'Enter a valid phone number (10+ digits).')
      return
    }
    if (!slotKey) {
      Alert.alert('Missing info', 'Pick a time slot.')
      return
    }
    const startsAt = new Date(slotKey)
    const endsAt = new Date(startsAt.getTime() + duration * 60_000)
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      note: note.trim() || null,
    }
    setSaving(true)
    try {
      await growthApi.createBooking(payload)
      await queryClient.invalidateQueries({ queryKey: ['growth', 'bookings'] })
      router.back()
    } catch (err) {
      showError(err, 'Failed to create booking. The slot may overlap another booking.')
      setSaving(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-ink-50"
    >
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900">New Booking</Text>
        </View>
        <GradientButton label={saving ? 'Saving…' : 'Save'} onPress={() => void handleSave()} loading={saving} />
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="gap-4">
          <Section title="Customer">
            <Label text="Name *" />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Customer name"
              placeholderTextColor={colors.sand[400]}
              className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-3"
              maxLength={120}
            />
            <Label text="Phone *" />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="98765 43210"
              placeholderTextColor={colors.sand[400]}
              keyboardType="phone-pad"
              className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-3"
              maxLength={20}
            />
            <Label text="Note (optional)" />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. wants to try 3 suits"
              placeholderTextColor={colors.sand[400]}
              className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-3"
              maxLength={500}
            />
          </Section>

          <Section title="Date">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {days.map((d) => (
                <AnimatedPressable
                  key={d.key}
                  onPress={() => {
                    setDayKey(d.key)
                    setSlotKey(null)
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: dayKey === d.key }}
                  className={`rounded-xl px-3.5 py-2.5 border items-center min-w-[72px] ${
                    dayKey === d.key ? 'border-ink-600' : 'border-sand-200 bg-white'
                  }`}
                  style={dayKey === d.key ? { backgroundColor: primaryColor } : undefined}
                >
                  <Text className={`text-xs font-bold ${dayKey === d.key ? 'text-white' : 'text-sand-800'}`}>
                    {d.label}
                  </Text>
                  <Text className={`text-[10px] mt-0.5 ${dayKey === d.key ? 'text-white/70' : 'text-sand-400'}`}>
                    {d.sub}
                  </Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          </Section>

          <Section title="Time slot">
            <View className="flex-row flex-wrap gap-2">
              {slots.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  active={slotKey === s.key}
                  onPress={() => setSlotKey(s.key)}
                />
              ))}
            </View>
            <Label text="Duration" />
            <View className="flex-row gap-2">
              {[30, 45, 60, 90].map((m) => (
                <Chip key={m} label={`${m} min`} active={duration === m} onPress={() => setDuration(m)} />
              ))}
            </View>
            {slotKey && (
              <Text className="text-[11px] text-sand-500 mt-3">
                {new Date(slotKey).toLocaleString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}{' '}
                · {duration} min
              </Text>
            )}
          </Section>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
