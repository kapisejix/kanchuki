import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import {
  ChevronLeft,
  Share2,
  Plus,
  Trash2,
  Sparkles,
  Eye,
  Hash,
  MessageSquare,
  Image as ImageIcon,
  RefreshCw,
  ExternalLink,
  Clipboard,
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
  type SocialTemplate,
  type SocialTemplateType,
  type SocialTemplateCreatePayload,
} from '../../src/lib/api/growth'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

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
  const { primaryColor, colors } = useTheme()
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
            <Text className="text-base font-bold text-sand-900">Social Templates</Text>
          </View>
          <AnimatedPressable
            onPress={() => setCreating(true)}
            accessibilityLabel="New template"
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
      ) : templates.length === 0 && !creating ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View className="items-center">
            <View
              className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <Share2 size={28} color={primaryColor} />
            </View>
            <Text className="text-base font-bold text-sand-900">No templates yet</Text>
            <Text className="text-xs text-sand-500 text-center mt-1.5 leading-4 max-w-[260px]">
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
              <StatChip icon={Sparkles} label={`${stats.total} templates`} color={primaryColor} />
              <StatChip icon={Share2} label={`${stats.total_usage} shares`} color={colors.sand[500]} />
            </View>
          )}

          {/* Filter chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 -mx-1">
            <View className="flex-row gap-2 px-1">
              <FilterChip
                label="All"
                active={!filterType}
                onPress={() => setFilterType(undefined)}
                primaryColor={primaryColor}
                colors={colors}
              />
              {(['INSTAGRAM_POST', 'WHATSAPP_STATUS', 'FACEBOOK_POST', 'INSTAGRAM_STORY'] as const).map(
                (t) => (
                  <FilterChip
                    key={t}
                    label={TYPE_LABELS[t]}
                    active={filterType === t}
                    onPress={() => setFilterType(filterType === t ? undefined : t)}
                    primaryColor={primaryColor}
                    colors={colors}
                  />
                ),
              )}
            </View>
          </ScrollView>

          {/* Template grid */}
          <View className="gap-2.5">
            {templates.map((t) => (
              <AnimatedPressable
                key={t.id}
                onPress={() => setDetail(t)}
                accessibilityRole="button"
                accessibilityLabel={`View ${t.name}`}
                className="bg-white rounded-2xl border border-sand-100 overflow-hidden"
              >
                {/* Image preview */}
                {t.image_url ? (
                  <Image
                    source={{ uri: t.image_url }}
                    className="w-full h-40"
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View
                    className="w-full h-24 items-center justify-center"
                    style={{ backgroundColor: `${primaryColor}0D` }}
                  >
                    <ImageIcon size={24} color={colors.sand[300]} />
                    <Text className="text-[10px] text-sand-400 mt-1">No image yet</Text>
                  </View>
                )}

                <View className="p-3">
                  <View className="flex-row items-center justify-between mb-1">
                    <View className="flex-row items-center gap-2 flex-1 mr-2">
                      <Text className="text-base">{TYPE_EMOJI[t.template_type]}</Text>
                      <Text className="text-sm font-bold text-sand-900" numberOfLines={1}>
                        {t.name}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      {t.occasion && (
                        <View className="bg-turmeric-50 rounded-full px-2 py-0.5">
                          <Text className="text-[10px] font-semibold text-turmeric-600">
                            {t.occasion}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2 mt-1">
                    <Text className="text-[10px] text-sand-400">
                      {TYPE_LABELS[t.template_type]}
                    </Text>
                    <Text className="text-[10px] text-sand-300">·</Text>
                    <Text className="text-[10px] text-sand-400">
                      {t.usage_count} {t.usage_count === 1 ? 'share' : 'shares'}
                    </Text>
                    {t.image_url && (
                      <>
                        <Text className="text-[10px] text-sand-300">·</Text>
                        <View className="flex-row items-center gap-0.5">
                          <Eye size={10} color={colors.sand[400]} />
                          <Text className="text-[10px] text-green-600">Ready</Text>
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
                      <Trash2 size={14} color={colors.rust?.[500] ?? '#DC2626'} />
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

// ─── Create Template Modal ────────────────────────────────────────

function CreateTemplateModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()

  const [name, setName] = useState('')
  const [templateType, setTemplateType] = useState<SocialTemplateType>('INSTAGRAM_POST')
  const [occasion, setOccasion] = useState('')
  const [studioTemplate, setStudioTemplate] = useState('gold_festive')
  const [productId, setProductId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canSubmit = name.trim() && productId.trim() && !saving

  const submit = async () => {
    if (!canSubmit) return
    setSaving(true)
    setError('')
    try {
      await growthApi.createSocialTemplate({
        name: name.trim(),
        template_type: templateType,
        occasion: occasion || undefined,
        product_id: productId.trim(),
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
      <View className="bg-white rounded-t-3xl w-full px-5 pt-6 pb-8 max-h-[85%]">
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text className="text-base font-bold text-sand-900 mb-4">New Social Template</Text>

          {/* Name */}
          <Label text="Template Name" />
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Diwali Saree Post, Wedding Collection…"
            colors={colors}
          />

          {/* Type */}
          <Label text="Template Type" />
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
            ).map((t) => (
              <AnimatedPressable
                key={t}
                onPress={() => setTemplateType(t)}
                className="flex-row items-center gap-1 rounded-full px-3 py-1.5 border"
                style={{
                  backgroundColor: templateType === t ? `${primaryColor}1A` : colors.sand[50],
                  borderColor: templateType === t ? primaryColor : colors.sand[200],
                }}
              >
                <Text className="text-xs">{TYPE_EMOJI[t]}</Text>
                <Text
                  className="text-[11px] font-semibold"
                  style={{ color: templateType === t ? primaryColor : colors.sand[500] }}
                >
                  {TYPE_LABELS[t]}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          {/* Occasion */}
          <Label text="Occasion (optional)" />
          <View className="flex-row flex-wrap gap-2 mb-4">
            {OCCASIONS.map((o) => (
              <AnimatedPressable
                key={o}
                onPress={() => setOccasion(occasion === o ? '' : o)}
                className="rounded-full px-3 py-1.5 border"
                style={{
                  backgroundColor: occasion === o ? `${primaryColor}1A` : colors.sand[50],
                  borderColor: occasion === o ? primaryColor : colors.sand[200],
                }}
              >
                <Text
                  className="text-[11px] font-semibold"
                  style={{ color: occasion === o ? primaryColor : colors.sand[500] }}
                >
                  {o}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          {/* Studio Template */}
          <Label text="Background Style" />
          <View className="flex-row flex-wrap gap-2 mb-4">
            {STUDIO_TEMPLATES.map((st) => (
              <AnimatedPressable
                key={st.id}
                onPress={() => setStudioTemplate(st.id)}
                className="flex-row items-center gap-1 rounded-full px-3 py-1.5 border"
                style={{
                  backgroundColor: studioTemplate === st.id ? `${primaryColor}1A` : colors.sand[50],
                  borderColor: studioTemplate === st.id ? primaryColor : colors.sand[200],
                }}
              >
                <Text className="text-xs">{st.emoji}</Text>
                <Text
                  className="text-[11px] font-semibold"
                  style={{ color: studioTemplate === st.id ? primaryColor : colors.sand[500] }}
                >
                  {st.label}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          {/* Product ID */}
          <Label text="Product ID" />
          <Input
            value={productId}
            onChangeText={setProductId}
            placeholder="Paste product ID from your catalog"
            colors={colors}
          />
          <Text className="text-[10px] text-sand-400 mb-4 -mt-2 px-1">
            Find it on your product detail screen → Copy ID
          </Text>

          {error ? (
            <View className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 mb-4">
              <Text className="text-xs text-red-600">{error}</Text>
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
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

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
      <View className="bg-white rounded-t-3xl w-full max-h-[90%]">
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Image */}
          {template.image_url ? (
            <Image
              source={{ uri: template.image_url }}
              className="w-full h-56 rounded-t-3xl"
              contentFit="cover"
            />
          ) : (
            <View
              className="w-full h-40 rounded-t-3xl items-center justify-center"
              style={{ backgroundColor: `${primaryColor}0D` }}
            >
              <ImageIcon size={32} color={colors.sand[300]} />
              <Text className="text-xs text-sand-400 mt-2">No image generated yet</Text>
            </View>
          )}

          <View className="px-5 pt-4 pb-8">
            {/* Title */}
            <View className="flex-row items-center gap-2 mb-1">
              <Text className="text-base">{TYPE_EMOJI[template.template_type]}</Text>
              <Text className="text-base font-bold text-sand-900 flex-1">{template.name}</Text>
            </View>
            <View className="flex-row items-center gap-2 mb-3">
              <Text className="text-xs text-sand-400">{TYPE_LABELS[template.template_type]}</Text>
              {template.occasion && (
                <>
                  <Text className="text-xs text-sand-300">·</Text>
                  <View className="bg-turmeric-50 rounded-full px-2 py-0.5">
                    <Text className="text-[10px] font-semibold text-turmeric-600">
                      {template.occasion}
                    </Text>
                  </View>
                </>
              )}
              <Text className="text-xs text-sand-300">·</Text>
              <Text className="text-xs text-sand-400">
                {template.usage_count} {template.usage_count === 1 ? 'share' : 'shares'}
              </Text>
            </View>

            {/* Generate button */}
            {!template.image_url && (
              <View className="mb-4">
                <GradientButton
                  label={generating ? 'Generating…' : '✨ Generate Image'}
                  onPress={() => {
                    setGenerating(true)
                    void generateMutation.mutate()
                  }}
                  disabled={generating}
                />
                {generateStatus === 'processing' && (
                  <View className="flex-row items-center gap-2 mt-2 justify-center">
                    <ActivityIndicator size="small" color={primaryColor} />
                    <Text className="text-xs text-sand-500">AI is generating your image…</Text>
                  </View>
                )}
                {generateStatus === 'failed' && (
                  <Text className="text-xs text-red-500 text-center mt-2">
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
                    <MessageSquare size={14} color={colors.sand[500]} />
                    <Text className="text-xs font-semibold text-sand-600">Caption & Hashtags</Text>
                  </View>
                  <AnimatedPressable
                    onPress={() => setEditingCaption(!editingCaption)}
                    hitSlop={8}
                  >
                    <Text className="text-xs font-semibold" style={{ color: primaryColor }}>
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
                      placeholderTextColor={colors.sand[300]}
                      className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900 mb-2 min-h-[80px]"
                      textAlignVertical="top"
                    />
                    <TextInput
                      value={hashtags}
                      onChangeText={setHashtags}
                      placeholder="#diwali #saree #festive"
                      placeholderTextColor={colors.sand[300]}
                      className="border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900"
                    />
                    <View className="mt-2">
                      <GradientButton
                        label="Save"
                        onPress={() => void updateMutation.mutate()}
                        disabled={updateMutation.isPending}
                      />
                    </View>
                  </>
                ) : (
                  <View className="bg-sand-50 rounded-xl p-3">
                    <Text className="text-sm text-sand-700 leading-5">
                      {template.caption || 'No caption yet'}
                    </Text>
                    {template.hashtags.length > 0 && (
                      <View className="flex-row flex-wrap gap-1 mt-2">
                        {template.hashtags.map((h, i) => (
                          <View key={i} className="bg-primary-50 rounded-full px-2 py-0.5">
                            <Text className="text-[10px] font-semibold" style={{ color: primaryColor }}>
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
                    <GradientButton label="📤 Share" onPress={() => void handleShare()} />
                  </View>
                  <View className="flex-1">
                    <AnimatedPressable
                      onPress={() => void handleCopyCaption()}
                      className="items-center justify-center bg-sand-100 rounded-xl py-3.5"
                    >
                      <Text className="text-sm font-semibold text-sand-700">📋 Copy</Text>
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
                  className="items-center justify-center bg-sand-100 rounded-xl py-3"
                >
                  <Text className="text-sm font-semibold text-sand-600">🔄 Regenerate</Text>
                </AnimatedPressable>
              )}
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
