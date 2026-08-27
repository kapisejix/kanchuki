import { isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton } from '../../src/components/GradientButton';
import { authApi, ApiError } from '../../src/lib/api';
import { showError } from '../../src/lib/errors';
import {
  extractMsg91AccessToken,
  extractMsg91ReqId,
  isMsg91OtpConfigured,
  sendMsg91Otp,
} from '../../src/lib/msg91-otp';
import { WEB_URL } from '../../src/lib/web-url';

export default function PhoneScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  // Complete validation: exactly 10 digits starting 6–9 (+91/91/0 prefix ok).
  const isValid = isValidIndianPhone(phone);
  const showPhoneError = phone.replace(/\D/g, '').length > 0 && !isValid;

  const handleSend = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      const digits = normalizeIndianPhone(phone);

      // 1. Check with backend API (handles Railway OTP_TEST_BYPASS test phones)
      const apiRes = await authApi.sendOtp(digits);
      if (apiRes.data?.bypass === true) {
        router.push({ pathname: '/auth/otp', params: { phone: digits, bypass: 'true' } });
        return;
      }

      // 2. Real phone number: use native MSG91 widget when configured
      if (isMsg91OtpConfigured()) {
        try {
          const response = await sendMsg91Otp(digits);
          const reqId = extractMsg91ReqId(response) ?? '';
          const token = extractMsg91AccessToken(response) ?? '';
          if (reqId || token) {
            router.push({ pathname: '/auth/otp', params: { phone: digits, reqId, token } });
            return;
          }
        } catch (widgetErr) {
          console.warn('[auth] MSG91 widget send error, using API OTP:', widgetErr);
        }
      }

      // 3. Fallback: backend already dispatched the OTP
      router.push({ pathname: '/auth/otp', params: { phone: digits } });
    } catch (err) {
      // Surface the backend's actionable message (rate limit, send failure)
      // instead of a generic fallback.
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.message && apiErr.status >= 400 && apiErr.status < 500) {
        showError(err, apiErr.message, 'Could not send OTP');
      } else {
        showError(err, 'Failed to send OTP. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#F8F7FC]"
    >
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{
          flexGrow: 1,
          maxWidth: 540,
          width: '100%',
          alignSelf: 'center',
          justifyContent: 'space-between',
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top spacer to balance layout */}
        <View className="w-full h-2" />

        {/* Vertically Centered Main Block */}
        <View className="items-center w-full my-auto">
          {/* Full Kanchuki wordmark logo */}
          <View className="items-center mb-5">
            <Image
              source={require('../../assets/kanchuki-full-logo.png')}
              style={{ width: 220, height: 42 }}
              resizeMode="contain"
            />
          </View>

          {/* Headline in one line: Aap ki Dukan, AI ki Takat */}
          <Text className="text-base font-bold text-spaceCadet-900 font-marcellus text-center tracking-tight mb-6">
            Aap ki <Text className="text-fuchsia-500 font-bold">Dukan</Text>,{' '}
            <Text className="text-tyrian-800 font-bold">AI</Text> ki Takat
          </Text>

          {/* Phone input card */}
          <View className="w-full bg-white border border-lavender-200 rounded-3xl p-4 shadow-sm mb-4">
            <Text className="text-[11px] font-bold text-heliotrope-600 uppercase tracking-wider mb-1.5">
              Mobile Number
            </Text>
            <View className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5 gap-3">
              <Text className="text-sm font-bold text-tyrian-800">+91</Text>
              <View className="w-px h-4 bg-lavender-300" />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="10-digit mobile number"
                placeholderTextColor="#928EB2"
                keyboardType="phone-pad"
                maxLength={15}
                className="flex-1 text-sm text-spaceCadet-900 font-bold"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => void handleSend()}
              />
            </View>
            {showPhoneError ? (
              <Text className="text-xs font-medium text-danger mt-1.5 pl-1">
                Enter a valid 10-digit mobile number (starts with 6–9)
              </Text>
            ) : (
              <Text className="text-[11px] text-heliotrope-500 mt-1.5 pl-1 font-medium">
                OTP will be sent via SMS / WhatsApp
              </Text>
            )}
          </View>

          {/* Get Instant OTP Button — compact width & center aligned */}
          <View className="items-center w-full mt-1">
            <GradientButton
              label="Get Instant OTP"
              onPress={() => void handleSend()}
              disabled={!isValid}
              loading={loading}
              compact
            />
          </View>
        </View>

        {/* Bottom Legal Links */}
        <View className="pt-6 pb-2 w-full">
          <Text className="text-center text-[11px] text-heliotrope-500 px-4 leading-4 font-medium">
            By continuing, you agree to our{' '}
            <Text
              className="font-bold text-fuchsia-600 underline"
              onPress={() => void Linking.openURL(`${WEB_URL}/terms`)}
            >
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              className="font-bold text-fuchsia-600 underline"
              onPress={() => void Linking.openURL(`${WEB_URL}/privacy`)}
            >
              Privacy Policy
            </Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
