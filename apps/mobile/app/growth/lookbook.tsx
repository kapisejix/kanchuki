import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import {
  ChevronLeft,
  BookOpen,
  Plus,
  Trash2,
  Eye,
  Share2,
  RefreshCw,
  ExternalLink,
  FileText,
  Grid3x3,
  Newspaper,
  Image as ImageIcon,
  LayoutGrid,
} from 'lucide-react-native'
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  Share,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import {
  growthApi,
  type Lookbook,
  type LookbookFormat,
  type LookbookStatus,
} from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

// ─── Helpers ──────────────────────────────────────────────────────

const FORMAT_LABELS: Record<LookbookFormat, string> = {
  CAROUSEL: 'Carousel',
  GRID: 'Grid',
  EDITORIAL: 'Editorial',
  PDF: 'PDF',
}

const FORMAT_ICONS: Record<LookbookFormat, typeof BookOpen> = {
  CAROUSEL: LayoutGrid,
  GRID: Grid3x3,
  EDITORIAL: Newspaper,
  PDF: FileText,
}

const STATUS_CONFIG: Record<LookbookStatus, { label: string; color: string; bg: string }> = {
  DRAFT: { label: 'Draft', color: '#9CA3AF', bg: '#F3F4F6' },
  GENERATING: { label: 'Generating…', color: '#3B82F6', bg: '#EFF6FF' },
  READY: { label: 'Ready', color: '#22C55E', bg: '#F0FDF4' },
  FAILED: { label: 'Failed', color: '#EF4444', bg: '#FEF2F2' },
}

// ─── Main Screen ──────────────────────────────────────────────────

export default function LookbookScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [detail, setDetail] = useState<Lookbook | null>(null)
  const [filterStatus, setFilterStatus] = useState<LookbookStatus | undefined>()

  const { data: lookbooksData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'lookbooks', filterStatus],
    queryFn: () => growthApi.lookbooks(filterStatus ? { status: filterStatus } : undefined),
  })
  const lookbooks = lookbooksData?.data ?? []

  const { data: statsData } = useQuery({
    queryKey: ['growth', 'lookbooks', 'stats'],
    queryFn: () => growthApi.lookbookStats(),
  })
  const stats = statsData?.data

  const remove = useMutation({
    mutationFn: (id: string) => growthApi.deleteLookbook(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'lookbooks'] })
      setDetail(null)
    },
    onError: (err) => showError(err, 'Failed to delete lookbook'),
  })

  const confirmDelete = (lb: Lookbook) => {
    Alert.alert('Delete lookbook?', `"${lb.name}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(lb.id) },
    ])
  }

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
            <Text className="text-base font-bold text-sand-900">Lookbooks</Text>
          </View>
          <AnimatedPressable
            onPress={() => setCreating(true)}
            accessibilityLabel="New lookbook"
            accessibilityRole="button"
            className="w-9 h-9 rounded-xl items-center justify-center"
            style={{ backgroundColor: `${primaryColor}1A` }}
          >
            <Plus size={20} color={primaryColor} />
          </AnimatedPressable>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={primaryColor} />
        </View>
      ) : lookbooks.length === 0 && !creating ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <BookOpen size={28} color={primaryColor} />
            </View>
            <Text className="text-base font-bold text-sand-900">No lookbooks yet</Text>
            <Text className="text-xs text-sand-500 text-center mt-1.5 leading-4 max-w-[260px]">
              Create styled product collections — pick your best items, choose a layout, and
              generate a shareable lookbook for Instagram, WhatsApp, or PDF.
            </Text>
            <View className="w-48 mt-5">
              <GradientButton label="Create Lookbook" onPress={() => setCreating(true)} />
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          className="flex-1 px-4 pt-4"
          contentContainerStyle={{ paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          {/* Stats strip */}
          {stats && (
            <View className="flex-row gap-2 mb-3">
              <StatChip icon={BookOpen} label={`${stats.total} lookbooks`} color={primaryColor} />
              <StatChip icon={Eye} label={`${stats.total_views} views`} color={colors.sand[500]} />
              <StatChip icon={Share2} label={`${stats.total_shares} shares`} color={colors.sand[500]} />
            </View>
          )}

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 -mx-1">
            <View className="flex-row gap-2 px-1">
              <FilterChip
                label="All"
                active={!filterStatus}
                onPress={() => setFilterStatus(undefined)}
                primaryColor={primaryColor}
                colors={colors}
              />
              {(['READY', 'DRAFT', 'GENERATING', 'FAILED'] as const).map((s) => (
                <FilterChip
                  key={s}
                  label={STATUS_CONFIG[s].label}
                  active={filterStatus === s}
                  onPress={() => setFilterStatus(filterStatus === s ? undefined : s)}
                  primaryColor={primaryColor}
                  colors={colors}
                />
              ))}
            </View>
          </ScrollView>

          {/* Lookbook cards */}
          <View className="gap-2.5">
            {lookbooks.map((lb) => {
              const FormatIcon = FORMAT_ICONS[lb.format]
              const statusConf = STATUS_CONFIG[lb.status]
              return (
                <AnimatedPressable
                  key={lb.id}
                  onPress={() => setDetail(lb)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${lb.name}`}
                  className="bg-white rounded-2xl border border-sand-100 overflow-hidden"
                >
                  {/* Cover image */}
                  {lb.cover_url ? (
                    <Image
                      source={{ uri: lb.cover_url }}
                      className="w-full h-36"
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View
                      className="w-full h-24 items-center justify-center"
                      style={{ backgroundColor: `${primaryColor}0D` }}
                    >
                      <BookOpen size={24} color={colors.sand[300]} />
                      <Text className="text-[10px] text-sand-400 mt-1">No cover yet</Text>
                    </View>
                  )}

                  <View className="p-3">
                    <View className="flex-row items-center justify-between mb-1">
                      <View className="flex-row items-center gap-2 flex-1 mr-2">
                        <FormatIcon size={16} color={primaryColor} />
                        <Text className="text-sm font-bold text-sand-900" numberOfLines={1}>
                          {lb.name}
                        </Text>
                      </View>
                      <View
                        className="rounded-full px-2 py-0.5"
                        style={{ backgroundColor: statusConf.bg }}
                      >
                        <Text
                          className="text-[10px] font-semibold"
                          style={{ color: statusConf.color }}
                        >
                          {statusConf.label}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center gap-2 mt-1">
                      <Text className="text-[10px] text-sand-400">
                        {FORMAT_LABELS[lb.format]}
                      </Text>
                      <Text className="text-[10px] text-sand-300">·</Text>
                      <Text className="text-[10px] text-sand-400">
                        {lb.product_ids.length} {lb.product_ids.length === 1 ? 'product' : 'products'}
                      </Text>
                      <Text className="text-[10px] text-sand-300">·</Text>
                      <Text className="text-[10px] text-sand-400">
                        {lb.view_count} views
                      </Text>
                      <View className="flex-1" />
                      <AnimatedPressable
                        onPress={() => confirmDelete(lb)}
                        hitSlop={8}
                        accessibilityLabel={`Delete ${lb.name}`}
                        accessibilityRole="button"
                      >
                        <Trash2 size={14} color={colors.rust?.[500] ?? '#DC2626'} />
                      </AnimatedPressable>
                    </View>
                  </View>
                </AnimatedPressable>
              )
            })}
          </View>

          <View className="mt-5">
            <GradientButton label="+ New Lookbook" onPress={() => setCreating(true)} />
          </View>
        </ScrollView>
      )}

      {/* Create form modal */}
      {creating && (
        <CreateLookbookModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            void queryClient.invalidateQueries({ queryKey: ['growth', 'lookbooks'] })
          }}
        />
      )}

      {/* Detail modal */}
      {detail && (
        <LookbookDetailModal
          lookbook={detail}
          onClose={() => setDetail(null)}
          onRefresh={() => {
            void queryClient.invalidateQueries({ queryKey: ['growth', 'lookbooks'] })
          }}
        />
      )}
    </View>
  )
}

// ─── Stat Chip ────────────────────────────────────────────────────

function StatChip({
  icon: Icon,
  label,
  color,
}: {
  icon: typeof BookOpen
  label: string
  color: string
}) {
  return (
    <View className="flex-row items-center gap-1.5 bg-white rounded-full px-3 py-1.5 border border-sand-100">
      <Icon size={12} color={color} />
      <Text className="text-[10px] font-semibold text-sand-600">{label}</Text>
    </View>
  )
}

// ─── Filter Chip ──────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onPress,
  primaryColor,
  colors,
}: {
  label: string
  active: boolean
  onPress: () => void
  primaryColor: string
  colors: any
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      className="rounded-full px-3 py-1.5 border"
      style={{
        backgroundColor: active ? `${primaryColor}1A` : colors.sand[50],
        borderColor: active ? primaryColor : colors.sand[200],
      }}
    >
      <Text
        className="text-[11px] font-semibold"
        style={{ color: active ? primaryColor : colors.sand[500] }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  )
}

// ─── Create Lookbook Modal ────────────────────────────────────────

function CreateLookbookModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [format, setFormat] = useState<LookbookFormat>('CAROUSEL')
  const [productIds, setProductIds] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const parsedIds = productIds
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const canSubmit = name.trim() && parsedIds.length >= 1 && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      await growthApi.createLookbook({
        name: name.trim(),
        description: description.trim() || undefined,
        format,
        product_ids: parsedIds,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create lookbook')
      setSaving(false)
    }
  }

  return (
    <View
      className="absolute inset-0 bg-black/60 items-center justify-end"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8 max-h-[85%]">
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text className="text-base font-bold text-sand-900 mb-4">New Lookbook</Text>

          {/* Name */}
          <Label text="Lookbook Name" />
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Diwali Collection 2026, Wedding Essentials…"
            colors={colors}
          />

          {/* Description */}
          <Label text="Description (optional)" />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="A short description of this collection…"
            placeholderTextColor={colors.sand[300]}
            className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-4 min-h-[60px]"
            multiline
            textAlignVertical="top"
          />

          {/* Format */}
          <Label text="Layout Format" />
          <View className="flex-row gap-2 mb-4">
            {(
              [
                { value: 'CAROUSEL' as const, label: 'Carousel', emoji: '📱' },
                { value: 'GRID' as const, label: 'Grid', emoji: '🔲' },
                { value: 'EDITORIAL' as const, label: 'Editorial', emoji: '📰' },
                { value: 'PDF' as const, label: 'PDF', emoji: '📄' },
              ] as const
            ).map((f) => (
              <AnimatedPressable
                key={f.value}
                onPress={() => setFormat(f.value)}
                className="flex-1 items-center py-2.5 rounded-xl border"
                style={{
                  backgroundColor: format === f.value ? `${primaryColor}1A` : colors.sand[50],
                  borderColor: format === f.value ? primaryColor : colors.sand[200],
                }}
              >
                <Text className="text-base mb-0.5">{f.emoji}</Text>
                <Text
                  className="text-[10px] font-semibold"
                  style={{ color: format === f.value ? primaryColor : colors.sand[500] }}
                >
                  {f.label}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          {/* Product IDs */}
          <Label text="Product IDs" />
          <TextInput
            value={productIds}
            onChangeText={setProductIds}
            placeholder={"Paste product IDs, one per line\nor comma-separated:\ncm1abc123\ncm2def456"}
            placeholderTextColor={colors.sand[300]}
            className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-1 min-h-[80px]"
            multiline
            textAlignVertical="top"
          />
          <Text className="text-[10px] text-sand-400 mb-4 px-1">
            {parsedIds.length} product{parsedIds.length !== 1 ? 's' : ''} detected
            {parsedIds.length > 20 ? ' (max 20)' : ''}
          </Text>

          {error ? (
            <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
              <Text className="text-xs text-red-600">{error}</Text>
            </View>
          ) : null}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <GradientButton
                label={saving ? 'Creating…' : 'Create Lookbook'}
                onPress={() => void submit()}
                disabled={!canSubmit}
              />
            </View>
            <AnimatedPressable
              onPress={onClose}
              className="flex-1 items-center justify-center bg-sand-100 rounded-xl py-3"
            >
              <Text className="text-sm font-semibold text-sand-600">Cancel</Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

// ─── Lookbook Detail Modal ────────────────────────────────────────

function LookbookDetailModal({
  lookbook,
  onClose,
  onRefresh,
}: {
  lookbook: Lookbook
  onClose: () => void
  onRefresh: () => void
}) {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()

  const [generating, setGenerating] = useState(false)

  const statusConf = STATUS_CONFIG[lookbook.status]
  const FormatIcon = FORMAT_ICONS[lookbook.format]

  const generateMutation = useMutation({
    mutationFn: () => growthApi.generateLookbook(lookbook.id),
    onSuccess: () => {
      setGenerating(false)
      onRefresh()
    },
    onError: (err) => {
      showError(err, 'Generation failed')
      setGenerating(false)
    },
  })

  const shareMutation = useMutation({
    mutationFn: () => growthApi.shareLookbook(lookbook.id),
    onSuccess: async (res) => {
      try {
        await Share.share({
          message: `${lookbook.name}\n\nCheck out this lookbook!`,
          url: res.data.share_url,
        })
        onRefresh()
      } catch {
        // user cancelled
      }
    },
  })

  const handleShare = () => {
    void shareMutation.mutate()
  }

  return (
    <View
      className="absolute inset-0 bg-black/60 items-center justify-end"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="bg-white rounded-t-3xl w-full max-h-[90%]">
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Cover */}
          {lookbook.cover_url ? (
            <Image
              source={{ uri: lookbook.cover_url }}
              className="w-full h-52 rounded-t-3xl"
              contentFit="cover"
            />
          ) : (
            <View
              className="w-full h-40 rounded-t-3xl items-center justify-center"
              style={{ backgroundColor: `${primaryColor}0D` }}
            >
              <BookOpen size={32} color={colors.sand[300]} />
              <Text className="text-xs text-sand-400 mt-2">No cover image</Text>
            </View>
          )}

          <View className="px-5 pt-4 pb-8">
            {/* Title */}
            <View className="flex-row items-center gap-2 mb-1">
              <FormatIcon size={18} color={primaryColor} />
              <Text className="text-base font-bold text-sand-900 flex-1">{lookbook.name}</Text>
            </View>

            <View className="flex-row items-center gap-2 mb-3">
              <Text className="text-xs text-sand-400">{FORMAT_LABELS[lookbook.format]}</Text>
              <Text className="text-xs text-sand-300">·</Text>
              <View
                className="rounded-full px-2 py-0.5"
                style={{ backgroundColor: statusConf.bg }}
              >
                <Text className="text-[10px] font-semibold" style={{ color: statusConf.color }}>
                  {statusConf.label}
                </Text>
              </View>
              <Text className="text-xs text-sand-300">·</Text>
              <Text className="text-xs text-sand-400">
                {lookbook.product_ids.length} products
              </Text>
            </View>

            {lookbook.description && (
              <Text className="text-sm text-sand-600 mb-3 leading-5">{lookbook.description}</Text>
            )}

            {/* Stats */}
            <View className="flex-row gap-4 mb-4">
              <View className="flex-row items-center gap-1">
                <Eye size={14} color={colors.sand[400]} />
                <Text className="text-xs text-sand-500">{lookbook.view_count} views</Text>
              </View>
              <View className="flex-row items-center gap-1">
                <Share2 size={14} color={colors.sand[400]} />
                <Text className="text-xs text-sand-500">{lookbook.share_count} shares</Text>
              </View>
            </View>

            {/* Products list */}
            <View className="mb-4">
              <Text className="text-xs font-semibold text-sand-500 uppercase mb-2">
                Products ({lookbook.product_ids.length})
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {lookbook.product_ids.slice(0, 10).map((pid, i) => (
                  <View key={i} className="bg-sand-50 rounded-lg px-2.5 py-1.5 border border-sand-100">
                    <Text className="text-[10px] font-mono text-sand-500">
                      {pid.slice(0, 12)}…
                    </Text>
                  </View>
                ))}
                {lookbook.product_ids.length > 10 && (
                  <View className="bg-sand-50 rounded-lg px-2.5 py-1.5">
                    <Text className="text-[10px] font-semibold text-sand-400">
                      +{lookbook.product_ids.length - 10} more
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Action buttons */}
            <View className="gap-2.5">
              {/* Generate / Regenerate */}
              {lookbook.status !== 'GENERATING' && (
                <GradientButton
                  label={generating ? 'Generating…' : '✨ Generate Lookbook'}
                  onPress={() => {
                    setGenerating(true)
                    void generateMutation.mutate()
                  }}
                  disabled={generating}
                />
              )}
              {lookbook.status === 'GENERATING' && (
                <View className="flex-row items-center gap-2 bg-blue-50 rounded-xl px-4 py-3">
                  <ActivityIndicator size="small" color="#3B82F6" />
                  <Text className="text-xs text-blue-600 font-medium">
                    Generating your lookbook…
                  </Text>
                </View>
              )}

              {/* View output */}
              {lookbook.status === 'READY' && lookbook.output_url && (
                <AnimatedPressable
                  onPress={() => {
                    // Would open the output URL in a webview or browser
                  }}
                  className="items-center justify-center bg-sand-100 rounded-xl py-3"
                >
                  <Text className="text-sm font-semibold text-sand-700">👁 View Output</Text>
                </AnimatedPressable>
              )}

              {/* Share */}
              {lookbook.status === 'READY' && (
                <View className="flex-row gap-2.5">
                  <View className="flex-1">
                    <GradientButton
                      label="📤 Share"
                      onPress={() => void handleShare()}
                      disabled={shareMutation.isPending}
                    />
                  </View>
                  {lookbook.share_url && (
                    <View className="flex-1">
                      <AnimatedPressable
                        onPress={async () => {
                          try {
                            const { Clipboard } = await import('react-native')
                            Clipboard.setString(lookbook.share_url!)
                            Alert.alert('Copied', 'Lookbook link copied to clipboard')
                          } catch {
                            // fallback
                          }
                        }}
                        className="items-center justify-center bg-sand-100 rounded-xl py-3.5"
                      >
                        <Text className="text-sm font-semibold text-sand-700">🔗 Copy Link</Text>
                      </AnimatedPressable>
                    </View>
                  )}
                </View>
              )}

              {/* Close */}
              <AnimatedPressable
                onPress={onClose}
                className="items-center justify-center bg-sand-100 rounded-xl py-3"
              >
                <Text className="text-sm font-semibold text-sand-600">Close</Text>
              </AnimatedPressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  )
}

// ─── Shared form primitives ───────────────────────────────────────

function Label({ text }: { text: string }) {
  return (
    <Text className="text-xs font-semibold text-sand-500 uppercase mb-1.5">{text}</Text>
  )
}

function Input({
  value,
  onChangeText,
  placeholder,
  colors,
}: {
  value: string
  onChangeText: (t: string) => void
  placeholder: string
  colors: any
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.sand[300]}
      className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-4"
    />
  )
}
