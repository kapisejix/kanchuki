import { useState } from 'react'
import { Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Check, Copy } from 'lucide-react-native'
import { AnimatedPressable } from './AnimatedPressable'
import { formatBuildInfo, formatBuildTime, getBuildInfo } from '../lib/build-info'

const SAND_400 = '#B8B8B8'

/**
 * One-line build identity for the bottom of Settings.
 *
 * WHY: "I rebuilt and it still doesn't work" was unverifiable — a screenshot
 * couldn't show which commit the running binary contained, so a fix that was
 * committed, CI-green and shipped could not be told apart from a tester still
 * on the previous Play release. This shows the commit + build time, and a tap
 * copies the exact string to paste into a bug report.
 *
 * Renders nothing if either half is missing rather than printing "undefined".
 */
export function BuildInfoFooter() {
  const [copied, setCopied] = useState(false)
  const info = getBuildInfo()
  const time = formatBuildTime(info.builtAt)
  const detail = [info.channel, time].filter(Boolean).join(' · ')

  const copy = async () => {
    await Clipboard.setStringAsync(formatBuildInfo(info))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AnimatedPressable
      onPress={() => void copy()}
      accessibilityRole="button"
      accessibilityLabel={`Build ${info.shortSha}. Tap to copy build details.`}
      className="mt-4 mb-2 items-center"
    >
      <View className="flex-row items-center gap-1.5">
        <Text className="text-[10px] font-bold text-sand-400 tracking-wide">
          BUILD {info.shortSha}
        </Text>
        {copied ? <Check size={11} color={SAND_400} /> : <Copy size={11} color={SAND_400} />}
      </View>
      {detail ? <Text className="text-[10px] text-sand-400 mt-0.5">{detail}</Text> : null}
      <Text className="text-[9px] text-sand-400 mt-0.5">
        {copied ? 'Copied to clipboard' : 'Tap to copy build details'}
      </Text>
    </AnimatedPressable>
  )
}
