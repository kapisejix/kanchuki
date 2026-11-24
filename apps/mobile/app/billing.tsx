import { isPlanEnded } from '@kanchuki/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ChevronLeft, CreditCard, Mail } from 'lucide-react-native';
// Plans & Billing — read-only (Play Payments policy): no prices, purchase path,
// or pointer to outside payment. Do not add any without Play Billing.
import { Linking, ScrollView, Text, View } from 'react-native';
import { useScreenInsets } from '../src/lib/safe-area';
import { AnimatedPressable } from '../src/components/AnimatedPressable';
import { retailerApi } from '../src/lib/api';

const SUPPORT_EMAIL = 'support@kanchuki.app';

export default function BillingScreen() {
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets();

  const { data: meData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
  });
  const me = (meData as { data: { plan?: string; plan_status?: string } } | undefined)?.data;

  // RC-033: `plan_status === 'ACTIVE' ? 'active' : 'free trial'` told a retailer
  // whose paid term had COMPLETED (or been CANCELLED) that they were on a free
  // trial. "Ended" covers both without claiming either event happened, and
  // PAST_DUE stays its own state because dunning is recoverable.
  const status = me?.plan_status ?? 'TRIAL';
  const statusLabel = isPlanEnded(status)
    ? 'Ended'
    : status === 'ACTIVE'
      ? 'Active'
      : status === 'PAST_DUE'
        ? 'Payment due'
        : 'Free trial';

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="flex-row items-center px-5 pb-3 bg-white border-b border-lavender-200"
        style={{ paddingTop: headerPaddingTop }}
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
          className="text-lg text-spaceCadet-900 ml-3"
        >
          Plans & Billing
        </Text>
      </View>

      <ScrollView
        className="flex-1 bg-[#F8F7FC] px-4 pt-4"
        contentContainerStyle={{ paddingBottom: screenPaddingBottom }}
      >
        {/* Current plan (read-only) */}
        <View className="bg-white rounded-2xl p-5 border border-lavender-200 mb-4">
          <View className="flex-row items-center gap-2 mb-2">
            <CreditCard size={18} color="#6B4773" />
            <Text className="font-semibold text-sm text-spaceCadet-900">
              {me?.plan ?? 'Starter'} Plan · {statusLabel}
            </Text>
          </View>
          <Text className="text-xs text-heliotrope-500 leading-relaxed font-medium">
            {isPlanEnded(status)
              ? `Your ${me?.plan ?? 'Starter'} plan has ended.`
              : `You're on the ${statusLabel.toLowerCase()} ${me?.plan ?? 'Starter'} plan — keep using all your features.`}
          </Text>
        </View>

        <View className="bg-white rounded-2xl p-5 border border-lavender-200 mb-10">
          <AnimatedPressable
            onPress={() =>
              void Linking.openURL(
                `mailto:${SUPPORT_EMAIL}?subject=Plans%20%26%20Billing%20enquiry`,
              )
            }
            className="py-1 flex-row items-center justify-center gap-2 border border-lavender-200 rounded-lg px-3 min-h-[36px]"
          >
            <Mail size={15} color="#6B4773" />
            <Text className="text-xs text-spaceCadet-900 font-medium">
              Questions? Email {SUPPORT_EMAIL}
            </Text>
          </AnimatedPressable>
        </View>

      </ScrollView>
    </View>
  );
}
