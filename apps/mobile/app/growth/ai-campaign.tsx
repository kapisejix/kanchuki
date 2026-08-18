import { useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Sparkles } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { growthApi, type AiCampaignDraft, type CampaignType, type SuggestedProduct } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

const EXAMPLE_PROMPTS = [
  'Send cotton new arrivals to customers who like office wear',
  'Create Diwali collection for premium customers',
  'Find customers who have not purchased in 6 months and send them a comeback offer',
  'Show me customers who bought pink suits last month and send them matching dupattas',
  'Blast new sarees to everyone who prefers silk',
  'Send a festive greeting to all consented customers',
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white rounded-2xl p-4 border border-sand-100">
      <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-3">
        {title}
      </Text>
      {children}
    </View>
  )
}

export default function AiCampaignScreen() {
  const { primaryColor, colors } = useTheme()
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [prompt, setPrompt] = useState('')
  const [generating, setGenerating] = useState(false)
  const [draft, setDraft] = useState<AiCampaignDraft | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      Alert.alert('Missing info', 'Describe the campaign you want to send.')
      return
    }
    setGenerating(true)
    try {
      const res = await growthApi.aiCampaign(prompt.trim())
      setDraft(res.data)
    } catch (err) {
      showError(err, 'Failed to generate campaign')
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!draft) return
    if (!draft.name.trim()) {
      Alert.alert('Missing name', 'Give the campaign a name.')
      return
    }
    if (!draft.message_template.trim()) {
      Alert.alert('Missing message', 'Write a message template.')
      return
    }
    if (draft.type === 'FESTIVAL' && !draft.festival_id) {
      Alert.alert('Missing festival', 'Pick a festival for the campaign.')
      return
    }

    setGenerating(true)
    try {
      const payload = {
        type: draft.type,
        name: draft.name.trim(),
        message_template: draft.message_template.trim(),
        audience: draft.audience,
        product_ids: draft.product_ids,
        ...(draft.type === 'FESTIVAL' && draft.festival_id ? { festival_id: draft.festival_id } : {}),
      }
      const res = await growthApi.createCampaign(payload)
      await queryClient.invalidateQueries({ queryKey: ['growth'] })
      router.replace(`/growth/campaign/${res.data.id}`)
    } catch (err) {
      showError(err, 'Failed to save campaign')
    } finally {
      setGenerating(false)
    }
  }

  const typeLabel: Record<string, string> = {
    FESTIVAL: 'Festival',
    REACTIVATION: 'Reactivation',
    PROMOTION: 'Promotion',
    GENERAL: 'General',
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1 bg-ink-50"
    >
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityLabel="Close"
            accessibilityRole="button"
          >
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900">AI Campaign Assistant</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="gap-4">
          {/* Prompt input */}
          <Section title="Describe your campaign">
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder="e.g. Send cotton new arrivals to customers who like office wear"
              placeholderTextColor={colors.sand[400]}
              className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-3 min-h-[80px]"
              multiline
              maxLength={2000}
              textAlignVertical="top"
            />
            <View className="flex-row flex-wrap gap-2 mt-3">
              {EXAMPLE_PROMPTS.map((example) => (
                <AnimatedPressable
                  key={example}
                  onPress={() => setPrompt(example)}
                  accessibilityRole="button"
                  className="px-3 py-2 rounded-xl bg-sand-100 border border-sand-200"
                >
                  <Text className="text-[11px] font-medium text-sand-600 leading-4">
                    {example}
                  </Text>
                </AnimatedPressable>
              ))}
            </View>
            <View className="mt-3">
              <GradientButton
                label={generating ? 'Generating…' : 'Generate Campaign'}
                onPress={() => void handleGenerate()}
                loading={generating}
              />
            </View>
          </Section>

          {/* Draft preview */}
          {draft && (
            <>
              <Section title="Suggested campaign">
                <View className="gap-3">
                  <View>
                    <Text className="text-xs font-medium text-sand-600 mb-1">Name</Text>
                    <TextInput
                      value={draft.name}
                      onChangeText={(text) => setDraft({ ...draft, name: text })}
                      className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-2.5 border border-sand-200"
                      maxLength={120}
                    />
                  </View>

                  <View className="flex-row gap-2">
                    <View className="flex-1">
                      <Text className="text-xs font-medium text-sand-600 mb-1">Type</Text>
                      <View className="bg-sand-50 rounded-xl px-3 py-2.5 border border-sand-200">
                        <Text className="text-sm text-sand-800">{typeLabel[draft.type] ?? draft.type}</Text>
                      </View>
                    </View>
                    {draft.type === 'FESTIVAL' && (
                      <View className="flex-1">
                        <Text className="text-xs font-medium text-sand-600 mb-1">Festival</Text>
                        <View className="bg-sand-50 rounded-xl px-3 py-2.5 border border-sand-200">
                          <Text className="text-sm text-sand-800">
                            {draft.festival_id ? `Festival #${draft.festival_id}` : 'Not selected'}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>

                  <View>
                    <Text className="text-xs font-medium text-sand-600 mb-1">Message template</Text>
                    <TextInput
                      value={draft.message_template}
                      onChangeText={(text) => setDraft({ ...draft, message_template: text })}
                      className="text-sm text-sand-900 bg-sand-50 rounded-xl px-3.5 py-2.5 min-h-[96px] border border-sand-200"
                      multiline
                      maxLength={2000}
                      textAlignVertical="top"
                    />
                  </View>

                  <View className="bg-sand-50 rounded-xl p-3">
                    <Text className="text-[11px] font-semibold text-sand-500 uppercase tracking-wide mb-1">
                      Audience
                    </Text>
                    <Text className="text-xs text-sand-600 leading-4">
                      {draft.audience_count > 0
                        ? `${draft.audience_count} customers match this audience`
                        : 'No customers match — adjust filters'}
                    </Text>
                    {draft.rationale ? (
                      <Text className="text-xs text-sand-500 mt-1 leading-4">{draft.rationale}</Text>
                    ) : null}
                  </View>

                  {draft.matched_products.length > 0 && (
                    <View>
                      <Text className="text-xs font-medium text-sand-600 mb-2">
                        Matched products ({draft.matched_products.length})
                      </Text>
                      <View className="gap-1.5">
                        {draft.matched_products.slice(0, 8).map((p: SuggestedProduct) => (
                          <View
                            key={p.id}
                            className="flex-row items-center justify-between bg-sand-50 rounded-xl px-3 py-2"
                          >
                            <Text className="text-xs font-medium text-sand-700 flex-1 mr-2" numberOfLines={1}>
                              {p.name ?? p.category ?? 'Product'}
                            </Text>
                            <Text className="text-[10px] text-sand-400">
                              {p.primary_color ?? ''}
                              {p.price_min ? ` · ₹${(p.price_min / 100).toFixed(0)}` : ''}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
              </Section>

              <View>
                <GradientButton
                  label="Save Campaign"
                  onPress={() => void handleSave()}
                  loading={generating}
                />
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
