import { Text, View } from 'react-native'
import { ShieldCheck } from 'lucide-react-native'
import { TRY_ON_CONSENT } from '@kanchuki/shared'
import { GradientButton } from './GradientButton'
import { AnimatedPressable } from './AnimatedPressable'

/**
 * F-040 — the in-store consent screen.
 *
 * The copy is NOT written here. It is imported from `@kanchuki/shared`, the
 * same module the API records a version against (`TRY_ON_CONSENT.version`):
 * the screen shows exactly the text whose version is stamped on the job row.
 * A second copy of the wording in this file is free to drift from what the
 * database says the customer agreed to, which defeats the point of recording
 * a version at all.
 *
 * Accepting does not call the API. It only hands control back — the caller
 * sends `TRY_ON_CONSENT.version` on the try-on request itself, so a consent
 * that was never shown cannot leave a grant behind. (Same reasoning as the
 * customer PWA's try-on sheet.)
 */
export function TryOnConsent({
  onAccept,
  onDecline,
  busy,
}: {
  onAccept: () => void
  onDecline: () => void
  busy?: boolean
}) {
  return (
    <View className="flex-1 px-5 py-6">
      <View className="items-center mb-4">
        <View className="w-12 h-12 rounded-2xl bg-emerald-50 items-center justify-center mb-3">
          <ShieldCheck size={22} color="#059669" />
        </View>
        <Text className="text-lg font-bold text-ink-900 text-center font-marcellus">
          {TRY_ON_CONSENT.title}
        </Text>
      </View>

      <Text className="text-sm text-ink-700 leading-5 mb-4">{TRY_ON_CONSENT.intro}</Text>

      <View className="gap-3 mb-4">
        {TRY_ON_CONSENT.points.map((point) => (
          <View
            key={point.label}
            className="bg-white rounded-2xl border border-sand-200 p-3.5"
          >
            <Text className="text-xs font-bold text-ink-900 mb-1">{point.label}</Text>
            <Text className="text-xs text-ink-600 leading-4">{point.text}</Text>
          </View>
        ))}
      </View>

      <Text className="text-xs text-ink-700 leading-4 mb-2">{TRY_ON_CONSENT.training}</Text>
      <Text className="text-xs text-ink-600 leading-4 mb-5">{TRY_ON_CONSENT.withdrawal}</Text>

      <GradientButton
        label={TRY_ON_CONSENT.acceptLabel}
        onPress={onAccept}
        loading={busy}
      />
      <AnimatedPressable
        onPress={onDecline}
        accessibilityRole="button"
        className="mt-3 py-3 items-center"
      >
        <Text className="text-sm font-semibold text-ink-600">
          {TRY_ON_CONSENT.declineLabel}
        </Text>
      </AnimatedPressable>
    </View>
  )
}
