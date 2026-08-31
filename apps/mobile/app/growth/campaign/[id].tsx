import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft,
  ExternalLink,
  Languages,
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

function statusInfo(status: CampaignStatus) {
  const map: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
    DRAFT: { label: 'Draft', color: '#928EB2', bg: '#F8F7FC' },
    SCHEDULED: { label: 'Scheduled', color: '#BB3F95', bg: '#BB3F951A' },
    SENT: { label: 'Sent', color: '#16a34a', bg: '#dcfce7' },
  }
  return map[status]
}

export default function CampaignDetailScreen() {
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
      <View className="flex-1 bg-[#F8F7FC] items-center justify-center">
        <ActivityIndicator color="#BB3F95" />
      </View>
    )
  }

  const status = statusInfo(campaign.status)
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
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
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
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-xl font-bold text-spaceCadet-900 flex-1"
            numberOfLines={1}
          >
            {campaign.name}
          </Text>
          {canEdit && (
            <AnimatedPressable
              onPress={() => router.push(`/growth/campaign-new?id=${campaign.id}`)}
              accessibilityLabel="Edit campaign"
              accessibilityRole="button"
              className="w-10 h-10 rounded-2xl items-center justify-center bg-lavender-100 border border-lavender-200"
            >
              <Pencil size={16} color="#231F48" />
            </AnimatedPressable>
          )}
        </View>
        <View className="flex-row items-center gap-2 mt-2.5">
          <View className="rounded-full px-2.5 py-0.5" style={{ backgroundColor: status.bg }}>
            <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: status.color }}>
              {status.label}
            </Text>
          </View>
          <Text className="text-xs text-heliotrope-500 font-medium">
            {TYPE_LABEL[campaign.type].label}
            {campaign.festival_name ? ` · ${campaign.festival_name}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Send result */}
        {sendResult && (
          <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-4">
            <View className="flex-row items-center gap-2 mb-2">
              {sendResult.sent_via === 'whatsapp_api' ? (
                <Send size={16} color="#BB3F95" />
              ) : (
                <Link2 size={16} color="#BB3F95" />
              )}
              <Text
                style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                className="text-base font-bold text-spaceCadet-900"
              >
                {sendResult.sent_via === 'whatsapp_api'
                  ? 'Sent via WhatsApp Business API'
                  : 'Ready to forward on WhatsApp'}
              </Text>
            </View>
            {sendResult.sent_via === 'whatsapp_api' ? (
              <Text className="text-xs text-spaceCadet-900 leading-relaxed font-medium">
                {sendResult.api_sent} sent, {sendResult.api_failed} failed, out of{' '}
                {sendResult.audience_count}.
              </Text>
            ) : (
              <>
                <Text className="text-xs text-heliotrope-500 leading-relaxed font-medium">
                  {sendResult.manual_links?.length ?? 0} personalised messages ready. Tap each to
                  open WhatsApp and send — the campaign is marked sent.
                </Text>
                <View className="mt-3 gap-2">
                  {(sendResult.manual_links ?? []).map((m) => (
                    <AnimatedPressable
                      key={m.customer_id}
                      onPress={() => void Linking.openURL(m.link)}
                      accessibilityRole="button"
                      className="flex-row items-center bg-lavender-50 rounded-2xl px-4 py-3 border border-lavender-200"
                    >
                      <View className="flex-1 mr-2">
                        <Text className="text-xs font-bold text-spaceCadet-900">{m.name}</Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Text className="text-xs font-bold text-fuchsia-700">
                          Open WhatsApp
                        </Text>
                        <ExternalLink size={12} color="#BB3F95" />
                      </View>
                    </AnimatedPressable>
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {/* Audience */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-4">
          <View className="flex-row items-center gap-2 mb-1.5">
            <Users size={16} color="#BB3F95" />
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-base font-bold text-spaceCadet-900"
            >
              Audience Match
            </Text>
          </View>
          <Text className="text-xs text-heliotrope-500 leading-relaxed font-medium">{audienceSummary}</Text>
          {!sent && (
            <View className="mt-3.5 bg-lavender-50 rounded-2xl p-4 border border-lavender-200">
              {previewQuery.isLoading ? (
                <View className="flex-row items-center gap-2 py-1">
                  <ActivityIndicator size="small" color="#BB3F95" />
                  <Text className="text-xs text-heliotrope-500 font-medium">Counting matching customers…</Text>
                </View>
              ) : preview ? (
                <>
                  <Text
                    style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                    className="text-2xl font-bold text-fuchsia-700"
                  >
                    {preview.audience_count.toLocaleString('en-IN')}
                  </Text>
                  <Text className="text-xs text-heliotrope-500 font-medium mt-0.5">
                    {preview.audience_count === 1 ? 'customer matches' : 'customers match'} this
                    audience
                  </Text>
                  {preview.sample.length > 0 && (
                    <Text className="text-[11px] text-heliotrope-400 mt-2 font-medium" numberOfLines={2}>
                      e.g. {preview.sample.map((s) => s.name ?? 'Customer').join(', ')}
                    </Text>
                  )}
                </>
              ) : (
                <Text className="text-xs text-heliotrope-500 font-medium">Couldn't load the audience count.</Text>
              )}
            </View>
          )}
          {sent && (
            <View className="mt-3.5 flex-row gap-2.5">
              <View className="flex-1 bg-lavender-50 rounded-2xl p-3 border border-lavender-200 items-center">
                <Text
                  style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                  className="text-lg font-bold text-spaceCadet-900"
                >
                  {campaign.sent_count.toLocaleString('en-IN')}
                </Text>
                <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider mt-0.5">sent</Text>
              </View>
              <View className="flex-1 bg-lavender-50 rounded-2xl p-3 border border-lavender-200 items-center">
                <Text
                  style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                  className="text-lg font-bold text-spaceCadet-900"
                >
                  {campaign.opened_count.toLocaleString('en-IN')}
                </Text>
                <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider mt-0.5">opened</Text>
              </View>
              {breakdown['OPENED'] != null && (
                <View className="flex-1 bg-lavender-50 rounded-2xl p-3 border border-lavender-200 items-center">
                  <Text
                    style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                    className="text-lg font-bold text-fuchsia-700"
                  >
                    {campaign.sent_count > 0
                      ? Math.round((campaign.opened_count / campaign.sent_count) * 100)
                      : 0}
                    %
                  </Text>
                  <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider mt-0.5">open rate</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* A/B results — roadmap S */}
        {campaign.variant_breakdown && campaign.variant_breakdown.length > 0 && (
          <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-4">
            <View className="flex-row items-center gap-2 mb-3">
              <Trophy size={16} color="#BB3F95" />
              <Text
                style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                className="text-base font-bold text-spaceCadet-900"
              >
                Variant Performance
              </Text>
            </View>
            <View className="gap-2.5">
              {campaign.variant_breakdown.map((v) => (
                <View
                  key={v.label}
                  className="flex-row items-center bg-lavender-50 rounded-2xl px-4 py-3 border border-lavender-200"
                >
                  <View className="flex-1 mr-2">
                    <View className="flex-row items-center gap-1.5">
                      <Text className="text-xs font-bold text-spaceCadet-900" numberOfLines={1}>
                        {v.label}
                      </Text>
                      {v.winner === true && (
                        <View className="bg-fuchsia-500/15 px-2 py-0.5 rounded-full border border-fuchsia-500/30">
                          <Text className="text-[9px] font-bold text-fuchsia-700">WINNING</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-[11px] text-heliotrope-500 font-medium mt-0.5">
                      {v.sent} sent · {v.opened} opened
                    </Text>
                  </View>
                  <Text
                    style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
                    className="text-base font-bold text-fuchsia-700"
                  >
                    {Math.round(v.open_rate * 100)}%
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Message */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-4">
          <View className="flex-row items-center gap-2 mb-2">
            <Megaphone size={16} color="#BB3F95" />
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-base font-bold text-spaceCadet-900"
            >
              Message Content
            </Text>
          </View>
          <View className="bg-lavender-50 rounded-2xl p-3.5 border border-lavender-200">
            <Text className="text-[10px] font-bold text-heliotrope-500 uppercase tracking-wider mb-1">
              Sample — Customer View
            </Text>
            <Text className="text-xs text-spaceCadet-900 leading-relaxed font-medium">{sampleMessage}</Text>
          </View>
          <AnimatedPressable
            onPress={() =>
              router.push(
                `/growth/translate?mode=message&campaignId=${campaign.id}&campaignName=${encodeURIComponent(campaign.name)}&message=${encodeURIComponent(sampleMessage)}`,
              )
            }
            accessibilityRole="button"
            className="flex-row items-center justify-center gap-2 mt-3 border border-dashed border-fuchsia-400 bg-fuchsia-500/5 rounded-2xl py-2.5"
          >
            <Languages size={15} color="#BB3F95" />
            <Text className="text-fuchsia-800 text-xs font-bold">AI Multi-lingual Translate</Text>
          </AnimatedPressable>
        </View>

        {/* Actions */}
        {canEdit && (
          <View className="gap-3 mt-2">
            <GradientButton
              label={
                sendMutation.isPending
                  ? 'Sending…'
                  : preview
                    ? `Send to ${preview.audience_count} Customers`
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
                <ActivityIndicator size="small" color="#dc2626" />
              ) : (
                <View className="flex-row items-center gap-1.5">
                  <Trash2 size={15} color="#dc2626" />
                  <Text className="text-red-600 text-xs font-bold uppercase tracking-wider">Delete Campaign</Text>
                </View>
              )}
            </AnimatedPressable>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
