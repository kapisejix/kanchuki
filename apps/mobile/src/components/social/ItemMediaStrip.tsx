import { useQuery } from '@tanstack/react-query'
import { Check, Play } from 'lucide-react-native'
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native'
import type { ProductDetail } from '@kanchuki/shared'
import { productApi } from '../../lib/api'
import { useTheme } from '../../lib/theme'
import { AnimatedPressable } from '../AnimatedPressable'
import type { ComposeMedia, ComposeProduct } from './types'

interface MediaTile {
  media: ComposeMedia
}

/**
 * Media strip for ONE product (R-2 step 3, R-10): every photo of the product
 * as a tappable tile, plus its Ken Burns / upload videos when the post type
 * allows video (single posts only — IG bans mixed carousels, so carousel
 * strips hide videos entirely).
 *
 * `selection` lives in the parent so the publish payload + preview always
 * agree with what the strip shows; the strip renders the default (primary
 * photo) until the retailer taps a different tile.
 */
export function ItemMediaStrip({
  product,
  selection,
  onSelect,
  allowVideos,
}: {
  product: ComposeProduct
  selection: ComposeMedia | null | undefined
  onSelect: (media: ComposeMedia) => void
  allowVideos: boolean
}) {
  const { colors } = useTheme()

  const { data, isLoading } = useQuery({
    queryKey: ['product', product.id],
    queryFn: () => productApi.get(product.id),
  })
  const detail = (data as { data: ProductDetail } | undefined)?.data

  if (isLoading && !detail) {
    return <ActivityIndicator size="small" color={colors.sand[400]} className="py-4" />
  }
  if (!detail) {
    return (
      <Text className="text-[11px] text-rust-600">
        Could not load media for this product — pull it up in the catalog and try again.
      </Text>
    )
  }

  const photos = [...detail.photos]
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .filter((p) => !p.is_video)
  const videos = (allowVideos ? detail.videos ?? [] : []).filter((v) => v.public_url)

  const tiles: MediaTile[] = [
    ...photos.map((p) => ({ media: { kind: 'photo' as const, photo_id: p.id, url: p.url } })),
    ...videos.map((v) => ({ media: { kind: 'video' as const, video_id: v.id, url: v.public_url } })),
  ]

  if (tiles.length === 0) {
    return (
      <Text className="text-[11px] text-rust-600">
        No {allowVideos ? 'photos or videos' : 'photos'} yet — add media to this product first.
      </Text>
    )
  }

  const selectedKey = (m: ComposeMedia) => (m.kind === 'photo' ? m.photo_id : m.video_id) ?? m.url
  const currentKey = selection ? selectedKey(selection) : null

  return (
    <View>
      <View className="flex-row items-center mb-2">
        <Text className="text-xs font-bold text-sand-900 flex-1" numberOfLines={1}>
          {product.name ?? 'Untitled product'}
        </Text>
        {selection?.kind === 'video' ? (
          <Text className="text-[10px] font-semibold text-ink-600">Video selected</Text>
        ) : (
          <Text className="text-[10px] text-sand-400">Tap to change photo</Text>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {tiles.map(({ media }) => {
          const key = selectedKey(media)
          const active = currentKey === key
          return (
            <AnimatedPressable
              key={key}
              onPress={() => onSelect(media)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={media.kind === 'video' ? 'Video' : 'Photo'}
              className={`w-20 h-20 rounded-xl overflow-hidden border-2 ${
                active ? 'border-ink-600' : 'border-sand-100'
              }`}
            >
              <Image source={{ uri: media.url }} className="w-full h-full" resizeMode="cover" />
              {media.kind === 'video' ? (
                <View className="absolute inset-0 items-center justify-center bg-black/30">
                  <Play size={20} color="#fff" fill="#fff" />
                </View>
              ) : null}
              {active ? (
                <View className="absolute top-1 right-1 w-4.5 h-4.5 rounded-full bg-ink-600 items-center justify-center">
                  <Check size={10} color="#fff" strokeWidth={3} />
                </View>
              ) : null}
            </AnimatedPressable>
          )
        })}
      </ScrollView>
    </View>
  )
}
