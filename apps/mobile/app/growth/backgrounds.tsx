import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import {
  ChevronLeft,
  Sparkles,
  Eye,
  Filter,
  Check,
  Calendar,
  MapPin,
} from 'lucide-react-native'
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import {
  growthApi,
  type FestivalBackground,
} from '../../src/lib/api/growth'

// ─── Helpers ──────────────────────────────────────────────────────

const OCCASION_EMOJI: Record<string, string> = {
  diwali: '🪔',
  navratri: '🙏',
  eid: '🌙',
  wedding: '💒',
  rakhi: '🎀',
  holi: '🎨',
  christmas: '🎄',
  'new year': '🎆',
}

function getOccasionEmoji(occasion: string): string {
  const lower = occasion.toLowerCase()
  for (const [key, emoji] of Object.entries(OCCASION_EMOJI)) {
    if (lower.includes(key)) return emoji
  }
  return '✨'
}

// ─── Main Screen ──────────────────────────────────────────────────

export default function BackgroundsScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [filterOccasion, setFilterOccasion] = useState<string | undefined>()
  const [detail, setDetail] = useState<FestivalBackground | null>(null)
  const [applying, setApplying] = useState<FestivalBackground | null>(null)

  const { data: backgroundsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'backgrounds', filterOccasion],
    queryFn: () => growthApi.backgrounds(filterOccasion ? { occasion: filterOccasion } : undefined),
  })
  const backgrounds = backgroundsData?.data ?? []

  const { data: occasionsData } = useQuery({
    queryKey: ['growth', 'backgrounds', 'occasions'],
    queryFn: () => growthApi.backgroundOccasions(),
  })
  const occasions = occasionsData?.data ?? []

  const { data: statsData } = useQuery({
    queryKey: ['growth', 'backgrounds', 'stats'],
    queryFn: () => growthApi.backgroundStats(),
  })
  const stats = statsData?.data

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <AnimatedPressable
              onPress={() => router.back()}
              hitSlop={8}
              className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <ChevronLeft size={20} color="#231F48" />
            </AnimatedPressable>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              Festival Backgrounds
            </Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#BB3F95" />
        </View>
      ) : backgrounds.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4 bg-lavender-100 border border-lavender-200"
            >
              <Sparkles size={28} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              No backgrounds available
            </Text>
            <Text className="text-xs text-heliotrope-500 text-center mt-1.5 leading-relaxed max-w-[260px] font-medium">
              Festival backgrounds are curated by the platform admin. Check back during festive
              seasons for Diwali, Eid, Wedding, and more.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          {/* Stats strip */}
          {stats && (
            <View className="flex-row gap-2 px-4 pt-4 mb-3">
              <View className="flex-1 flex-row items-center justify-center gap-1.5 bg-white rounded-2xl px-3.5 py-2.5 border border-lavender-200 shadow-sm">
                <Sparkles size={13} color="#BB3F95" />
                <Text className="text-xs font-bold text-spaceCadet-900">
                  {stats.active} active styles
                </Text>
              </View>
              <View className="flex-1 flex-row items-center justify-center gap-1.5 bg-white rounded-2xl px-3.5 py-2.5 border border-lavender-200 shadow-sm">
                <Calendar size={13} color="#6B4773" />
                <Text className="text-xs font-bold text-spaceCadet-900">
                  {stats.occasions.length} festive occasions
                </Text>
              </View>
            </View>
          )}

          {/* Occasion filter chips */}
          {occasions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3.5 px-4">
              <View className="flex-row gap-2">
                <AnimatedPressable
                  onPress={() => setFilterOccasion(undefined)}
                  className={`flex-row items-center gap-1 rounded-full px-4 py-1.5 border ${
                    !filterOccasion ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
                  }`}
                >
                  <Filter size={12} color={!filterOccasion ? 'white' : '#928EB2'} />
                  <Text
                    className={`text-xs font-bold ${!filterOccasion ? 'text-white' : 'text-spaceCadet-900'}`}
                  >
                    All
                  </Text>
                </AnimatedPressable>
                {occasions.map((o) => {
                  const active = filterOccasion === o.occasion
                  return (
                    <AnimatedPressable
                      key={o.occasion}
                      onPress={() =>
                        setFilterOccasion(filterOccasion === o.occasion ? undefined : o.occasion)
                      }
                      className={`flex-row items-center gap-1.5 rounded-full px-4 py-1.5 border ${
                        active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
                      }`}
                    >
                      <Text className="text-xs">{getOccasionEmoji(o.occasion)}</Text>
                      <Text
                        className={`text-xs font-bold ${
                          active ? 'text-white' : 'text-spaceCadet-900'
                        }`}
                      >
                        {o.occasion}
                      </Text>
                      <Text
                        className={`text-[10px] font-bold ${
                          active ? 'text-lavender-200' : 'text-heliotrope-400'
                        }`}
                      >
                        {o.count}
                      </Text>
                    </AnimatedPressable>
                  )
                })}
              </View>
            </ScrollView>
          )}

          {/* Background grid — 2 columns */}
          <View className="flex-row flex-wrap px-4 gap-3">
            {backgrounds.map((bg) => (
              <AnimatedPressable
                key={bg.id}
                onPress={() => setDetail(bg)}
                accessibilityRole="button"
                accessibilityLabel={`View ${bg.name}`}
                className="bg-white rounded-3xl border border-lavender-200 overflow-hidden shadow-sm"
                style={{ width: '48%' }}
              >
                <Image
                  source={{ uri: bg.thumbnail_url ?? bg.image_url }}
                  className="w-full h-36"
                  contentFit="cover"
                  transition={200}
                />
                <View className="p-3">
                  <View className="flex-row items-center gap-1 mb-1">
                    <Text className="text-xs">{getOccasionEmoji(bg.occasion)}</Text>
                    <Text
                      style={{ fontFamily: 'Marcellus_400Regular' }}
                      className="text-sm font-bold text-spaceCadet-900 flex-1"
                      numberOfLines={1}
                    >
                      {bg.name}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View className="bg-fuchsia-500/10 rounded-full px-2 py-0.5 border border-fuchsia-500/20">
                      <Text className="text-[10px] font-bold text-fuchsia-700">
                        {bg.occasion}
                      </Text>
                    </View>
                    <Text className="text-[10px] text-heliotrope-500 font-medium">
                      {bg.usage_count} uses
                    </Text>
                  </View>
                </View>
              </AnimatedPressable>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Detail modal */}
      {detail && (
        <BackgroundDetailModal
          background={detail}
          onClose={() => setDetail(null)}
          onApply={(bg) => {
            setDetail(null)
            setApplying(bg)
          }}
        />
      )}

      {/* Apply modal — pick product */}
      {applying && (
        <ApplyBackgroundModal
          background={applying}
          onClose={() => setApplying(null)}
          onApplied={() => {
            setApplying(null)
            void queryClient.invalidateQueries({ queryKey: ['growth', 'backgrounds'] })
          }}
        />
      )}
    </View>
  )
}

// ─── Background Detail Modal ──────────────────────────────────────

function BackgroundDetailModal({
  background: bg,
  onClose,
  onApply,
}: {
  background: FestivalBackground
  onClose: () => void
  onApply: (bg: FestivalBackground) => void
}) {
  const insets = useSafeAreaInsets()

  return (
    <View
      className="absolute inset-0 bg-black/60 items-center justify-end"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="bg-white rounded-t-3xl w-full max-h-[85%] border-t border-lavender-200">
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Preview image */}
          <Image
            source={{ uri: bg.image_url }}
            className="w-full h-60 rounded-t-3xl"
            contentFit="cover"
          />

          <View className="px-5 pt-4 pb-8">
            {/* Title */}
            <View className="flex-row items-center gap-2 mb-1.5">
              <Text className="text-lg">{getOccasionEmoji(bg.occasion)}</Text>
              <Text
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-xl font-bold text-spaceCadet-900 flex-1"
              >
                {bg.name}
              </Text>
            </View>

            {/* Tags */}
            <View className="flex-row items-center gap-2 mb-3">
              <View className="bg-fuchsia-500/10 rounded-full px-3 py-1 border border-fuchsia-500/20">
                <Text className="text-xs font-bold text-fuchsia-700">
                  {bg.occasion}
                </Text>
              </View>
              {bg.season && (
                <View className="bg-lavender-100 rounded-full px-3 py-1 border border-lavender-200">
                  <Text className="text-xs font-bold text-spaceCadet-900">
                    {bg.season}
                  </Text>
                </View>
              )}
              {bg.region && (
                <View className="bg-lavender-100 rounded-full px-3 py-1 flex-row items-center gap-1 border border-lavender-200">
                  <MapPin size={11} color="#6B4773" />
                  <Text className="text-xs font-bold text-spaceCadet-900">
                    {bg.region}
                  </Text>
                </View>
              )}
            </View>

            {bg.description && (
              <Text className="text-xs text-heliotrope-500 mb-3.5 leading-relaxed font-medium">{bg.description}</Text>
            )}

            {/* Stats */}
            <View className="flex-row gap-4 mb-4 pt-2 border-t border-lavender-100">
              <View className="flex-row items-center gap-1.5">
                <Eye size={14} color="#6B4773" />
                <Text className="text-xs text-heliotrope-500 font-medium">
                  {bg.usage_count} {bg.usage_count === 1 ? 'time' : 'times'} used
                </Text>
              </View>
              {bg.valid_from && (
                <Text className="text-xs text-heliotrope-400 font-medium">
                  Valid from {new Date(bg.valid_from).toLocaleDateString('en-IN')}
                </Text>
              )}
            </View>

            {/* Apply button */}
            <GradientButton
              label="✨ Apply to Product Photoshoot"
              onPress={() => onApply(bg)}
            />

            <AnimatedPressable
              onPress={onClose}
              className="items-center justify-center bg-lavender-100 rounded-2xl py-3 mt-3 border border-lavender-200"
            >
              <Text className="text-sm font-bold text-spaceCadet-900">Close</Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

// ─── Apply Background Modal — Pick Product ────────────────────────

function ApplyBackgroundModal({
  background: bg,
  onClose,
  onApplied,
}: {
  background: FestivalBackground
  onClose: () => void
  onApplied: () => void
}) {
  const insets = useSafeAreaInsets()

  const [productId, setProductId] = useState('')
  const [applying, setApplying] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleApply = async () => {
    if (!productId.trim() || applying) return
    setApplying(true)
    setError('')
    try {
      const res = await growthApi.applyBackground(bg.id, productId.trim())
      const jobId = res.data.job_id
      setStatus('processing')

      // Poll for completion
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        try {
          const poll = await growthApi.backgroundApplyStatus(bg.id, jobId)
          if (poll.data.status === 'ready') {
            setStatus('ready')
            setApplying(false)
            onApplied()
            return
          }
          if (poll.data.status === 'failed') {
            setStatus('failed')
            setApplying(false)
            return
          }
        } catch {
          // keep polling
        }
      }
      setStatus('timeout')
      setApplying(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply background')
      setApplying(false)
    }
  }

  return (
    <View
      className="absolute inset-0 bg-black/60 items-center justify-end"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8 border-t border-lavender-200">
        <Text
          style={{ fontFamily: 'Marcellus_400Regular' }}
          className="text-xl font-bold text-spaceCadet-900 mb-1"
        >
          Apply Festive Backdrop
        </Text>
        <Text className="text-xs text-heliotrope-500 font-medium mb-4">
          {getOccasionEmoji(bg.occasion)} {bg.name} — {bg.occasion}
        </Text>

        {/* Product ID input */}
        <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">
          Product ID
        </Text>
        <TextInput
          value={productId}
          onChangeText={setProductId}
          placeholder="Paste product ID from your catalog"
          placeholderTextColor="#928EB2"
          className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-1"
          editable={!applying}
        />
        <Text className="text-[10px] text-heliotrope-400 font-medium mb-4 px-1">
          Find it on your product detail screen → Copy ID
        </Text>

        {/* Status */}
        {status === 'processing' && (
          <View className="flex-row items-center gap-2 bg-fuchsia-500/10 border border-fuchsia-500/20 rounded-2xl px-4 py-3 mb-4">
            <ActivityIndicator size="small" color="#BB3F95" />
            <Text className="text-xs text-fuchsia-700 font-bold">
              AI is rendering the photoshoot background…
            </Text>
          </View>
        )}
        {status === 'ready' && (
          <View className="flex-row items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 mb-4">
            <Check size={16} color="#16a34a" />
            <Text className="text-xs text-emerald-700 font-bold">
              Background applied successfully!
            </Text>
          </View>
        )}
        {status === 'failed' && (
          <View className="bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 mb-4">
            <Text className="text-xs text-rose-700 font-semibold">
              Generation failed. Check your product photo and try again.
            </Text>
          </View>
        )}

        {error ? (
          <View className="bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 mb-4">
            <Text className="text-xs text-rose-700 font-semibold">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-3">
          {status !== 'ready' && (
            <View className="flex-1">
              <GradientButton
                label={applying ? 'Applying…' : '✨ Apply'}
                onPress={() => void handleApply()}
                disabled={!productId.trim() || applying}
              />
            </View>
          )}
          <AnimatedPressable
            onPress={onClose}
            className="flex-1 items-center justify-center bg-lavender-100 rounded-2xl py-3 border border-lavender-200"
          >
            <Text className="text-sm font-bold text-spaceCadet-900">
              {status === 'ready' ? 'Done' : 'Cancel'}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  )
}

