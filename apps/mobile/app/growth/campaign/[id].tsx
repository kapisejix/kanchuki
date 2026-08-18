import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft,
  ExternalLink,
  Link2,
  Megaphone,
  Pencil,
  Send,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react-native'
import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'
import { GradientButton } from '../../../src/components/GradientButton'
import {
  growthApi,
  type CampaignSendResult,
  type CampaignStatus,
  type CampaignType,
} from '../../../src/lib/api'
import { showError } from '../../../src/lib/errors'
import { useTheme } from '../../../src/lib/theme'

const TYPE_LABEL: Record<CampaignType, { label: string; icon: React.ReactNode }> = {
  FESTIVAL: { label: 'Festival', icon: null },
  REACTIVATION: { label: 'Reactivation', icon: null },
  PROMOTION: { label: 'Promotion', icon: null },
  AB_TEST: { label: 'A/B Test', icon: null },
}

function statusInfo(status: CampaignStatus, colors: ReturnType<typeof useTheme>['colors']) {
  const map: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
    DRAFT: { label: 'Draft', color: colors.sand[600], bg: colors.sand[100] },
    SCHEDULED: { label: 'Scheduled', color: colors.turmeric[600], bg: colors.turmeric[100] },
    SENT: { label: 'Sent', color: colors.turmeric[600], bg: colors.turmeric[100] },
  }
  return map[status]
}

export default function CampaignDetailScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [sendResult, setSendResult] = useState<CampaignSendResult | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['growth', 'campaign', id],
    queryFn: () => growthApi.campaign(id!),
  })
  const campaign = data?.data

  const previewQuery = useQuery({
    queryKey: ['growth', 'campaign', id, 'preview'],
    queryFn: () => growthApi.previewCampaign(id!),
    enabled: !!campaign && campaign.status !== 'SENT',
  })
  const preview = previewQuery.data?.data

  const sendMutation = useMutation({
    mutationFn: () => growthApi.sendCampaign(id!),
    onSuccess: (res) => {
      setSendResult(res.data)
      void queryClient.invalidateQueries({ queryKey: ['growth'] })
    },
    onError: (err) => showError(err, 'Failed to send campaign'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => growthApi.deleteCampaign(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth'] })
      router.back()
    },
    onError: (err) => showError(err, 'Failed to delete campaign'),
  })

  if (isLoading || !campaign) {
    return (
      <View className="flex-1 bg-ink-50 items-center justify-center">
        <ActivityIndicator color={primaryColor} />
      </View>
    )
  }

  const status = statusInfo(campaign.status, colors)
  const sent = campaign.status === 'SENT'
  const canEdit = !sent
  const breakdown = campaign.sends_breakdown ?? {}
  const sampleMessage = campaign.message_template
    .replace(/\{\{\s*name\s*\}\}/g, 'Priya')
    .replace(/\{\{\s*shop\s*\}\}/g, 'Your Store')
    .replace(/\{\{\s*link\s*\}\}/g, 'kanchuki.app/c/yourstore')
    .replace(/\{\{\s*festival\s*\}\}/g, campaign.festival_name ?? 'Diwali')
    .replace(/\{\{\s*offer\s*\}\}/g, '20% off')

  const audienceSummary = (() => {
    if (!campaign.audience_json) return 'No filters — custom selection'
    const a = campaign.audience_json
    const parts: string[] = []
    if (a.all) return 'All consented customers'
    if (a.inactive_days) parts.push(`Inactive ${a.inactive_days}+ days`)
    if (a.never_purchased) parts.push('Never purchased')
    if (a.colors?.length) parts.push(`Likes ${a.colors.join(', ')}`)
    if (a.styles?.length) parts.push(`Styles: ${a.styles.join(', ')}`)
    if (a.fabrics?.length) parts.push(`Fabrics: ${a.fabrics.join(', ')}`)
    if (a.min_total_spent_paise) parts.push(`Spent ≥ ₹${(a.min_total_spent_paise / 100).toLocaleString('en-IN')}`)
    if (a.max_budget_paise) parts.push(`Budget ≤ ₹${(a.max_budget_paise / 100).toLocaleString('en-IN')}`)
    if (a.sources?.length) parts.push(`Source: ${a.sources.join(', ')}`)
    return parts.length ? parts.join(' · ') : 'No filters'
  })()

  const confirmSend = () => {
    if (!preview) return
    Alert.alert(
      'Send campaign?',
      `This will message ${preview.audience_count} consented ${preview.audience_count === 1 ? 'customer' : 'customers'}. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: () => sendMutation.mutate(),
        },
      ],
    )
  }

  const confirmDelete = () => {
    Alert.alert('Delete campaign?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ])
  }

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900 flex-1" numberOfLines={1}>
            {campaign.name}
          </Text>
          {canEdit && (
            <AnimatedPressable
              onPress={() => router.push(`/growth/campaign-new?id=${campaign.id}`)}
              accessibilityLabel="Edit campaign"
              accessibilityRole="button"
              className="w-9 h-9 rounded-xl items-center justify-center"
              style={{ backgroundColor: `${primaryColor}1A` }}
            >
              <Pencil size={17} color={primaryColor} />
            </AnimatedPressable>
          )}
        </View>
        <View className="flex-row items-center gap-2 mt-2.5">
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: status.bg }}>
            <Text className="text-[10px] font-semibold" style={{ color: status.color }}>
              {status.label}
            </Text>
          </View>
          <Text className="text-xs text-sand-500">
            {TYPE_LABEL[campaign.type].label}
            {campaign.festival_name ? ` · ${campaign.festival_name}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Send result */}
        {sendResult && (
          <View className="bg-white rounded-2xl p-4 border border-sand-100 mb-4">
            <View className="flex-row items-center gap-2 mb-2">
              {sendResult.sent_via === 'whatsapp_api' ? (
                <Send size={16} color={colors.turmeric[600]} />
              ) : (
                <Link2 size={16} color={colors.turmeric[600]} />
              )}
              <Text className="text-sm font-bold text-sand-900">
                {sendResult.sent_via === 'whatsapp_api'
                  ? 'Sent via WhatsApp Business API'
                  : 'Ready to forward on WhatsApp'}
              </Text>
            </View>
            {sendResult.sent_via === 'whatsapp_api' ? (
              <Text className="text-xs text-sand-600 leading-4">
                {sendResult.api_sent} sent, {sendResult.api_failed} failed, out of{' '}
                {sendResult.audience_count}.
              </Text>
            ) : (
              <>
                <Text className="text-xs text-sand-600 leading-4">
                  {sendResult.manual_links?.length ?? 0} personalised messages ready. Tap each to
                  open WhatsApp and send — the campaign is marked sent.
                </Text>
                <View className="mt-3 gap-2">
                  {(sendResult.manual_links ?? []).map((m) => (
                    <AnimatedPressable
                      key={m.customer_id}
                      onPress={() => void Linking.openURL(m.link)}
                      accessibilityRole="button"
                      className="flex-row items-center bg-sand-50 rounded-xl px-3 py-2.5 border border-sand-100"
                    >
                      <View className="flex-1 mr-2">
                        <Text className="text-xs font-semibold text-sand-800">{m.name}</Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Text className="text-[11px] font-semibold" style={{ color: primaryColor }}>
                          Open WhatsApp
                        </Text>
                        <ExternalLink size={12} color={primaryColor} />
                      </View>
                    </AnimatedPressable>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* Audience */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100 mb-4">
          <View className="flex-row items-center gap-2 mb-1.5">
            <Users size={16} color={primaryColor} />
            <Text className="text-sm font-bold text-sand-900">Audience</Text>
          </View>
          <Text className="text-xs text-sand-500 leading-4">{audienceSummary}</Text>
          {!sent && (
            <View className="mt-3 bg-sand-50 rounded-xl p-3">
              {previewQuery.isLoading ? (
                <View className="flex-row items-center gap-2 py-1">
                  <ActivityIndicator size="small" color={primaryColor} />
                  <Text className="text-xs text-sand-500">Counting matching customers…</Text>
                </View>
              ) : preview ? (
                <>
                  <Text className="text-lg font-bold" style={{ color: primaryColor }}>
                    {preview.audience_count.toLocaleString('en-IN')}
                  </Text>
                  <Text className="text-[11px] text-sand-500">
                    {preview.audience_count === 1 ? 'customer matches' : 'customers match'} this
                    audience
                  </Text>
                  {preview.sample.length > 0 && (
                    <Text className="text-[11px] text-sand-400 mt-1.5" numberOfLines={2}>
                      e.g. {preview.sample.map((s) => s.name ?? 'Customer').join(', ')}
                    </Text>
                  )}
                </>
              ) : (
                <Text className="text-xs text-sand-400">Couldn't load the audience count.</Text>
              )}
            </View>
          )}
          {sent && (
            <View className="mt-3 flex-row gap-3">
              <View className="flex-1 bg-sand-50 rounded-xl p-3">
                <Text className="text-lg font-bold text-sand-900">
                  {campaign.sent_count.toLocaleString('en-IN')}
                </Text>
                <Text className="text-[11px] text-sand-500">sent</Text>
              </View>
              <View className="flex-1 bg-sand-50 rounded-xl p-3">
                <Text className="text-lg font-bold text-sand-900">
                  {campaign.opened_count.toLocaleString('en-IN')}
                </Text>
                <Text className="text-[11px] text-sand-500">opened</Text>
              </View>
              {breakdown['OPENED'] != null && (
                <View className="flex-1 bg-sand-50 rounded-xl p-3">
                  <Text className="text-lg font-bold text-sand-900">
                    {campaign.sent_count > 0
                      ? Math.round((campaign.opened_count / campaign.sent_count) * 100)
                      : 0}
                    %
                  </Text>
                  <Text className="text-[11px] text-sand-500">open rate</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* A/B results — roadmap S */}
        {campaign.variant_breakdown && campaign.variant_breakdown.length > 0 && (
          <View className="bg-white rounded-2xl p-4 border border-sand-100 mb-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Trophy size={16} color={colors.turmeric[600]} />
              <Text className="text-sm font-bold text-sand-900">Variant results</Text>
            </View>
            <View className="gap-2">
              {campaign.variant_breakdown.map((v) => (
                <View
                  key={v.label}
                  className="flex-row items-center bg-sand-50 rounded-xl px-3 py-2.5 border border-sand-100"
                >
                  <View className="flex-1 mr-2">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-xs font-semibold text-sand-800" numberOfLines={1}>
                        {v.label}
                      </Text>
                      {v.winner === true && (
                        <View className="bg-emerald-50 px-1.5 py-0.5 rounded-full">
                          <Text className="text-[9px] font-bold text-emerald-700">WINNING</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-[11px] text-sand-500 mt-0.5">
                      {v.sent} sent · {v.opened} opened
                    </Text>
                  </View>
                  <Text className="text-sm font-bold" style={{ color: primaryColor }}>
                    {Math.round(v.open_rate * 100)}%
                  </Text>
                </View>
              ))}
            </View>
            <Text className="text-[11px] text-sand-400 mt-2 leading-4">
              Open rate per variant — keep testing until one pulls clearly ahead.
            </Text>
          </View>
        )}

        {/* Message */}
        <View className="bg-white rounded-2xl p-4 border border-sand-100 mb-4">
          <View className="flex-row items-center gap-2 mb-1.5">
            <Megaphone size={16} color={primaryColor} />
            <Text className="text-sm font-bold text-sand-900">Message</Text>
          </View>
          <View className="bg-sand-50 rounded-xl p-3">
            <Text className="text-[11px] font-semibold text-sand-500 uppercase tracking-wide mb-1">
              Sample — how it reaches a customer
            </Text>
            <Text className="text-xs text-sand-700 leading-4">{sampleMessage}</Text>
          </View>
          {campaign.ab_variants && campaign.ab_variants.length === 2 && (
            <View className="mt-2.5 gap-1.5">
              {campaign.ab_variants.map((v) => (
                <View
                  key={v.label}
                  className="flex-row items-center bg-sand-50 rounded-xl px-3 py-2 border border-sand-100"
                >
                  <View className="flex-1 mr-2">
                    <Text className="text-xs font-semibold text-sand-800" numberOfLines={1}>
                      {v.label}
                    </Text>
                    {(v.product_ids?.length ?? 0) > 0 && (
                      <Text className="text-[10px] text-sand-400 mt-0.5">
                        {v.product_ids!.length} {v.product_ids!.length === 1 ? 'product' : 'products'} in this collection
                      </Text>
                    )}
                  </View>
                  <Text className="text-[11px] text-sand-500">{v.send_pct}%</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Actions */}
        {canEdit && (
          <View className="gap-2.5">
            <GradientButton
              label={
                sendMutation.isPending
                  ? 'Sending…'
                  : preview
                    ? `Send to ${preview.audience_count}`
                    : 'Send Campaign'
              }
              onPress={confirmSend}
              loading={sendMutation.isPending}
            />
            <AnimatedPressable
              onPress={confirmDelete}
              disabled={deleteMutation.isPending}
              className="items-center py-3"
              accessibilityRole="button"
            >
              {deleteMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.rust[600]} />
              ) : (
                <View className="flex-row items-center gap-1.5">
                  <Trash2 size={14} color={colors.rust[600]} />
                  <Text className="text-rust-600 text-xs font-semibold">Delete Campaign</Text>
                </View>
              )}
            </AnimatedPressable>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
