import React from 'react'
import { View, Text } from 'react-native'
import {
  AGE_GROUP_LABELS,
  AUDIENCE_LABELS,
  KIDS_AGE_GROUPS,
  PRODUCT_AUDIENCES,
  audienceForText,
  isKidsAudience,
  type KidsAgeGroupValue,
  type ProductAudienceValue,
} from '@kanchuki/shared'
import { AnimatedPressable } from '../AnimatedPressable'

export interface AudiencePick {
  audience: ProductAudienceValue | null
  kids_age_group: KidsAgeGroupValue | null
}

interface Props {
  audience: ProductAudienceValue | null
  ageGroup: KidsAgeGroupValue | null
  onChange: (next: AudiencePick) => void
}

/**
 * Add screen: what the chips show and send. `pick` is null until the retailer taps a chip;
 * until then it is a keyword guess from the picked category names (null when the text says
 * nothing), so the AI tagger still fills a blank. Any tap, even a clear, wins over the guess.
 */
export function addAudience(pick: AudiencePick | null, categoryNames: string[]): AudiencePick {
  return (
    pick ?? {
      audience: audienceForText(categoryNames.join(' ')),
      kids_age_group: null,
    }
  )
}

const chipClass =(on: boolean) =>
  `px-3.5 min-h-[44px] justify-center rounded-2xl border ${
    on ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'bg-white border-lavender-200'
  }`
const textClass = (on: boolean) =>
  `text-xs font-bold ${on ? 'text-white' : 'text-spaceCadet-900'}`

/**
 * "Who is it for?" — one audience, plus an age band for the kids audiences.
 * Tapping the active chip clears it (null = not decided: the My Style feed then
 * falls back to its keyword rule). Switching to a non-kids audience drops the age.
 */
export function AudienceChips({ audience, ageGroup, onChange }: Props) {
  const kids = isKidsAudience(audience)
  return (
    <View className="gap-2.5">
      <View className="flex-row flex-wrap gap-2">
        {PRODUCT_AUDIENCES.map((a) => {
          const on = audience === a
          return (
            <AnimatedPressable
              key={a}
              testID={`audience-${a}`}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Who is it for: ${AUDIENCE_LABELS[a]}`}
              onPress={() =>
                onChange(
                  on
                    ? { audience: null, kids_age_group: null }
                    : { audience: a, kids_age_group: isKidsAudience(a) ? ageGroup : null },
                )
              }
              className={chipClass(on)}
            >
              <Text className={textClass(on)}>{AUDIENCE_LABELS[a]}</Text>
            </AnimatedPressable>
          )
        })}
      </View>
      {kids && (
        <View className="flex-row flex-wrap gap-2">
          {KIDS_AGE_GROUPS.map((g) => {
            const on = ageGroup === g
            return (
              <AnimatedPressable
                key={g}
                testID={`age-${g}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Age group: ${AGE_GROUP_LABELS[g]}`}
                onPress={() => onChange({ audience, kids_age_group: on ? null : g })}
                className={chipClass(on)}
              >
                <Text className={textClass(on)}>{AGE_GROUP_LABELS[g]}</Text>
              </AnimatedPressable>
            )
          })}
        </View>
      )}
    </View>
  )
}
