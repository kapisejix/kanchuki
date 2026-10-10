import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ChevronLeft, ExternalLink } from 'lucide-react-native'
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View, Linking } from 'react-native'
import { useScreenInsets } from '../../../src/lib/safe-area'
import { KeyboardScreen } from '../../../src/components/KeyboardScreen'
import { AnimatedPressable } from '../../../src/components/AnimatedPressable'
import { GradientButton } from '../../../src/components/GradientButton'
import { retailerApi } from '../../../src/lib/api/retailer'
import { showError } from '../../../src/lib/errors'

const INPUT =
  'bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-bold text-spaceCadet-900 mb-4'

export default function WhatsAppCloudConfigScreen() {
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets()
  const queryClient = useQueryClient()

  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateLang, setTemplateLang] = useState('en_US')

  // GET /me/whatsapp-api → data: null when WHATSAPP_BUSINESS_API isn't on the plan.
  const { data, isLoading } = useQuery({
    queryKey: ['retailer', 'whatsapp-api'],
    queryFn: () => retailerApi.getWhatsAppApiConfig(),
  })
  const cfg = data?.data ?? null
  const configured = !!cfg?.configured
  const planBlocked = !isLoading && data?.data === null

  // Prefill once the saved config lands (the token is never returned by the API).
  useEffect(() => {
    if (!cfg) return
    setPhoneNumberId(cfg.whatsapp_api_phone_number_id ?? '')
    setTemplateName(cfg.whatsapp_api_template_name ?? '')
    setTemplateLang(cfg.whatsapp_api_template_lang ?? 'en_US')
  }, [cfg])

  // A saved token can be kept by leaving the field blank; a first save needs one.
  const canSave =
    !planBlocked && !!phoneNumberId.trim() && !!templateName.trim() && (configured || !!accessToken.trim())

  const save = useMutation({
    mutationFn: () =>
      retailerApi.saveWhatsAppApiConfig({
        phone_number_id: phoneNumberId.trim(),
        access_token: accessToken.trim() || undefined,
        template_name: templateName.trim(),
        template_lang: templateLang.trim() || 'en_US',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['growth', 'integrations'] })
      void queryClient.invalidateQueries({ queryKey: ['retailer', 'whatsapp-api'] })
      Alert.alert('Connected!', 'WhatsApp Business Cloud API is configured.', [
        { text: 'OK', onPress: () => router.back() },
      ])
    },
    onError: (err) => showError(err, 'Failed to save WhatsApp Cloud API credentials'),
  })

  return (
    <KeyboardScreen className="flex-1 bg-[#F8F7FC]">
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-4"
        style={{ paddingTop: headerPaddingTop }}
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
            className="text-xl font-bold text-spaceCadet-900"
          >
            WhatsApp Business API
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: screenPaddingBottom }}>
        <Text className="text-xs text-heliotrope-500 mb-4 leading-relaxed font-medium">
          Connect your Meta WhatsApp Cloud API credentials to send collection links and campaigns
          straight from Kanchuki, instead of one-by-one WhatsApp shares.
        </Text>

        <View className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4">
          <Text className="text-xs text-amber-800 leading-relaxed font-medium">
            Messages sent through the Cloud API are billed by Meta to your own WhatsApp Business
            account, per template (marketing ₹1.09, utility ₹0.145). Keep a payment method active in
            Meta Business Manager. Sharing from Kanchuki with the normal WhatsApp button stays free.
          </Text>
        </View>

        {planBlocked && (
          <View className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 mb-4">
            <Text className="text-xs text-rose-700 font-bold">
              WhatsApp Business API is not included in your current plan. Upgrade to connect it.
            </Text>
          </View>
        )}

        <AnimatedPressable
          onPress={() => Linking.openURL('https://developers.facebook.com/docs/whatsapp/cloud-api')}
          className="flex-row items-center gap-2 bg-lavender-100 rounded-2xl px-4 py-3 mb-4 border border-lavender-200"
        >
          <ExternalLink size={14} color="#BB3F95" />
          <Text className="text-xs font-bold text-fuchsia-700">
            How to get WhatsApp Cloud API credentials →
          </Text>
        </AnimatedPressable>

        <Label text="Phone Number ID" />
        <TextInput
          value={phoneNumberId}
          onChangeText={setPhoneNumberId}
          placeholder="104928374829102"
          placeholderTextColor="#928EB2"
          className={INPUT}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
        />

        <Label text="System User Permanent Access Token" />
        <TextInput
          value={accessToken}
          onChangeText={setAccessToken}
          placeholder={configured ? 'Saved — leave blank to keep it' : 'EAAG...'}
          placeholderTextColor="#928EB2"
          className={INPUT}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Label text="Approved Template Name" />
        <TextInput
          value={templateName}
          onChangeText={setTemplateName}
          placeholder="collection_share"
          placeholderTextColor="#928EB2"
          className={INPUT}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Label text="Template Language" />
        <TextInput
          value={templateLang}
          onChangeText={setTemplateLang}
          placeholder="en_US"
          placeholderTextColor="#928EB2"
          className={INPUT}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View className="mt-2">
          {save.isPending ? (
            <ActivityIndicator color="#BB3F95" />
          ) : (
            <GradientButton
              label={configured ? 'Update' : 'Save & Link'}
              onPress={() => save.mutate()}
              disabled={!canSave}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardScreen>
  )
}

function Label({ text }: { text: string }) {
  return (
    <Text className="text-xs font-bold text-heliotrope-500 uppercase tracking-wider mb-1.5">{text}</Text>
  )
}
