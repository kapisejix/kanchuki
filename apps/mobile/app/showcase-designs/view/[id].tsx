// Suits Designs — public design detail + share (customer-facing,
// docs/tasks/suits-designs.md §2.4). Big watermarked image, store name,
// Share (system sheet with the permalink + image) / WhatsApp (wa.me) /
// Copy link, and a "Visit store" CTA. Public API only — no session needed.
import { View, Text, Image, ActivityIndicator, Alert, Linking, Platform, Share as RnShare } from 'react-native'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import * as Sharing from 'expo-sharing'
import * as Clipboard from 'expo-clipboard'
import { Share2, MessageCircle, Copy, Store } from 'lucide-react-native'
import { useScreenInsets } from '../../../src/lib/safe-area'
import { showcaseDesignsApi, type PublicShowcaseDesignDetail } from '../../../src/lib/api'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'

const WEB_URL = process.env['EXPO_PUBLIC_WEB_URL'] ?? 'https://kanchuki.app'

export default function ShowcaseDesignViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { screenPaddingBottom } = useScreenInsets()

  const { data, isLoading } = useQuery({
    queryKey: ['showcase-designs', 'public', id],
    queryFn: () => showcaseDesignsApi.publicOne(id ?? ''),
    enabled: !!id,
    staleTime: 60_000,
  })
  const design: PublicShowcaseDesignDetail | undefined = data?.data

  const storeSlug = design?.store?.slug ?? null
  const permalink = `${WEB_URL}/${storeSlug ?? ''}/designs/${id ?? ''}`

  const handleShare = async () => {
    try {
      if (Platform.OS === 'web') {
        // Web Share API (fallback: clipboard)
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ title: design?.name ?? 'Design', url: permalink })
          return
        }
        await Clipboard.setStringAsync(permalink)
        Alert.alert('Link copied', permalink)
        return
      }
      // Native system share sheet — image + permalink.
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(design!.image_url, {
          dialogTitle: design?.name ?? 'Design',
          mimeType: 'image/jpeg',
        })
        return
      }
      await RnShare.share({ message: `${design?.name ?? 'Design'} — ${permalink}` })
    } catch {
      // Share sheet dismissed by the user is not an error.
    }
  }

  const handleWhatsApp = () => {
    const text = encodeURIComponent(`${design?.name ?? 'Design'} — ${permalink}`)
    Linking.openURL(`https://wa.me/?text=${text}`).catch(() => {
      Alert.alert('Could not open WhatsApp', 'Check that WhatsApp is installed.')
    })
  }

  const handleCopy = async () => {
    await Clipboard.setStringAsync(permalink)
    Alert.alert('Link copied', 'Share it with your customers!')
  }

  if (isLoading || !design) {
    return (
      <View className="flex-1 bg-[#F8F7FC] items-center justify-center">
        <ActivityIndicator color="#BB3F95" />
      </View>
    )
  }

  const visitSlug = storeSlug

  return (
    <>
      <Stack.Screen options={{ title: design.name ?? 'Design', headerShown: true }} />
      <View className="flex-1 bg-[#F8F7FC]" style={{ paddingBottom: screenPaddingBottom }}>
        <View className="items-center pt-6 px-6">
          <View className="w-full max-w-sm aspect-[3/4] rounded-3xl overflow-hidden bg-lavender-100 border border-lavender-200 shadow-sm">
            <Image source={{ uri: design.image_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          </View>

          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-lg font-bold text-spaceCadet-900 mt-5 text-center"
          >
            {design.name ?? `${design.category.name ?? 'Design'} design`}
          </Text>
          <Text className="text-xs text-heliotrope-500 font-medium mt-1">
            {design.category.name ?? 'Design'}
            {design.store ? ` · from ${design.store.shop_name ?? design.store.slug}` : ' · Kanchuki'}
          </Text>
        </View>

        {/* Share actions */}
        <View className="px-6 mt-7 gap-3">
          <AnimatedPressable
            onPress={() => void handleShare()}
            className="flex-row items-center justify-center gap-2 bg-spaceCadet-900 py-3.5 rounded-2xl"
          >
            <Share2 size={17} color="white" />
            <Text className="text-white text-sm font-bold">Share</Text>
          </AnimatedPressable>

          <View className="flex-row gap-3">
            <AnimatedPressable
              onPress={handleWhatsApp}
              className="flex-1 flex-row items-center justify-center gap-2 bg-white py-3.5 rounded-2xl border border-lavender-200 shadow-sm"
            >
              <MessageCircle size={17} color="#25D366" />
              <Text className="text-spaceCadet-900 text-sm font-bold">WhatsApp</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => void handleCopy()}
              className="flex-1 flex-row items-center justify-center gap-2 bg-white py-3.5 rounded-2xl border border-lavender-200 shadow-sm"
            >
              <Copy size={17} color="#6B4773" />
              <Text className="text-spaceCadet-900 text-sm font-bold">Copy link</Text>
            </AnimatedPressable>
          </View>

          {visitSlug && (
            <AnimatedPressable
              onPress={() => router.push(`/showcase-designs/browse?store=${encodeURIComponent(visitSlug)}`)}
              className="flex-row items-center justify-center gap-2 py-3.5 rounded-2xl border border-lavender-200 bg-white"
            >
              <Store size={17} color="#BB3F95" />
              <Text className="text-sm font-bold text-fuchsia-600">Visit store</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>
    </>
  )
}