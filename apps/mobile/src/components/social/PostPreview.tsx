import { Facebook, Globe, Instagram, Link2 } from 'lucide-react-native'
import { Image, Text, View } from 'react-native'
import type { SocialPostComposeType } from '../../lib/api/social'
import { useTheme } from '../../lib/theme'
import type { ComposeMedia } from './types'

const PLATFORM_META: Record<'FACEBOOK' | 'INSTAGRAM', { label: string; bg: string }> = {
  FACEBOOK: { label: 'Facebook', bg: '#1877F2' },
  INSTAGRAM: { label: 'Instagram', bg: '#E1306C' },
}

/**
 * Render mocks of the composed post the way it will look on the selected
 * platforms (R-2 step 7). One card per platform that has at least one target.
 * The link card note reflects that IG captions carry no clickable links.
 */
export function PostPreview({
  platforms,
  postType,
  media,
  caption,
  linkLabel,
}: {
  platforms: ('FACEBOOK' | 'INSTAGRAM')[]
  postType: SocialPostComposeType
  /** First-image per media item, in publish order (carousel shows 1). */
  media: ComposeMedia[]
  caption: string
  /** Human label of the attached link ('' when none). */
  linkLabel: string
}) {
  const { colors } = useTheme()
  if (platforms.length === 0) return null

  const firstImage = media.find((m) => m.kind === 'photo')?.url
  const isLinkOnly = postType === 'COLLECTION_LINK'

  return (
    <View className="gap-3">
      {platforms.map((platform) => {
        const meta = PLATFORM_META[platform]
        const isIg = platform === 'INSTAGRAM'
        return (
          <View key={platform} className="bg-white rounded-2xl border border-sand-100 overflow-hidden">
            {/* Header */}
            <View className="flex-row items-center px-4 py-3">
              <View
                className="w-9 h-9 rounded-full items-center justify-center mr-3"
                style={{ backgroundColor: meta.bg }}
              >
                {isIg ? <Instagram size={17} color="#fff" /> : <Facebook size={17} color="#fff" />}
              </View>
              <View className="flex-1">
                <Text className="text-xs font-bold text-sand-900">Your store</Text>
                <Text className="text-[10px] text-sand-400">Preview — {meta.label}</Text>
              </View>
            </View>

            {/* Media / link card */}
            {isLinkOnly ? (
              <View className="flex-row items-center px-4 py-5 bg-sand-50 mx-4 mb-1 rounded-xl border border-sand-100">
                <View className="w-10 h-10 rounded-xl bg-white items-center justify-center mr-3 border border-sand-200">
                  <Link2 size={17} color={colors.sand[600]} />
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-bold text-sand-800" numberOfLines={1}>
                    {linkLabel || 'Collection link'}
                  </Text>
                  <Text className="text-[10px] text-sand-400">kanchuki.app/…</Text>
                </View>
                <Globe size={14} color={colors.sand[400]} />
              </View>
            ) : firstImage ? (
              <View className="mx-4 rounded-xl overflow-hidden bg-sand-100 mb-1">
                <Image source={{ uri: firstImage }} className="w-full aspect-[4/3]" resizeMode="cover" />
                {media.length > 1 ? (
                  <View className="absolute bottom-2 right-2 bg-black/60 rounded-full px-2 py-0.5">
                    <Text className="text-white text-[10px] font-bold">
                      1/{Math.min(media.length, 10)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View className="mx-4 rounded-xl bg-sand-50 border border-dashed border-sand-200 py-6 items-center mb-1">
                <Text className="text-[11px] text-sand-400">No media selected yet</Text>
              </View>
            )}

            {/* Caption */}
            <View className="px-4 py-3">
              <Text className="text-xs leading-5 text-sand-800" numberOfLines={6}>
                {caption.trim()
                  ? caption
                  : 'Your caption will appear here — add one below or leave it blank for an auto-filled one.'}
              </Text>
              {isIg && !isLinkOnly && linkLabel ? (
                <Text className="text-[10px] text-sand-400 mt-1">
                  Link text only — Instagram captions have no clickable links.
                </Text>
              ) : null}
              {!isIg && linkLabel ? (
                <View className="mt-1.5 flex-row items-center gap-1.5 bg-sand-50 rounded-lg border border-sand-100 px-2.5 py-1.5 self-start">
                  <Link2 size={11} color={colors.sand[500]} />
                  <Text className="text-[10px] font-semibold text-sand-600">{linkLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )
      })}
    </View>
  )
}
