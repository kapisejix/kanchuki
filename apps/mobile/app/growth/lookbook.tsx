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
              Digital Lookbooks
            </Text>
          </View>
          <AnimatedPressable
            onPress={() => setCreating(true)}
            accessibilityLabel="New lookbook"
            accessibilityRole="button"
            className="w-10 h-10 rounded-2xl items-center justify-center bg-fuchsia-600 shadow-sm"
          >
            <Plus size={20} color="white" />
          </AnimatedPressable>
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#BB3F95" />
        </View>
      ) : lookbooks.length === 0 && !creating ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4 bg-lavender-100 border border-lavender-200"
            >
              <BookOpen size={28} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              No Lookbooks Yet
            </Text>
            <Text className="text-xs text-heliotrope-500 text-center mt-1.5 leading-relaxed max-w-[260px] font-medium">
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
            <View className="flex-row gap-2.5 mb-3.5">
              <StatChip icon={BookOpen} label={`${stats.total} lookbooks`} color="#BB3F95" />
              <StatChip icon={Eye} label={`${stats.total_views} views`} color="#231F48" />
              <StatChip icon={Share2} label={`${stats.total_shares} shares`} color="#560A39" />
            </View>
          )}

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4 -mx-1">
            <View className="flex-row gap-2 px-1">
              <FilterChip
                label="All"
                active={!filterStatus}
                onPress={() => setFilterStatus(undefined)}
              />
              {(['READY', 'DRAFT', 'GENERATING', 'FAILED'] as const).map((s) => (
                <FilterChip
                  key={s}
                  label={STATUS_CONFIG[s].label}
                  active={filterStatus === s}
                  onPress={() => setFilterStatus(filterStatus === s ? undefined : s)}
                />
              ))}
            </View>
          </ScrollView>

          {/* Lookbook cards */}
          <View className="gap-3.5">
            {lookbooks.map((lb) => {
              const FormatIcon = FORMAT_ICONS[lb.format]
              const statusConf = STATUS_CONFIG[lb.status]
              return (
                <AnimatedPressable
                  key={lb.id}
                  onPress={() => setDetail(lb)}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${lb.name}`}
                  className="bg-white rounded-3xl border border-lavender-200 overflow-hidden shadow-sm"
                >
                  {/* Cover image */}
                  {lb.cover_url ? (
                    <Image
                      source={{ uri: lb.cover_url }}
                      className="w-full h-40"
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <View
                      className="w-full h-28 items-center justify-center bg-lavender-100"
                    >
                      <BookOpen size={24} color="#928EB2" />
                      <Text className="text-[10px] text-heliotrope-500 mt-1 font-medium">No cover yet</Text>
                    </View>
                  )}

                  <View className="p-4">
                    <View className="flex-row items-center justify-between mb-1.5">
                      <View className="flex-row items-center gap-2 flex-1 mr-2">
                        <FormatIcon size={16} color="#BB3F95" />
                        <Text
                          style={{ fontFamily: 'Marcellus_400Regular' }}
                          className="text-base font-bold text-spaceCadet-900"
                          numberOfLines={1}
                        >
                          {lb.name}
                        </Text>
                      </View>
                      <View
                        className="rounded-full px-2.5 py-0.5"
                        style={{ backgroundColor: statusConf.bg }}
                      >
                        <Text
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: statusConf.color }}
                        >
                          {statusConf.label}
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row items-center gap-2 mt-1.5 pt-2 border-t border-lavender-200">
                      <Text className="text-xs font-semibold text-heliotrope-500">
                        {FORMAT_LABELS[lb.format]}
                      </Text>
                      <Text className="text-xs text-lavender-300">·</Text>
                      <Text className="text-xs font-semibold text-heliotrope-500">
                        {lb.product_ids.length} {lb.product_ids.length === 1 ? 'product' : 'products'}
                      </Text>
                      <Text className="text-xs text-lavender-300">·</Text>
                      <Text className="text-xs font-semibold text-heliotrope-500">
                        {lb.view_count} views
                      </Text>
                      <View className="flex-1" />
                      <AnimatedPressable
                        onPress={() => confirmDelete(lb)}
                        hitSlop={8}
                        accessibilityLabel={`Delete ${lb.name}`}
                        accessibilityRole="button"
                      >
                        <Trash2 size={15} color="#dc2626" />
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
    <View className="flex-row items-center gap-1.5 bg-white rounded-2xl px-3.5 py-2 border border-lavender-200 shadow-sm flex-1 justify-center">
      <Icon size={13} color={color} />
      <Text className="text-xs font-bold text-spaceCadet-900">{label}</Text>
    </View>
  )
}

// ─── Filter Chip ──────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      className={`rounded-full px-4 py-1.5 border ${
        active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'border-lavender-200 bg-lavender-50'
      }`}
    >
      <Text
        className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}
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
      <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8 max-h-[85%] border-t border-lavender-200">
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular' }}
            className="text-xl font-bold text-spaceCadet-900 mb-4"
          >
            New Lookbook
          </Text>

          {/* Name */}
          <Label text="Lookbook Name" />
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Diwali Collection 2026, Wedding Essentials…"
          />

          {/* Description */}
          <Label text="Description (optional)" />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="A short description of this collection…"
            placeholderTextColor="#928EB2"
            className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4 min-h-[70px]"
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
                className={`flex-1 items-center py-3 rounded-2xl border ${
                  format === f.value ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
                }`}
              >
                <Text className="text-base mb-0.5">{f.emoji}</Text>
                <Text
                  className={`text-[10px] font-bold ${
                    format === f.value ? 'text-white' : 'text-spaceCadet-900'
                  }`}
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
            placeholderTextColor="#928EB2"
            className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-1 min-h-[85px]"
            multiline
            textAlignVertical="top"
          />
          <Text className="text-[11px] text-heliotrope-500 font-medium mb-4 px-1">
            {parsedIds.length} product{parsedIds.length !== 1 ? 's' : ''} detected
            {parsedIds.length > 20 ? ' (max 20)' : ''}
          </Text>

          {error ? (
            <View className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
              <Text className="text-xs text-red-600 font-bold">{error}</Text>
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
              className="flex-1 items-center justify-center bg-lavender-100 rounded-2xl py-3 border border-lavender-200"
            >
              <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">Cancel</Text>
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
      <View className="bg-white rounded-t-3xl w-full max-h-[90%] border-t border-lavender-200">
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
              className="w-full h-40 rounded-t-3xl items-center justify-center bg-lavender-100"
            >
              <BookOpen size={32} color="#928EB2" />
              <Text className="text-xs text-heliotrope-500 mt-2 font-medium">No cover image</Text>
            </View>
          )}

          <View className="px-5 pt-5 pb-8">
            {/* Title */}
            <View className="flex-row items-center gap-2 mb-1.5">
              <FormatIcon size={18} color="#BB3F95" />
              <Text
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-lg font-bold text-spaceCadet-900 flex-1"
              >
                {lookbook.name}
              </Text>
            </View>

            <View className="flex-row items-center gap-2 mb-3">
              <Text className="text-xs text-heliotrope-500 font-semibold">{FORMAT_LABELS[lookbook.format]}</Text>
              <Text className="text-xs text-lavender-300">·</Text>
              <View
                className="rounded-full px-2.5 py-0.5"
                style={{ backgroundColor: statusConf.bg }}
              >
                <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: statusConf.color }}>
                  {statusConf.label}
                </Text>
              </View>
              <Text className="text-xs text-lavender-300">·</Text>
              <Text className="text-xs text-heliotrope-500 font-semibold">
                {lookbook.product_ids.length} products
              </Text>
            </View>

            {lookbook.description && (
              <Text className="text-xs text-heliotrope-500 mb-3.5 leading-relaxed font-medium">{lookbook.description}</Text>
            )}

            {/* Stats */}
            <View className="flex-row gap-4 mb-4 pt-3 border-t border-lavender-200">
              <View className="flex-row items-center gap-1.5">
                <Eye size={14} color="#BB3F95" />
                <Text className="text-xs font-bold text-spaceCadet-900">{lookbook.view_count} views</Text>
              </View>
              <View className="flex-row items-center gap-1.5">
                <Share2 size={14} color="#BB3F95" />
                <Text className="text-xs font-bold text-spaceCadet-900">{lookbook.share_count} shares</Text>
              </View>
            </View>

            {/* Action buttons */}
            <View className="gap-2.5 mt-2">
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
                <View className="flex-row items-center gap-2 bg-fuchsia-50 rounded-2xl px-4 py-3 border border-fuchsia-200">
                  <ActivityIndicator size="small" color="#BB3F95" />
                  <Text className="text-xs text-fuchsia-800 font-bold">
                    Generating your lookbook…
                  </Text>
                </View>
              )}

              {/* Share */}
              {lookbook.status === 'READY' && (
                <View className="flex-row gap-2.5">
                  <View className="flex-1">
                    <GradientButton
                      label="📤 Share Lookbook"
                      onPress={() => void handleShare()}
                      disabled={shareMutation.isPending}
                    />
                  </View>
                </View>
              )}

              {/* Close */}
              <AnimatedPressable
                onPress={onClose}
                className="items-center justify-center bg-lavender-100 rounded-2xl py-3 border border-lavender-200"
              >
                <Text className="text-xs font-bold text-spaceCadet-900 uppercase tracking-wider">Close</Text>
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
    <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">{text}</Text>
  )
}

function Input({
  value,
  onChangeText,
  placeholder,
}: {
  value: string
  onChangeText: (t: string) => void
  placeholder: string
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#928EB2"
      className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
    />
  )
}
