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
import { AlertCircle } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientButton } from '../../src/components/GradientButton';
import { authApi, ApiError } from '../../src/lib/api';
import { API_URL } from '../../src/lib/api/client';
import { logError } from '../../src/lib/errors';
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Complete validation: exactly 10 digits starting 6–9 (+91/91/0 prefix ok).
  const isValid = isValidIndianPhone(phone);
  const showPhoneError = phone.replace(/\D/g, '').length > 0 && !isValid;

  const handleSend = async () => {
    if (!isValid) return;
    setLoading(true);
    setErrorMsg(null);
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
      // Show the exact failure on screen — the backend's actionable message
      // (rate limit, DLT/send failure) or the precise network/timeout reason —
      // never a generic "try again".
      const apiErr = err instanceof ApiError ? err : null;
      let msg: string;
      if (apiErr?.code === 'NETWORK_ERROR' || apiErr?.status === 0) {
        msg = `Couldn't reach the OTP server (${API_URL.replace(/^https?:\/\//, '')}). Check your internet connection and try again.`;
      } else if (apiErr?.code === 'TIMEOUT') {
        msg = 'The OTP server took too long to respond. Please try again in a moment.';
      } else if (apiErr && apiErr.status >= 500) {
        msg = `OTP service error (${apiErr.status}): ${apiErr.message}`;
      } else if (apiErr?.message) {
        msg = apiErr.message;
      } else {
        msg = err instanceof Error ? err.message : 'Could not send OTP. Please try again.';
      }
      setErrorMsg(msg);
      logError(err, 'sendOtp');
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
          paddingTop: insets.top + 36,
          paddingBottom: insets.bottom + 16,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Main Content (Top 30% positioning) */}
        <View className="items-center w-full">
          {/* Full Kanchuki wordmark logo */}
          <View className="items-center mb-4">
            <Image
              source={require('../../assets/kanchuki-full-logo.png')}
              style={{ width: 220, height: 42 }}
              resizeMode="contain"
            />
          </View>

          {/* Headline in Marcellus font */}
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-lg font-bold text-spaceCadet-900 text-center tracking-tight mb-1"
          >
            Aap ki <Text style={{ color: '#BB3F95' }}>Dukan</Text>,{' '}
            <Text style={{ color: '#560A39' }}>AI</Text> ki Takat
          </Text>

          {/* Descriptive text in normal font */}
          <Text className="text-xs text-heliotrope-600 text-center leading-relaxed font-medium max-w-xs mb-6">
            AI-powered digital catalog, instant WhatsApp storefront, and seamless billing for ethnic fashion retailers.
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

          {errorMsg && (
            <View className="w-full flex-row items-start gap-2.5 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
              <AlertCircle size={16} color="#DC2626" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-xs font-medium text-red-600 leading-5">{errorMsg}</Text>
            </View>
          )}

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
