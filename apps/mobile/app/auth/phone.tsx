import { COLORS, isValidIndianPhone, normalizeIndianPhone } from '@kanchuki/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
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
import { useTheme } from '../../src/lib/theme';
import { WEB_URL } from '../../src/lib/web-url';

export default function PhoneScreen() {
  const { colors } = useTheme();
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
      if (isMsg91OtpConfigured()) {
        // Real OTP flow: the MSG91 widget sends the SMS itself. It returns a
        // reqId the OTP screen uses to verify; in invisible mode it may return
        // the verified access token right here — pass it through so the OTP
        // screen can skip the code entry.
        const response = await sendMsg91Otp(digits);
        const reqId = extractMsg91ReqId(response) ?? ''
        const token = extractMsg91AccessToken(response) ?? ''
        if (!reqId && !token) {
          // No verification session from the widget (misconfigured widget,
          // send failure surfaced as a response) — don't navigate into a
          // screen that would silently fall back to the legacy API OTP flow
          // with no SMS behind it.
          showError(
            new Error('MSG91_WIDGET_NO_SESSION'),
            'Could not start OTP verification. Check the MSG91 widget configuration and try again.',
            'Could not send OTP',
          )
          return
        }
        router.push({ pathname: '/auth/otp', params: { phone, reqId, token } })
      } else {
        await authApi.sendOtp(phone);
        router.push({ pathname: '/auth/otp', params: { phone } });
      }
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
      className="flex-1 bg-white"
    >
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top */}
        <View>
          {/* Logo */}
          <View className="w-16 h-16 bg-ink-600 rounded-2xl items-center justify-center mb-8">
            <Text className="text-white text-2xl font-bold">K</Text>
          </View>

          <Text className="text-3xl font-bold text-sand-900">Welcome to{'\n'}Kanchuki</Text>
          <Text className="text-sand-500 text-base mt-3">
            Aapki dukan, AI ki taakat.{'\n'}Enter your mobile number to continue.
          </Text>

          {/* Phone input */}
          <View className="mt-10">
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
              Mobile Number
            </Text>
            <View className="flex-row items-center border-2 border-sand-200 rounded-2xl px-4 py-4 gap-3 focus:border-ink-500">
              <Text className="text-base font-semibold text-sand-600">+91</Text>
              <View className="w-px h-5 bg-sand-300" />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="10-digit mobile number"
                placeholderTextColor={colors.sand[400]}
                keyboardType="phone-pad"
                maxLength={15}
                className="flex-1 text-base text-sand-900 font-medium"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => void handleSend()}
              />
            </View>
            {showPhoneError ? (
              <Text className="text-xs font-medium text-danger mt-2 pl-1">
                Enter a valid 10-digit mobile number (starts with 6–9)
              </Text>
            ) : (
              <Text className="text-xs text-sand-400 mt-2 pl-1">
                OTP will be sent to this number
              </Text>
            )}
          </View>
        </View>

        {/* Bottom CTA */}
        <View>
          <GradientButton
            label="Send OTP →"
            onPress={() => void handleSend()}
            disabled={!isValid}
            loading={loading}
          />

          <Text className="text-center text-xs text-sand-400 mt-4 px-4 leading-4">
            By continuing, you agree to our{' '}
            <Text
              className="font-semibold text-ink-600"
              onPress={() => void Linking.openURL(`${WEB_URL}/terms`)}
            >
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              className="font-semibold text-ink-600"
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
