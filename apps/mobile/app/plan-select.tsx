import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  Crown,
  ExternalLink,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../src/components/AnimatedPressable';
import { billingApi, retailerApi } from '../src/lib/api';
import { useTheme } from '../src/lib/theme';
import { WEB_URL } from '../src/lib/web-url';

const PLAN_UI: Record<string, { name: string; icon: typeof Star; color: string }> = {
  STARTER: { name: 'Starter', icon: Star, color: '#6B4773' },
  GROWTH: { name: 'Growth', icon: Crown, color: '#7C3AED' },
  PRO: { name: 'Pro', icon: Sparkles, color: '#BB3F95' },
};

type PlanKey = keyof typeof PLAN_UI;

/** Build feature highlights from the API-provided plan limits */
function buildHighlights(limits?: {
  max_products: number | null;
  max_customers: number | null;
  try_on_credits: number;
}): string[] {
  if (!limits) return [];
  const h: string[] = [];
  h.push(limits.max_products == null ? 'Unlimited Products' : `${limits.max_products.toLocaleString('en-IN')} Products`);
  if (limits.try_on_credits > 0) h.push(`${limits.try_on_credits} Try-On Credits/mo`);
  h.push('Basic AI Tagging');
  h.push('WhatsApp Sharing');
  return h;
}

export default function PlanSelectScreen() {
  const { primaryColor } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [switching, setSwitching] = useState(false);

  const { data: subData, isLoading: subLoading } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: () => billingApi.getSubscription(),
  });

  const { data: plansData, isLoading: plansLoading } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => billingApi.getPlans(),
  });

  const sub = subData?.data;
  const currentPlan = (sub?.plan ?? 'STARTER') as PlanKey;
  const planStatus = sub?.plan_status ?? 'TRIAL';
  const isTrial = planStatus === 'TRIAL';
  const isActive = planStatus === 'ACTIVE';
  const isCancelled = planStatus === 'CANCELLED';

  const handleSelectPlan = async (plan: PlanKey) => {
    if (plan === currentPlan && !isCancelled) {
      Alert.alert('Current Plan', `You're already on the ${PLAN_UI[plan].name} plan.`);
      return;
    }

    if (isActive && sub?.subscription) {
      // Active paid subscription — need to cancel first, then subscribe to new plan
      Alert.alert(
        'Switch Plan',
        `To switch to ${PLAN_UI[plan].name}, you'll need to cancel your current ${PLAN_UI[currentPlan].name} subscription first. Your current plan stays active until the billing period ends.\n\nProceed to cancel and switch?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: async () => {
              setSwitching(true);
              try {
                await billingApi.cancel();
                // After cancellation, create new subscription
                const result = await billingApi.subscribe(plan);
                if (result.data?.checkout_url) {
                  await Linking.openURL(result.data.checkout_url);
                }
                queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
                queryClient.invalidateQueries({ queryKey: ['retailer', 'me'] });
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Failed to switch plan';
                Alert.alert('Error', msg);
              } finally {
                setSwitching(false);
              }
            },
          },
        ],
      );
      return;
    }

    // Trial or cancelled — can subscribe directly
    setSwitching(true);
    try {
      const result = await billingApi.subscribe(plan);
      if (result.data?.checkout_url) {
        await Linking.openURL(result.data.checkout_url);
      }
      queryClient.invalidateQueries({ queryKey: ['billing', 'subscription'] });
      queryClient.invalidateQueries({ queryKey: ['retailer', 'me'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start subscription';
      Alert.alert('Error', msg);
    } finally {
      setSwitching(false);
    }
  };

  const isLoading = subLoading || plansLoading;

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
          Choose Your Plan
        </Text>
      </View>

      <ScrollView className="flex-1 bg-[#F8F7FC] px-4 pt-4">
        {/* Current Plan Status */}
        <View className="bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm mb-4">
          <View className="flex-row items-center gap-2">
            <CheckCircle2 size={16} color="#16A34A" />
            <Text className="text-xs font-bold text-spaceCadet-900">
              Current: {PLAN_UI[currentPlan]?.name ?? currentPlan} · {planStatus}
            </Text>
          </View>
          {isTrial && sub?.trial_ends_at && (
            <Text className="text-[11px] text-heliotrope-500 mt-1 font-medium">
              Free trial ends {new Date(sub.trial_ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          )}
          {isActive && (
            <Text className="text-[11px] text-heliotrope-500 mt-1 font-medium">
              Active subscription — switch anytime, new plan starts after current period ends
            </Text>
          )}
        </View>



        {isLoading ? (
          <View className="items-center py-10">
            <ActivityIndicator size="large" color={primaryColor} />
          </View>
        ) : (
          <>
            {/* Demo Plan */}
            {isTrial && (
              <View className="bg-white rounded-3xl p-4 border border-lavender-200 shadow-sm mb-4">
                <View className="flex-row items-center gap-3">
                  <View className="w-12 h-12 rounded-xl items-center justify-center bg-lavender-100">
                    <Zap size={24} color="#BB3F95" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-extrabold text-spaceCadet-900">Free Demo</Text>
                    <Text className="text-[11px] text-heliotrope-500 font-medium">
                      You&apos;re exploring with full Pro access — no payment needed
                    </Text>
                  </View>
                  <CheckCircle2 size={20} color="#16A34A" />
                </View>
              </View>
            )}

            {/* Paid Plans */}
            {(Object.keys(PLAN_UI) as PlanKey[]).map((planKey) => {
              const meta = PLAN_UI[planKey];
              const planData = plansData?.data?.find((p) => p.plan === planKey);
              const Icon = meta.icon;
              const isCurrent = planKey === currentPlan && !isCancelled;
              const price = planData?.pricing.monthly ?? 0;
              const priceDisplay = price > 0
                ? `₹${(price / 100).toLocaleString('en-IN')}`
                : '—';
              const highlights = buildHighlights(planData?.limits);

              return (
                <AnimatedPressable
                  key={planKey}
                  onPress={() => void handleSelectPlan(planKey)}
                  disabled={switching || isCurrent}
                  className="rounded-3xl p-5 mb-3 border-2 overflow-hidden"
                  style={{
                    backgroundColor: isCurrent ? undefined : '#FAF9FE',
                    borderColor: isCurrent ? meta.color : '#E0E1F6',
                    opacity: switching ? 0.6 : 1,
                  }}
                >
                  {isCurrent && (
                    <LinearGradient
                      colors={['#231F48', '#560A39']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                    />
                  )}
                  <View className="flex-row items-center gap-3 mb-3">
                    <View
                      className="w-11 h-11 rounded-xl items-center justify-center"
                      style={{
                        backgroundColor: isCurrent ? `${meta.color}33` : '#F3EAFF',
                      }}
                    >
                      <Icon size={22} color={isCurrent ? meta.color : '#6B4773'} />
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text
                          className="text-sm font-extrabold"
                          style={{ color: isCurrent ? '#FFFFFF' : '#231F48' }}
                        >
                          {meta.name}
                        </Text>
                        <Text
                          className="text-xs font-bold"
                          style={{ color: isCurrent ? meta.color : '#928EB2' }}
                        >
                          {priceDisplay}/mo
                        </Text>
                      </View>
                      <Text
                        className="text-[11px] mt-0.5 font-medium"
                        style={{ color: isCurrent ? '#D4B8E8' : '#6B4773' }}
                      >
                        {price > 0 ? `${priceDisplay}/mo` : 'Loading…'}
                        {isCurrent ? ' · Active' : ''}
                      </Text>
                    </View>
                    {isCurrent ? (
                      <CheckCircle2 size={22} color={meta.color} />
                    ) : switching ? (
                      <ActivityIndicator size="small" color="#6B4773" />
                    ) : (
                      <Text className="text-heliotrope-400 text-lg">○</Text>
                    )}
                  </View>

                  {/* Feature highlights */}
                  <View className="flex-row flex-wrap gap-1.5">
                    {highlights.map((f) => (
                      <View
                        key={f}
                        className="rounded-full px-2.5 py-1"
                        style={{
                          backgroundColor: isCurrent ? 'rgba(255,255,255,0.1)' : '#F3EAFF',
                        }}
                      >
                        <Text
                          className="text-[10px] font-bold"
                          style={{ color: isCurrent ? '#D4B8E8' : '#6B4773' }}
                        >
                          {f}
                        </Text>
                      </View>
                    ))}
                  </View>
                </AnimatedPressable>
              );
            })}
          </>
        )}

        {/* Info note */}
        <View className="flex-row items-start gap-2 bg-lavender-100/70 rounded-2xl p-4 mb-4">
          <AlertCircle size={16} color="#6B4773" className="mt-0.5" />
          <Text className="text-[11px] text-heliotrope-600 leading-relaxed flex-1 font-medium">
            All plans include a 14-day free trial. Prices shown are ex-GST — 18% GST is added at
            checkout. You can switch plans anytime — changes take effect at the start of your next
            billing cycle.
          </Text>
        </View>

        {/* Manage on website link */}
        <AnimatedPressable
          onPress={() => void Linking.openURL(`${WEB_URL}/billing`)}
          className="flex-row items-center justify-center gap-2 py-3 mb-10"
        >
          <ExternalLink size={14} color="#6B4773" />
          <Text className="text-xs text-spaceCadet-900 font-medium">
            Manage billing on kanchuki.app
          </Text>
        </AnimatedPressable>
      </ScrollView>
    </View>
  );
}
