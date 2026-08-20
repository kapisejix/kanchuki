import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import {
  ChevronLeft,
  Sparkles,
  Eye,
  Filter,
  Check,
  Image as ImageIcon,
  Calendar,
  MapPin,
} from 'lucide-react-native'
import {
  ActivityIndicator,
  Alert,
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
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

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
  const { primaryColor, colors } = useTheme()
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
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <AnimatedPressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <ChevronLeft size={24} color={colors.sand[700]} />
            </AnimatedPressable>
            <Text className="text-base font-bold text-sand-900">Festival Backgrounds</Text>
          </View>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : backgrounds.length === 0 ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <Sparkles size={28} color={primaryColor} />
            </View>
            <Text className="text-base font-bold text-sand-900">No backgrounds available</Text>
            <Text className="text-xs text-sand-500 text-center mt-1.5 leading-4 max-w-[260px]">
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
              <View className="flex-row items-center gap-1.5 bg-white rounded-full px-3 py-1.5 border border-sand-100">
                <Sparkles size={12} color={primaryColor} />
                <Text className="text-[10px] font-semibold text-sand-600">
                  {stats.active} active
                </Text>
              </View>
              <View className="flex-row items-center gap-1.5 bg-white rounded-full px-3 py-1.5 border border-sand-100">
                <Calendar size={12} color={colors.sand[500]} />
                <Text className="text-[10px] font-semibold text-sand-600">
                  {stats.occasions.length} occasions
                </Text>
              </View>
            </View>
          )}

          {/* Occasion filter chips */}
          {occasions.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 px-4">
              <View className="flex-row gap-2">
                <AnimatedPressable
                  onPress={() => setFilterOccasion(undefined)}
                  className="flex-row items-center gap-1 rounded-full px-3 py-1.5 border"
                  style={{
                    backgroundColor: !filterOccasion ? `${primaryColor}1A` : colors.sand[50],
                    borderColor: !filterOccasion ? primaryColor : colors.sand[200],
                  }}
                >
                  <Filter size={12} color={!filterOccasion ? primaryColor : colors.sand[400]} />
                  <Text
                    className="text-[11px] font-semibold"
                    style={{ color: !filterOccasion ? primaryColor : colors.sand[500] }}
                  >
                    All
                  </Text>
                </AnimatedPressable>
                {occasions.map((o) => (
                  <AnimatedPressable
                    key={o.occasion}
                    onPress={() =>
                      setFilterOccasion(filterOccasion === o.occasion ? undefined : o.occasion)
                    }
                    className="flex-row items-center gap-1 rounded-full px-3 py-1.5 border"
                    style={{
                      backgroundColor:
                        filterOccasion === o.occasion ? `${primaryColor}1A` : colors.sand[50],
                      borderColor:
                        filterOccasion === o.occasion ? primaryColor : colors.sand[200],
                    }}
                  >
                    <Text className="text-xs">{getOccasionEmoji(o.occasion)}</Text>
                    <Text
                      className="text-[11px] font-semibold"
                      style={{
                        color:
                          filterOccasion === o.occasion ? primaryColor : colors.sand[500],
                      }}
                    >
                      {o.occasion}
                    </Text>
                    <Text
                      className="text-[10px]"
                      style={{
                        color:
                          filterOccasion === o.occasion ? primaryColor : colors.sand[400],
                      }}
                    >
                      {o.count}
                    </Text>
                  </AnimatedPressable>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Background grid — 2 columns */}
          <View className="flex-row flex-wrap px-3 gap-2.5">
            {backgrounds.map((bg) => (
              <AnimatedPressable
                key={bg.id}
                onPress={() => setDetail(bg)}
                accessibilityRole="button"
                accessibilityLabel={`View ${bg.name}`}
                className="bg-white rounded-2xl border border-sand-100 overflow-hidden"
                style={{ width: '48.5%' }}
              >
                <Image
                  source={{ uri: bg.thumbnail_url ?? bg.image_url }}
                  className="w-full h-36"
                  contentFit="cover"
                  transition={200}
                />
                <View className="p-2.5">
                  <View className="flex-row items-center gap-1 mb-0.5">
                    <Text className="text-xs">{getOccasionEmoji(bg.occasion)}</Text>
                    <Text className="text-xs font-bold text-sand-900" numberOfLines={1}>
                      {bg.name}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1.5">
                    <View className="bg-turmeric-50 rounded-full px-2 py-0.5">
                      <Text className="text-[10px] font-semibold text-turmeric-600">
                        {bg.occasion}
                      </Text>
                    </View>
                    <Text className="text-[10px] text-sand-400">
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
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      className="absolute inset-0 bg-black/60 items-center justify-end"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="bg-white rounded-t-3xl w-full max-h-[85%]">
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Preview image */}
          <Image
            source={{ uri: bg.image_url }}
            className="w-full h-56 rounded-t-3xl"
            contentFit="cover"
          />

          <View className="px-5 pt-4 pb-8">
            {/* Title */}
            <View className="flex-row items-center gap-2 mb-1">
              <Text className="text-lg">{getOccasionEmoji(bg.occasion)}</Text>
              <Text className="text-base font-bold text-sand-900 flex-1">{bg.name}</Text>
            </View>

            {/* Tags */}
            <View className="flex-row items-center gap-2 mb-3">
              <View className="bg-turmeric-50 rounded-full px-2.5 py-1">
                <Text className="text-[11px] font-semibold text-turmeric-600">
                  {bg.occasion}
                </Text>
              </View>
              {bg.season && (
                <View className="bg-sand-50 rounded-full px-2.5 py-1">
                  <Text className="text-[11px] font-semibold text-sand-500">
                    {bg.season}
                  </Text>
                </View>
              )}
              {bg.region && (
                <View className="bg-sand-50 rounded-full px-2.5 py-1 flex-row items-center gap-0.5">
                  <MapPin size={10} color={colors.sand[400]} />
                  <Text className="text-[11px] font-semibold text-sand-500">
                    {bg.region}
                  </Text>
                </View>
              )}
            </View>

            {bg.description && (
              <Text className="text-sm text-sand-600 mb-3 leading-5">{bg.description}</Text>
            )}

            {/* Stats */}
            <View className="flex-row gap-4 mb-4">
              <View className="flex-row items-center gap-1">
                <Eye size={14} color={colors.sand[400]} />
                <Text className="text-xs text-sand-500">
                  {bg.usage_count} {bg.usage_count === 1 ? 'time' : 'times'} used
                </Text>
              </View>
              {bg.valid_from && (
                <Text className="text-[10px] text-sand-400">
                  Valid from {new Date(bg.valid_from).toLocaleDateString('en-IN')}
                </Text>
              )}
            </View>

            {/* Apply button */}
            <GradientButton
              label="✨ Apply to Product"
              onPress={() => onApply(bg)}
            />

            <AnimatedPressable
              onPress={onClose}
              className="items-center justify-center bg-sand-100 rounded-xl py-3 mt-2.5"
            >
              <Text className="text-sm font-semibold text-sand-600">Close</Text>
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
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

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
      <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8">
        <Text className="text-base font-bold text-sand-900 mb-1">
          Apply Background
        </Text>
        <Text className="text-xs text-sand-500 mb-4">
          {getOccasionEmoji(bg.occasion)} {bg.name} — {bg.occasion}
        </Text>

        {/* Product ID input */}
        <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">
          Product ID
        </Text>
        <TextInput
          value={productId}
          onChangeText={setProductId}
          placeholder="Paste product ID from your catalog"
          placeholderTextColor={colors.sand[300]}
          className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-1"
          editable={!applying}
        />
        <Text className="text-[10px] text-sand-400 mb-4 px-1">
          Find it on your product detail screen → Copy ID
        </Text>

        {/* Status */}
        {status === 'processing' && (
          <View className="flex-row items-center gap-2 bg-blue-50 rounded-xl px-4 py-3 mb-4">
            <ActivityIndicator size="small" color="#3B82F6" />
            <Text className="text-xs text-blue-600 font-medium">
              AI is applying the background…
            </Text>
          </View>
        )}
        {status === 'ready' && (
          <View className="flex-row items-center gap-2 bg-green-50 rounded-xl px-4 py-3 mb-4">
            <Check size={16} color="#22C55E" />
            <Text className="text-xs text-green-600 font-medium">
              Background applied successfully!
            </Text>
          </View>
        )}
        {status === 'failed' && (
          <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
            <Text className="text-xs text-red-600">
              Generation failed. Check your product photo and try again.
            </Text>
          </View>
        )}

        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
            <Text className="text-xs text-red-600">{error}</Text>
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
            className="flex-1 items-center justify-center bg-sand-100 rounded-xl py-3"
          >
            <Text className="text-sm font-semibold text-sand-600">
              {status === 'ready' ? 'Done' : 'Cancel'}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  )
}
