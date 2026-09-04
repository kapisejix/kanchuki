import { Check, Facebook, Instagram, Lock } from 'lucide-react-native'
import { Text, View } from 'react-native'
import type { SocialAccountInfo } from '../../lib/api/social'
import { useTheme } from '../../lib/theme'
import { AnimatedPressable } from '../AnimatedPressable'

/**
 * Connected-account checklist (R-2 step 6, R-12). A target can be disabled
 * with a reason — e.g. an Instagram account when the post is link-only (IG
 * has no clickable links in captions, so a media-less post can't carry it).
 */
export function TargetChecklist({
  accounts,
  selected,
  onToggle,
  disabledReason,
}: {
  accounts: SocialAccountInfo[]
  selected: string[]
  onToggle: (accountId: string) => void
  /** accountId → reason text when that target cannot take this post. */
  disabledReason?: (account: SocialAccountInfo) => string | null
}) {
  const { colors } = useTheme()

  return (
    <View className="gap-2">
      {accounts.map((account) => {
        const reason = disabledReason ? disabledReason(account) : null
        const disabled = !!reason
        const checked = !disabled && selected.includes(account.id)
        const isIg = account.platform === 'INSTAGRAM'
        return (
          <AnimatedPressable
            key={account.id}
            onPress={() => !disabled && onToggle(account.id)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected: checked, disabled }}
            accessibilityLabel={`${account.account_name} (${account.platform})`}
            className={`flex-row items-center rounded-2xl border px-4 py-3 ${
              checked ? 'border-ink-600 bg-ink-600/5' : disabled ? 'border-sand-100 bg-sand-50/60' : 'border-sand-100 bg-white'
            }`}
          >
            <View
              className={`w-9 h-9 rounded-xl items-center justify-center mr-3 ${
                isIg ? 'bg-[#E1306C]/10' : 'bg-[#1877F2]/10'
              }`}
            >
              {isIg ? (
                <Instagram size={18} color="#E1306C" />
              ) : (
                <Facebook size={18} color="#1877F2" />
              )}
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-sand-900">{account.account_name}</Text>
              <Text className="text-[10px] text-sand-400">
                {isIg ? 'Instagram' : 'Facebook Page'}
              </Text>
              {disabled && reason ? (
                <View className="flex-row items-center gap-1 mt-1">
                  <Lock size={10} color={colors.sand[500]} />
                  <Text className="text-[10px] text-sand-500 flex-1" numberOfLines={2}>
                    {reason}
                  </Text>
                </View>
              ) : null}
            </View>
            <View
              className={`w-6 h-6 rounded-full border items-center justify-center ${
                checked ? 'bg-ink-600 border-ink-600' : 'border-sand-300 bg-white'
              }`}
            >
              {checked && <Check size={14} color="#fff" />}
            </View>
          </AnimatedPressable>
        )
      })}
    </View>
  )
}
