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
  const { primaryColor, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const { data: meData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
  });
  const me = (meData as { data: { plan?: string; plan_status?: string } } | undefined)?.data;

  return (
    <View className="flex-1 bg-sand-50">
      {/* Header */}
      <View
        className="flex-row items-center px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <AnimatedPressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={24} color={colors.sand[700]} />
        </AnimatedPressable>
        <Text className="text-base font-bold text-sand-900 ml-3">Plans & Billing</Text>
      </View>

      <ScrollView className="flex-1 bg-sand-50 px-4 pt-4">
        {/* Current plan (read-only) */}
        <View className="bg-white rounded-2xl p-5 border border-sand-100 mb-4">
          <View className="flex-row items-center gap-2 mb-2">
            <CreditCard size={18} color={colors.turmeric[600]} />
            <Text className="font-bold text-sm text-sand-900">
              {me?.plan ?? 'Starter'} Plan · {me?.plan_status ?? 'Trial'}
            </Text>
          </View>
          <Text className="text-xs text-sand-500 leading-relaxed">
            You're on the {me?.plan_status === 'ACTIVE' ? 'active' : 'free trial'}{' '}
            {me?.plan ?? 'Starter'} plan — keep using all your features.
          </Text>
        </View>

        {/* Plans are managed on the website (Play Store compliance) */}
        <View className="bg-white rounded-2xl p-5 border border-sand-100">
          <View
            className="w-12 h-12 rounded-2xl items-center justify-center mb-3"
            style={{ backgroundColor: `${primaryColor}15` }}
          >
            <Globe size={22} color={primaryColor} />
          </View>
          <Text className="text-base font-bold text-sand-900">Manage plans on kanchuki.app</Text>
          <Text className="text-xs text-sand-500 leading-relaxed mt-1.5">
            Plans, add-ons and billing are managed on the Kanchuki website. Sign in with your
            store&apos;s phone number to upgrade your plan, switch billing period, or buy extra
            units.
          </Text>

          <AnimatedPressable
            onPress={() => void Linking.openURL(`${WEB_URL}/billing`)}
            className="mt-4 bg-ink-600 py-3.5 rounded-2xl items-center"
          >
            <Text className="text-white font-semibold text-sm">Manage my plan</Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={() =>
              void Linking.openURL(
                `mailto:${SUPPORT_EMAIL}?subject=Plans%20%26%20Billing%20enquiry`,
              )
            }
            className="mt-3 py-3 flex-row items-center justify-center gap-2"
          >
            <Mail size={15} color={colors.sand[500]} />
            <Text className="text-xs text-sand-600 font-medium">
              Questions? Email {SUPPORT_EMAIL}
            </Text>
          </AnimatedPressable>
        </View>

        <Text className="text-xs text-sand-400 text-center mt-6 mb-10">Prices include GST</Text>
      </ScrollView>
    </View>
  );
}
