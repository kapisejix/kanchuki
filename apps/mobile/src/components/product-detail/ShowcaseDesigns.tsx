// Suits Designs strip — rendered below RelatedProductsSection on the product
// detail screen. Shows the N (admin-configured) watermarked design thumbs for
// the product's garment category (+ related categories), with a "View more"
// button into the full browse grid. Hidden entirely when no designs match.
// doc: docs/tasks/suits-designs.md §2.3.
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { Sparkles } from 'lucide-react-native'
import { showcaseDesignsApi, type PublicShowcaseDesign } from '../../lib/api'
import { useScreenInsets } from '../../lib/safe-area'
import { AnimatedPressable } from '../AnimatedPressable'

export function ShowcaseDesignsSection({
  productId,
  storeSlug,
}: {
  productId: string
  storeSlug?: string | null
}) {
  const { insets } = useScreenInsets()
  const [designs, setDesigns] = useState<PublicShowcaseDesign[]>([])
  const [categoryName, setCategoryName] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await showcaseDesignsApi.publicForProduct(productId)
        if (!cancelled) {
          setDesigns(res.data.designs)
          setCategoryName(res.data.category?.name ?? null)
        }
      } catch {
        // Public read fails open — the strip just stays hidden.
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [productId])

  if (designs.length === 0) return null

  return (
    <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
      <View className="flex-row items-center justify-between mb-3.5">
        <View className="flex-row items-center gap-2">
          <Sparkles size={15} color="#BB3F95" />
          <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wide">
            {categoryName ? `${categoryName} Designs` : 'Suits Designs'}
          </Text>
        </View>
        <Pressable
          onPress={() =>
            router.push(
              storeSlug ? `/showcase-designs/browse?store=${encodeURIComponent(storeSlug)}` : '/showcase-designs/browse',
            )
          }
        >
          <Text className="text-[11px] font-bold text-fuchsia-600">View more</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-3 py-1" style={{ paddingBottom: insets.bottom > 0 ? 4 : 0 }}>
          {designs.map((d) => (
            <AnimatedPressable
              key={d.id}
              onPress={() => router.push(`/showcase-designs/view/${d.id}`)}
              className="w-28"
            >
              <View className="w-28 h-36 rounded-2xl overflow-hidden bg-lavender-100 border border-lavender-200">
                <Image
                  source={{ uri: d.image_url }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              </View>
              {d.name ? (
                <Text className="text-[11px] font-bold text-spaceCadet-900 mt-1.5 truncate" numberOfLines={1}>
                  {d.name}
                </Text>
              ) : (
                <Text className="text-[10px] text-heliotrope-500 font-medium mt-1.5 truncate">
                  {d.category.name ?? 'Design'}
                </Text>
              )}
            </AnimatedPressable>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}