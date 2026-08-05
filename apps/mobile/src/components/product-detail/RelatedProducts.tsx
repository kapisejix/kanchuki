// Auto-split from app/product/[id].tsx (1944 lines).
import { useEffect, useState } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { Image } from 'expo-image'
import { ShoppingBag } from 'lucide-react-native'
import { useTheme } from '../../lib/theme'
import { AnimatedPressable } from '../AnimatedPressable'

interface RelatedProduct {
  id: string
  name: string | null
  price_min: number | null
  price_max: number | null
  status: string
  primary_photo_url: string | null
  category: string | null
  primary_color: string | null
}

const RELATED_API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3001'

export function RelatedProductsSection({
  category,
  excludeId,
  onSelect,
}: {
  category: string
  excludeId: string
  onSelect: (id: string) => void
}) {
  const { primaryColor } = useTheme()
  const [related, setRelated] = useState<RelatedProduct[]>([])
  const [loadingRelated, setLoadingRelated] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchRelated = async () => {
      try {
        const res = await fetch(
          `${RELATED_API_URL}/v1/public/products/${excludeId}/related`,
        )
        if (!res.ok) return
        const json = (await res.json()) as { data: RelatedProduct[] }
        if (!cancelled && json?.data) setRelated(json.data)
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoadingRelated(false)
      }
    }
    fetchRelated()
    return () => {
      cancelled = true
    }
  }, [excludeId])

  if (loadingRelated || related.length === 0) return null

  return (
    <View className="bg-white rounded-2xl p-4 border border-sand-100">
      <View className="flex-row items-center gap-2 mb-3">
        <ShoppingBag size={14} color={primaryColor} />
        <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
          More {category}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-3">
          {related.map((rp) => (
            <AnimatedPressable
              key={rp.id}
              onPress={() => onSelect(rp.id)}
              className="w-28"
            >
              <View className="w-28 h-36 rounded-xl overflow-hidden bg-sand-100 border border-sand-200">
                {rp.primary_photo_url ? (
                  <Image
                    source={{ uri: rp.primary_photo_url }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                ) : (
                  <View className="flex-1 items-center justify-center">
                    <Text className="text-sand-300">👗</Text>
                  </View>
                )}
                {rp.status === 'SOLD' && (
                  <View className="absolute top-1 left-1 bg-rust-500 rounded-full px-1.5 py-0.5">
                    <Text className="text-white text-[8px] font-bold">Sold</Text>
                  </View>
                )}
              </View>
              <Text className="text-xs font-bold text-sand-900 mt-1.5 tabular-nums">
                {rp.price_min ? `₹${(rp.price_min / 100).toLocaleString('en-IN')}` : ''}
              </Text>
              {rp.primary_color && (
                <Text className="text-[10px] text-sand-500 truncate">{rp.primary_color}</Text>
              )}
            </AnimatedPressable>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
