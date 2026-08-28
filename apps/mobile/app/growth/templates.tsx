import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Share2,
  Plus,
  Trash2,
  Sparkles,
  Eye,
  MessageSquare,
  Image as ImageIcon,
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
import { productApi } from '../../src/lib/api'
import {
  growthApi,
  type SocialTemplate,
  type SocialTemplateType,
} from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'

// ─── Helpers ──────────────────────────────────────────────────────

const TYPE_LABELS: Record<SocialTemplateType, string> = {
  INSTAGRAM_POST: 'Instagram Post',
  INSTAGRAM_REEL: 'Instagram Reel',
  INSTAGRAM_STORY: 'Instagram Story',
  WHATSAPP_STATUS: 'WhatsApp Status',
  WHATSAPP_CATALOG: 'WhatsApp Catalog',
  FACEBOOK_POST: 'Facebook Post',
  FACEBOOK_STORY: 'Facebook Story',
  PDF_FLYER: 'PDF Flyer',
}

const TYPE_EMOJI: Record<SocialTemplateType, string> = {
  INSTAGRAM_POST: '📸',
  INSTAGRAM_REEL: '🎬',
  INSTAGRAM_STORY: '📖',
  WHATSAPP_STATUS: '💬',
  WHATSAPP_CATALOG: '🛒',
  FACEBOOK_POST: '👥',
  FACEBOOK_STORY: '📖',
  PDF_FLYER: '📄',
}

const STUDIO_TEMPLATES = [
  { id: 'white_studio', label: 'White Studio', emoji: '⬜' },
  { id: 'warm_luxury', label: 'Warm Luxury', emoji: '🤎' },
  { id: 'gold_festive', label: 'Gold Festive', emoji: '✨' },
  { id: 'diwali_lights', label: 'Diwali Lights', emoji: '🪔' },
  { id: 'wedding_elegant', label: 'Wedding Elegant', emoji: '💒' },
  { id: 'flat_lay', label: 'Flat-Lay', emoji: '📏' },
] as const

const OCCASIONS = [
  'Diwali',
  'Navratri',
  'Eid',
  'Wedding',
  'Raksha Bandhan',
  'Holi',
  'Christmas',
  'New Year',
  'General',
] as const

// ─── Main Screen ──────────────────────────────────────────────────

export default function TemplatesScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [detail, setDetail] = useState<SocialTemplate | null>(null)
  const [filterType, setFilterType] = useState<SocialTemplateType | undefined>()

  const { data: templatesData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['growth', 'social-templates', filterType],
    queryFn: () => growthApi.socialTemplates(filterType ? { template_type: filterType } : undefined),
  })
  const templates = templatesData?.data ?? []

  const { data: statsData } = useQuery({
    queryKey: ['growth', 'social-templates', 'stats'],
    queryFn: () => growthApi.socialTemplateStats(),
  })
  const stats = statsData?.data

  const remove = useMutation({
    mutationFn: (id: string) => growthApi.deleteSocialTemplate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'social-templates'] })
      setDetail(null)
    },
    onError: (err) => showError(err, 'Failed to delete template'),
  })

  const confirmDelete = (t: SocialTemplate) => {
    Alert.alert('Delete template?', `"${t.name}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(t.id) },
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
              Social Templates
            </Text>
          </View>
          <AnimatedPressable
            onPress={() => setCreating(true)}
            accessibilityLabel="New template"
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
      ) : templates.length === 0 && !creating ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4 bg-lavender-100 border border-lavender-200"
            >
              <Share2 size={28} color="#BB3F95" />
            </View>
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-xl font-bold text-spaceCadet-900"
            >
              No templates yet
            </Text>
            <Text className="text-xs text-heliotrope-500 text-center mt-1.5 leading-relaxed max-w-[260px] font-medium">
              Create AI-powered social media templates — pick a product, choose a festive background,
              and get a ready-to-share image with caption & hashtags.
            </Text>
            <View className="w-48 mt-5">
              <GradientButton label="Create Template" onPress={() => setCreating(true)} />
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
              <StatChip icon={Sparkles} label={`${stats.total} templates`} color="#BB3F95" />
              <StatChip icon={Share2} label={`${stats.total_usage} shares`} color="#6B4773" />
            </View>
          )}

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3.5 -mx-1">
            <View className="flex-row gap-2 px-1">
              <FilterChip
                label="All"
                active={!filterType}
                onPress={() => setFilterType(undefined)}
              />
              {(['INSTAGRAM_POST', 'WHATSAPP_STATUS', 'FACEBOOK_POST', 'INSTAGRAM_STORY'] as const).map(
                (t) => (
                  <FilterChip
                    key={t}
                    label={TYPE_LABELS[t]}
                    active={filterType === t}
                    onPress={() => setFilterType(filterType === t ? undefined : t)}
                  />
                ),
              )}
            </View>
          </ScrollView>

          {/* Template grid */}
          <View className="gap-3">
            {templates.map((t) => (
              <AnimatedPressable
                key={t.id}
                onPress={() => setDetail(t)}
                accessibilityRole="button"
                accessibilityLabel={`View ${t.name}`}
                className="bg-white rounded-3xl border border-lavender-200 overflow-hidden shadow-sm"
              >
                {/* Image preview */}
                {t.image_url ? (
                  <Image
                    source={{ uri: t.image_url }}
                    className="w-full h-44"
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View
                    className="w-full h-28 items-center justify-center bg-lavender-50 border-b border-lavender-100"
                  >
                    <ImageIcon size={26} color="#BB3F95" />
                    <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider mt-1">No image generated</Text>
                  </View>
                )}

                <View className="p-4">
                  <View className="flex-row items-center justify-between mb-1.5">
                    <View className="flex-row items-center gap-2 flex-1 mr-2">
                      <Text className="text-base">{TYPE_EMOJI[t.template_type]}</Text>
                      <Text
                        style={{ fontFamily: 'Marcellus_400Regular' }}
                        className="text-base font-bold text-spaceCadet-900"
                        numberOfLines={1}
                      >
                        {t.name}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      {t.occasion && (
                        <View className="bg-fuchsia-500/10 rounded-full px-2.5 py-0.5 border border-fuchsia-500/20">
                          <Text className="text-[10px] font-bold text-fuchsia-700">
                            {t.occasion}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2 mt-2 pt-2 border-t border-lavender-100">
                    <Text className="text-xs text-heliotrope-500 font-medium">
                      {TYPE_LABELS[t.template_type]}
                    </Text>
                    <Text className="text-xs text-lavender-300">·</Text>
                    <Text className="text-xs text-heliotrope-500 font-medium">
                      {t.usage_count} {t.usage_count === 1 ? 'share' : 'shares'}
                    </Text>
                    {t.image_url && (
                      <>
                        <Text className="text-xs text-lavender-300">·</Text>
                        <View className="flex-row items-center gap-1">
                          <Eye size={11} color="#16a34a" />
                          <Text className="text-xs font-bold text-emerald-700">Ready</Text>
                        </View>
                      </>
                    )}
                    <View className="flex-1" />
                    <AnimatedPressable
                      onPress={() => confirmDelete(t)}
                      hitSlop={8}
                      accessibilityLabel={`Delete ${t.name}`}
                      accessibilityRole="button"
                    >
                      <Trash2 size={16} color="#dc2626" />
                    </AnimatedPressable>
                  </View>
                </View>
              </AnimatedPressable>
            ))}
          </View>

          <View className="mt-5">
            <GradientButton label="+ New Template" onPress={() => setCreating(true)} />
          </View>
        </ScrollView>
      )}

      {/* Create form modal */}
      {creating && (
        <CreateTemplateModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            void queryClient.invalidateQueries({ queryKey: ['growth', 'social-templates'] })
          }}
        />
      )}

      {/* Detail modal */}
      {detail && (
        <TemplateDetailModal
          template={detail}
          onClose={() => setDetail(null)}
          onRefresh={() => {
            void queryClient.invalidateQueries({ queryKey: ['growth', 'social-templates'] })
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
  icon: typeof Sparkles
  label: string
  color: string
}) {
  return (
    <View className="flex-1 flex-row items-center justify-center gap-1.5 bg-white rounded-2xl px-3 py-2.5 border border-lavender-200 shadow-sm">
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
        active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
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

// ─── Create Template Modal ────────────────────────────────────────

function CreateTemplateModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const insets = useSafeAreaInsets()

  const [name, setName] = useState('')
  const [templateType, setTemplateType] = useState<SocialTemplateType>('INSTAGRAM_POST')
  const [occasion, setOccasion] = useState('')
  const [studioTemplate, setStudioTemplate] = useState('gold_festive')
  const [pickedProducts, setPickedProducts] = useState<{ id: string; name: string | null; primary_photo_url: string | null }[]>([])
  const [productPickerOpen, setProductPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = name.trim() && pickedProducts.length > 0 && !saving

  const productsQuery = useQuery({
    queryKey: ['products', 'list', 'social-template-picker'],
    queryFn: () => productApi.list({ status: 'AVAILABLE', limit: 50 }),
    enabled: productPickerOpen,
  })
  const pickerProducts = (productsQuery.data?.data ?? []) as {
    id: string
    name: string | null
    primary_photo_url: string | null
  }[]

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      await growthApi.createSocialTemplate({
        name: name.trim(),
        template_type: templateType,
        occasion: occasion || undefined,
        product_ids: pickedProducts.map((p) => p.id),
        studio_template: studioTemplate,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template')
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
            New Social Template
          </Text>

          {/* Name */}
          <Label text="Template Title" />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Diwali Saree Post, Wedding Collection…"
            placeholderTextColor="#928EB2"
            className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4"
          />

          {/* Type */}
          <Label text="Template Platform Format" />
          <View className="flex-row flex-wrap gap-2 mb-4">
            {(
              [
                'INSTAGRAM_POST',
                'WHATSAPP_STATUS',
                'FACEBOOK_POST',
                'INSTAGRAM_STORY',
                'WHATSAPP_CATALOG',
                'PDF_FLYER',
              ] as const
            ).map((t) => {
              const active = templateType === t
              return (
                <AnimatedPressable
                  key={t}
                  onPress={() => setTemplateType(t)}
                  className={`flex-row items-center gap-1 rounded-full px-3.5 py-2 border ${
                    active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
                  }`}
                >
                  <Text className="text-xs">{TYPE_EMOJI[t]}</Text>
                  <Text
                    className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}
                  >
                    {TYPE_LABELS[t]}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>

          {/* Occasion */}
          <Label text="Festive / Occasion (Optional)" />
          <View className="flex-row flex-wrap gap-2 mb-4">
            {OCCASIONS.map((o) => {
              const active = occasion === o
              return (
                <AnimatedPressable
                  key={o}
                  onPress={() => setOccasion(occasion === o ? '' : o)}
                  className={`rounded-full px-3.5 py-1.5 border ${
                    active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}
                  >
                    {o}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>

          {/* Studio Template */}
          <Label text="AI Photoshoot Style" />
          <View className="flex-row flex-wrap gap-2 mb-4">
            {STUDIO_TEMPLATES.map((st) => {
              const active = studioTemplate === st.id
              return (
                <AnimatedPressable
                  key={st.id}
                  onPress={() => setStudioTemplate(st.id)}
                  className={`flex-row items-center gap-1.5 rounded-full px-3.5 py-2 border ${
                    active ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm' : 'bg-lavender-50 border-lavender-200'
                  }`}
                >
                  <Text className="text-xs">{st.emoji}</Text>
                  <Text
                    className={`text-xs font-bold ${active ? 'text-white' : 'text-spaceCadet-900'}`}
                  >
                    {st.label}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>

          {/* Products */}
          <Label text="Featured Designs" />
          <AnimatedPressable
            onPress={() => setProductPickerOpen(true)}
            className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 mb-4"
          >
            {pickedProducts.length > 0 ? (
              <View className="flex-row" style={{ marginLeft: 4 }}>
                {pickedProducts.slice(0, 3).map((p, i) => (
                  <View key={p.id} style={{ marginLeft: -6, zIndex: 3 - i }}>
                    {p.primary_photo_url ? (
                      <Image
                        source={{ uri: p.primary_photo_url }}
                        style={{ width: 34, height: 34, borderRadius: 10, borderWidth: 2, borderColor: 'white' }}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        className="w-8 h-8 rounded-xl items-center justify-center bg-lavender-100"
                        style={{ borderWidth: 2, borderColor: 'white' }}
                      >
                        <ImageIcon size={16} color="#BB3F95" />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <View className="w-8 h-8 rounded-xl items-center justify-center bg-lavender-100">
                <ImageIcon size={16} color="#BB3F95" />
              </View>
            )}
            <Text
              className={`flex-1 ml-3 text-sm ${pickedProducts.length > 0 ? 'text-spaceCadet-900 font-bold' : 'text-heliotrope-400 font-medium'}`}
              numberOfLines={1}
            >
              {pickedProducts.length === 0
                ? 'Select designs from inventory'
                : pickedProducts.length === 1
                  ? pickedProducts[0].name ?? 'Selected design'
                  : `${pickedProducts.length} designs selected`}
            </Text>
            <ChevronRight size={16} color="#928EB2" />
          </AnimatedPressable>

          {error ? (
            <View className="bg-rose-50 border border-rose-200 rounded-2xl px-3.5 py-2.5 mb-4">
              <Text className="text-xs text-rose-600 font-semibold">{error}</Text>
            </View>
          ) : null}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <GradientButton
                label={saving ? 'Creating…' : 'Create Template'}
                onPress={() => void submit()}
                disabled={!canSubmit}
              />
            </View>
            <AnimatedPressable
              onPress={onClose}
              className="flex-1 items-center justify-center bg-lavender-100 rounded-2xl py-3 border border-lavender-200"
            >
              <Text className="text-sm font-bold text-spaceCadet-900">Cancel</Text>
            </AnimatedPressable>
          </View>
        </ScrollView>
      </View>

      {/* Product picker — in-tree overlay. A React Native <Modal> renders
          outside the expo-router navigation context, which crashes on
          interaction ("Couldn't find a Navigation context"). */}
      {productPickerOpen && (
        <View
          className="absolute inset-0 bg-[#F8F7FC]"
          style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
        >
          <View className="flex-row items-center justify-between px-5 pb-4 bg-white border-b border-lavender-200">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular' }}
              className="text-lg font-bold text-spaceCadet-900"
            >
              Select Designs{pickedProducts.length > 0 ? ` (${pickedProducts.length})` : ''}
            </Text>
            <AnimatedPressable
              onPress={() => setProductPickerOpen(false)}
              hitSlop={8}
              accessibilityLabel="Done"
              accessibilityRole="button"
            >
              <Text className="text-sm font-bold text-fuchsia-700">Done</Text>
            </AnimatedPressable>
          </View>
          <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
            {productsQuery.isLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator color="#BB3F95" />
              </View>
            ) : pickerProducts.length === 0 ? (
              <Text className="text-sm text-heliotrope-500 text-center py-10 font-medium">
                No available products. Add products first.
              </Text>
            ) : (
              <View className="gap-2.5">
                {pickerProducts.map((p) => {
                  const selected = pickedProducts.some((x) => x.id === p.id)
                  return (
                    <AnimatedPressable
                      key={p.id}
                      onPress={() => {
                        setPickedProducts((prev) =>
                          selected ? prev.filter((x) => x.id !== p.id) : [...prev, p],
                        )
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className={`flex-row items-center bg-white rounded-2xl p-3 border ${
                        selected ? 'border-fuchsia-600 shadow-sm' : 'border-lavender-200'
                      }`}
                    >
                      {p.primary_photo_url ? (
                        <Image
                          source={{ uri: p.primary_photo_url }}
                          style={{ width: 44, height: 44, borderRadius: 10 }}
                          contentFit="cover"
                        />
                      ) : (
                        <View className="w-11 h-11 rounded-xl items-center justify-center bg-lavender-100">
                          <ImageIcon size={18} color="#BB3F95" />
                        </View>
                      )}
                      <Text className="flex-1 ml-3 text-sm font-bold text-spaceCadet-900" numberOfLines={1}>
                        {p.name ?? 'Unnamed design'}
                      </Text>
                      <View
                        className={`w-6 h-6 rounded-full items-center justify-center border ${
                          selected ? 'bg-fuchsia-600 border-fuchsia-600' : 'border-lavender-300'
                        }`}
                      >
                        {selected && <Check size={12} color="white" />}
                      </View>
                    </AnimatedPressable>
                  )
                })}
              </View>
            )}
          </ScrollView>
        </View>
      )}
    </View>
  )
}

// ─── Template Detail Modal ────────────────────────────────────────

function TemplateDetailModal({
  template,
  onClose,
  onRefresh,
}: {
  template: SocialTemplate
  onClose: () => void
  onRefresh: () => void
}) {
  const insets = useSafeAreaInsets()

  const [editingCaption, setEditingCaption] = useState(false)
  const [caption, setCaption] = useState(template.caption ?? '')
  const [hashtags, setHashtags] = useState(template.hashtags.join(' '))
  const [generating, setGenerating] = useState(false)
  const [generateStatus, setGenerateStatus] = useState<string | null>(null)

  const updateMutation = useMutation({
    mutationFn: () =>
      growthApi.updateSocialTemplate(template.id, {
        caption: caption || undefined,
        hashtags: hashtags
          .split(/\s+/)
          .filter((h) => h.startsWith('#'))
          .map((h) => (h.startsWith('#') ? h : `#${h}`)),
      }),
    onSuccess: () => {
      setEditingCaption(false)
      onRefresh()
    },
    onError: (err) => showError(err, 'Failed to update'),
  })

  const generateMutation = useMutation({
    mutationFn: () => growthApi.generateSocialTemplate(template.id),
    onSuccess: async (res) => {
      const jobId = res.data.job_id
      setGenerateStatus('processing')
      // Poll for completion
      const poll = async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 2000))
          try {
            const status = await growthApi.socialTemplateGenerateStatus(template.id, jobId)
            if (status.data.status === 'ready') {
              setGenerateStatus('ready')
              setGenerating(false)
              onRefresh()
              return
            }
            if (status.data.status === 'failed') {
              setGenerateStatus('failed')
              setGenerating(false)
              return
            }
          } catch {
            // keep polling
          }
        }
        setGenerateStatus('timeout')
        setGenerating(false)
      }
      void poll()
    },
    onError: (err) => {
      showError(err, 'Generation failed')
      setGenerating(false)
    },
  })

  const useMutationHook = useMutation({
    mutationFn: () => growthApi.useSocialTemplate(template.id),
    onSuccess: () => onRefresh(),
  })

  const handleShare = async () => {
    if (!template.image_url) return
    try {
      await Share.share({
        message: `${template.name}\n\n${template.caption ?? ''}\n\n${template.hashtags.join(' ')}`,
        url: template.image_url,
      })
      void useMutationHook.mutate()
    } catch {
      // user cancelled
    }
  }

  const handleCopyCaption = async () => {
    try {
      const { Clipboard } = await import('react-native')
      Clipboard.setString(`${template.caption ?? ''}\n\n${template.hashtags.join(' ')}`)
      Alert.alert('Copied', 'Caption & hashtags copied to clipboard')
    } catch {
      // fallback
    }
  }

  return (
    <View
      className="absolute inset-0 bg-black/60 items-center justify-end"
      style={{ paddingBottom: insets.bottom }}
    >
      <View className="bg-white rounded-t-3xl w-full max-h-[90%] border-t border-lavender-200">
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Image */}
          {template.image_url ? (
            <Image
              source={{ uri: template.image_url }}
              className="w-full h-60 rounded-t-3xl"
              contentFit="cover"
            />
          ) : (
            <View
              className="w-full h-44 rounded-t-3xl items-center justify-center bg-lavender-50"
            >
              <ImageIcon size={34} color="#BB3F95" />
              <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mt-2">No image generated yet</Text>
            </View>
          )}

          <View className="px-5 pt-4 pb-8">
            {/* Title */}
            <View className="flex-row items-center gap-2 mb-1">
              <Text className="text-base">{TYPE_EMOJI[template.template_type]}</Text>
              <Text
                style={{ fontFamily: 'Marcellus_400Regular' }}
                className="text-lg font-bold text-spaceCadet-900 flex-1"
              >
                {template.name}
              </Text>
            </View>
            <View className="flex-row items-center gap-2 mb-3.5">
              <Text className="text-xs text-heliotrope-500 font-medium">{TYPE_LABELS[template.template_type]}</Text>
              {template.occasion && (
                <>
                  <Text className="text-xs text-lavender-300">·</Text>
                  <View className="bg-fuchsia-500/10 rounded-full px-2.5 py-0.5 border border-fuchsia-500/20">
                    <Text className="text-[10px] font-bold text-fuchsia-700">
                      {template.occasion}
                    </Text>
                  </View>
                </>
              )}
              <Text className="text-xs text-lavender-300">·</Text>
              <Text className="text-xs text-heliotrope-500 font-medium">
                {template.usage_count} {template.usage_count === 1 ? 'share' : 'shares'}
              </Text>
            </View>

            {/* Generate button */}
            {!template.image_url && (
              <View className="mb-4">
                <GradientButton
                  label={generating ? 'Generating…' : '✨ Generate AI Design Photo'}
                  onPress={() => {
                    setGenerating(true)
                    void generateMutation.mutate()
                  }}
                  disabled={generating}
                />
                {generateStatus === 'processing' && (
                  <View className="flex-row items-center gap-2 mt-2.5 justify-center">
                    <ActivityIndicator size="small" color="#BB3F95" />
                    <Text className="text-xs text-heliotrope-500 font-medium">AI is rendering the luxury background…</Text>
                  </View>
                )}
                {generateStatus === 'failed' && (
                  <Text className="text-xs text-red-600 font-semibold text-center mt-2.5">
                    Generation failed. Check your product photo and try again.
                  </Text>
                )}
              </View>
            )}

            {/* Caption section */}
            {template.image_url && (
              <View className="mb-4">
                <View className="flex-row items-center justify-between mb-2">
                  <View className="flex-row items-center gap-1.5">
                    <MessageSquare size={14} color="#BB3F95" />
                    <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider">Caption & Hashtags</Text>
                  </View>
                  <AnimatedPressable
                    onPress={() => setEditingCaption(!editingCaption)}
                    hitSlop={8}
                  >
                    <Text className="text-xs font-bold text-fuchsia-700">
                      {editingCaption ? 'Done' : 'Edit'}
                    </Text>
                  </AnimatedPressable>
                </View>

                {editingCaption ? (
                  <>
                    <TextInput
                      value={caption}
                      onChangeText={setCaption}
                      multiline
                      numberOfLines={4}
                      placeholder="Write your caption…"
                      placeholderTextColor="#928EB2"
                      className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-2 min-h-[85px]"
                      textAlignVertical="top"
                    />
                    <TextInput
                      value={hashtags}
                      onChangeText={setHashtags}
                      placeholder="#diwali #saree #festive"
                      placeholderTextColor="#928EB2"
                      className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900"
                    />
                    <View className="mt-2.5">
                      <GradientButton
                        label="Save Caption"
                        onPress={() => void updateMutation.mutate()}
                        disabled={updateMutation.isPending}
                      />
                    </View>
                  </>
                ) : (
                  <View className="bg-lavender-50 rounded-2xl p-4 border border-lavender-200">
                    <Text className="text-xs text-spaceCadet-900 leading-relaxed font-medium">
                      {template.caption || 'No caption generated'}
                    </Text>
                    {template.hashtags.length > 0 && (
                      <View className="flex-row flex-wrap gap-1.5 mt-2.5">
                        {template.hashtags.map((h, i) => (
                          <View key={i} className="bg-fuchsia-500/10 rounded-full px-2.5 py-0.5 border border-fuchsia-500/20">
                            <Text className="text-[10px] font-bold text-fuchsia-700">
                              {h}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Action buttons */}
            <View className="gap-2.5">
              {template.image_url && (
                <View className="flex-row gap-2.5">
                  <View className="flex-1">
                    <GradientButton label="📤 Share Now" onPress={() => void handleShare()} />
                  </View>
                  <View className="flex-1">
                    <AnimatedPressable
                      onPress={() => void handleCopyCaption()}
                      className="items-center justify-center bg-lavender-100 rounded-2xl py-3.5 border border-lavender-200"
                    >
                      <Text className="text-sm font-bold text-spaceCadet-900">📋 Copy Text</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              )}
              {template.image_url && (
                <AnimatedPressable
                  onPress={() => {
                    setGenerating(true)
                    void generateMutation.mutate()
                  }}
                  disabled={generating}
                  className="items-center justify-center bg-lavender-50 rounded-2xl py-3 border border-lavender-200"
                >
                  <Text className="text-sm font-bold text-fuchsia-700">🔄 Regenerate Photo</Text>
                </AnimatedPressable>
              )}
              <AnimatedPressable
                onPress={onClose}
                className="items-center justify-center bg-lavender-100 rounded-2xl py-3 border border-lavender-200"
              >
                <Text className="text-sm font-bold text-spaceCadet-900">Close</Text>
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
