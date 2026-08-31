import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft, CreditCard, Globe, Mail } from 'lucide-react-native';
// Plans & Billing — informational screen (Play Store compliance).
//
// In-app subscription/add-on purchases were removed from the Android build
// for launch: Google Play policy requires Play Billing for digital goods sold
// in-app, and the plan is to sell plans on the Kanchuki website instead.
// This screen is read-only — it shows the retailer's current plan and points
// them to the website for anything else. The old Razorpay purchase UI lives
// in git history (and the server-side billing rails stay intact) so billing
// can return later via web or Play Billing.
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../src/components/AnimatedPressable';
import { retailerApi } from '../src/lib/api';
import { useTheme } from '../src/lib/theme';
import { WEB_URL } from '../src/lib/web-url';

const SUPPORT_EMAIL = 'support@kanchuki.app';

export default function BillingScreen() {
  const { primaryColor } = useTheme();
  const insets = useSafeAreaInsets();

  const { data: meData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
  });
  const me = (meData as { data: { plan?: string; plan_status?: string } } | undefined)?.data;

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="flex-row items-center px-5 pb-3 bg-white border-b border-lavender-200"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <AnimatedPressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={20} color="#231F48" />
        </AnimatedPressable>
        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-lg font-bold text-spaceCadet-900 ml-3"
        >
          Plans & Billing
        </Text>
      </View>

      <ScrollView className="flex-1 bg-[#F8F7FC] px-4 pt-4">
        {/* Current plan (read-only) */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm mb-4">
          <View className="flex-row items-center gap-2 mb-2">
            <CreditCard size={18} color="#BB3F95" />
            <Text className="font-bold text-sm text-spaceCadet-900">
              {me?.plan ?? 'Starter'} Plan · {me?.plan_status ?? 'Trial'}
            </Text>
          </View>
          <Text className="text-xs text-heliotrope-500 leading-relaxed font-medium">
            You&apos;re on the {me?.plan_status === 'ACTIVE' ? 'active' : 'free trial'}{' '}
            {me?.plan ?? 'Starter'} plan — keep using all your features.
          </Text>
        </View>

        {/* Plans are managed on the website (Play Store compliance) */}
        <View className="bg-white rounded-3xl p-5 border border-lavender-200 shadow-sm">
          <View
            className="w-12 h-12 rounded-2xl items-center justify-center mb-3 bg-lavender-100 border border-lavender-200"
          >
            <Globe size={22} color="#BB3F95" />
          </View>
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-base font-bold text-spaceCadet-900"
          >
            Manage plans on kanchuki.app
          </Text>
          <Text className="text-xs text-heliotrope-500 leading-relaxed mt-1.5 font-medium">
            Plans, add-ons and billing are managed on the Kanchuki website. Sign in with your
            store&apos;s phone number to upgrade your plan, switch billing period, or buy extra
            units.
          </Text>

          <AnimatedPressable
            onPress={() => void Linking.openURL(`${WEB_URL}/billing`)}
            className="mt-4 bg-spaceCadet-900 py-3.5 rounded-2xl items-center shadow-sm"
          >
            <Text className="text-white font-bold text-sm">Manage my plan</Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={() =>
              void Linking.openURL(
                `mailto:${SUPPORT_EMAIL}?subject=Plans%20%26%20Billing%20enquiry`,
              )
            }
            className="mt-3 py-3 flex-row items-center justify-center gap-2"
          >
            <Mail size={15} color="#6B4773" />
            <Text className="text-xs text-spaceCadet-900 font-medium">
              Questions? Email {SUPPORT_EMAIL}
            </Text>
          </AnimatedPressable>
        </View>

        <Text className="text-xs text-heliotrope-400 text-center mt-6 mb-10">Prices include GST</Text>
      </ScrollView>
    </View>
  );
}
