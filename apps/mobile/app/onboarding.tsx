import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Dimensions,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../src/components/AnimatedPressable';
import { GradientButton } from '../src/components/GradientButton';
import { useReduceMotion } from '../src/hooks/useReduceMotion';
import { retailerApi } from '../src/lib/api';
import { useTheme } from '../src/lib/theme';
import { WEB_URL } from '../src/lib/web-url';

type Step = 1 | 2 | 3 | 4;
const TOTAL_STEPS = 4;

// ─── Step config ──────────────────────────────────────────────────
const STEP_META: Record<Step, { label: string; title: string; subtitle: string }> = {
  1: {
    label: 'Shop',
    title: 'Shop Details',
    subtitle: 'Set up your digital store profile. AI will catalog your outfits and create WhatsApp links.',
  },
  2: {
    label: 'Location',
    title: 'Shop Location',
    subtitle: 'Add your shop address so local customers can easily find and visit your store.',
  },
  3: {
    label: 'GST',
    title: 'GST Details',
    subtitle: 'Optional — add your GSTIN now to enable automatic GST invoice generation.',
  },
  4: {
    label: 'Done',
    title: "You're All Set!",
    subtitle: 'Your digital catalog is ready. Start adding products or create your store QR.',
  },
};

// ─── Step Indicator (Fixed Light Header) ───────────────────────────
function StepIndicator({
  currentStep,
  onPress,
}: {
  currentStep: Step;
  onPress: (step: Step) => void;
}) {
  return (
    <View className="flex-row items-center justify-center px-4 pt-2 pb-3">
      {([1, 2, 3, 4] as Step[]).map((s, i) => {
        const isActive = s === currentStep;
        const isPast = s < currentStep;
        return (
          <View key={s} className="flex-row items-center">
            {/* Connector line between step circles */}
            {i > 0 && (
              <View
                className="h-1 w-6 sm:w-10 rounded-full mx-1"
                style={{
                  backgroundColor: isPast ? '#BB3F95' : '#E0E1F6',
                }}
              />
            )}
            <AnimatedPressable
              onPress={() => isPast && onPress(s)}
              disabled={!isPast}
              accessibilityLabel={STEP_META[s].label}
              accessibilityRole="button"
              className="items-center gap-1 px-1"
            >
              <View
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full items-center justify-center border-2 ${
                  isActive
                    ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm'
                    : isPast
                      ? 'bg-fuchsia-500 border-fuchsia-500'
                      : 'bg-white border-lavender-300'
                }`}
              >
                <Text
                  className={`text-xs sm:text-sm font-bold ${
                    isActive ? 'text-white' : isPast ? 'text-white' : 'text-heliotrope-500'
                  }`}
                >
                  {isPast ? '✓' : s}
                </Text>
              </View>
              <Text
                className={`text-[11px] font-semibold ${
                  isActive ? 'text-spaceCadet-900 font-bold' : isPast ? 'text-heliotrope-700' : 'text-heliotrope-500'
                }`}
              >
                {STEP_META[s].label}
              </Text>
            </AnimatedPressable>
          </View>
        );
      })}
    </View>
  );
}

// ─── Form field wrapper (Light Theme) ──────────────────────────────
const fieldShadow: ViewStyle = {
  shadowColor: '#231F48',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.04,
  shadowRadius: 4,
  elevation: 1,
};

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <View className="mt-4 w-full">
      <Text className="text-xs sm:text-sm font-bold text-spaceCadet-900 mb-1.5 tracking-tight">
        {label}
        {required && <Text className="text-fuchsia-500"> *</Text>}
        {optional && <Text className="text-heliotrope-500 font-normal"> (optional)</Text>}
      </Text>
      <View className="w-full rounded-2xl bg-white border border-lavender-200" style={fieldShadow}>
        {children}
      </View>
    </View>
  );
}

// ─── Main Onboarding Screen ────────────────────────────────────────
export default function OnboardingScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // ── Form state ──
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [gstin, setGstin] = useState('');
  const [referralCode, setReferralCode] = useState('');

  // ── Validation ──
  const canProceed = useCallback((): boolean => {
    if (step === 1) return shopName.trim().length >= 2;
    if (step === 2) return shopAddress.trim().length >= 2 || city.trim().length >= 2;
    if (step === 3) return true; // GST is optional
    return true;
  }, [step, shopName, shopAddress, city]);

  const goToStep = useCallback((s: Step) => {
    setStep(s);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 1 && step < TOTAL_STEPS && !saving) {
        goToStep((step - 1) as Step);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step, saving, goToStep]);

  const handleNext = async () => {
    if (saving || showConfetti) return;
    setSaving(true);
    try {
      const nextStep = (step + 1) as Step;

      if (step === 1) {
        await retailerApi.update({
          shop_name: shopName.trim(),
          owner_name: ownerName.trim() || undefined,
          referral_code: referralCode.trim() || undefined,
        });
        await retailerApi.updateOnboarding(1);
        goToStep(nextStep);
        return;
      }

      if (step === 2) {
        await retailerApi.update({
          address_line1: shopAddress.trim() || undefined,
          city: city.trim() || undefined,
          address_line2: district.trim() || undefined,
          state: state.trim() || undefined,
          pincode: pincode.trim() || undefined,
        });
        await retailerApi.updateOnboarding(2);
        goToStep(nextStep);
        return;
      }

      if (step === 3) {
        if (gstin.trim()) {
          await retailerApi.update({ gstin: gstin.trim() });
        }
        await retailerApi.updateOnboarding(3);
        goToStep(nextStep);
        return;
      }

      // Final step — save full profile and redirect
      await saveFinalStep();
      setShowConfetti(true);
      setTimeout(() => {
        router.replace('/');
      }, 2000);
    } catch {
      Alert.alert('Error', 'Could not save details. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveFinalStep = async () => {
    await retailerApi.update({
      shop_name: shopName.trim(),
      owner_name: ownerName.trim() || undefined,
      address_line1: shopAddress.trim() || undefined,
      city: city.trim() || undefined,
      address_line2: district.trim() || undefined,
      state: state.trim() || undefined,
      pincode: pincode.trim() || undefined,
      gstin: gstin.trim() || undefined,
    });
    const onboardingRes = await retailerApi.updateOnboarding(TOTAL_STEPS, true);
    queryClient.setQueryData(['retailer', 'me'], (old) => {
      const oldData = (old as { data?: Record<string, unknown> } | undefined)?.data;
      return {
        data: {
          ...(oldData ?? {}),
          onboarding_step: onboardingRes.data.onboarding_step,
          onboarding_completed: onboardingRes.data.onboarding_completed,
        },
      };
    });
    void queryClient.invalidateQueries({ queryKey: ['retailer', 'me'] });
  };

  const handleGetCatalogHelp = async () => {
    if (saving || showConfetti) return;
    setSaving(true);
    try {
      await saveFinalStep();
      setShowConfetti(true);
      setTimeout(() => {
        router.replace('/settings/catalog-upload');
      }, 1500);
    } catch {
      Alert.alert('Error', 'Could not save details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateStoreQr = async () => {
    if (saving || showConfetti) return;
    setSaving(true);
    try {
      await saveFinalStep();
      setShowConfetti(true);
      setTimeout(() => {
        router.replace('/store-profile');
      }, 1500);
    } catch {
      Alert.alert('Error', 'Could not save details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const commonInputStyle = {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: colors.sand[300],
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.sand[900],
    width: '100%' as const,
  };

  const renderContent = () => {
    switch (step) {
      case 1:
        return (
          <View className="w-full">
            <Text className="text-sand-600 text-sm leading-5 mb-1">
              Create your digital store in minutes — AI catalogs your products and shares them with
              customers on WhatsApp.
            </Text>

            <Field label="Shop Name" required>
              <TextInput
                value={shopName}
                onChangeText={setShopName}
                placeholder="e.g. Priya Fashion House"
                style={commonInputStyle}
                placeholderTextColor={colors.sand[400]}
                maxLength={200}
                autoFocus
              />
            </Field>

            <Field label="Owner / Contact Name" optional>
              <TextInput
                value={ownerName}
                onChangeText={setOwnerName}
                placeholder="e.g. Priya Sharma"
                style={commonInputStyle}
                placeholderTextColor={colors.sand[400]}
                maxLength={200}
              />
            </Field>

            <Field label="Referral Code" optional>
              <TextInput
                value={referralCode}
                onChangeText={(t) => setReferralCode(t.toUpperCase())}
                placeholder="Referred by a Kanchuki agent?"
                style={{ ...commonInputStyle, letterSpacing: 1 }}
                placeholderTextColor={colors.sand[400]}
                autoCapitalize="characters"
                maxLength={20}
              />
            </Field>

            <View className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 mt-6 w-full">
              <Text className="text-amber-900 text-sm font-bold">✨ What happens next?</Text>
              <Text className="text-amber-800 text-xs sm:text-sm mt-1 leading-5">
                Add your shop details, then take a photo of any outfit — AI will automatically tag
                it with category, color & fabric.
              </Text>
            </View>
          </View>
        );

      case 2:
        return (
          <View className="w-full">
            <Text className="text-sand-600 text-sm leading-5 mb-1">
              Customers use your shop address and location to discover your store and arrange visits.
            </Text>

            <Field label="Shop Address / Street" required>
              <TextInput
                value={shopAddress}
                onChangeText={setShopAddress}
                placeholder="Shop no., building, street, area, landmark"
                style={{
                  ...commonInputStyle,
                  minHeight: 88,
                  textAlignVertical: 'top',
                }}
                placeholderTextColor={colors.sand[400]}
                multiline
                maxLength={300}
                autoFocus
              />
            </Field>

            <Field label="City" required>
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Surat / Jaipur / Delhi"
                style={commonInputStyle}
                placeholderTextColor={colors.sand[400]}
                maxLength={100}
              />
            </Field>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field label="District" optional>
                  <TextInput
                    value={district}
                    onChangeText={setDistrict}
                    placeholder="e.g. Surat"
                    style={commonInputStyle}
                    placeholderTextColor={colors.sand[400]}
                    maxLength={100}
                  />
                </Field>
              </View>
              <View className="flex-1">
                <Field label="State" optional>
                  <TextInput
                    value={state}
                    onChangeText={setState}
                    placeholder="e.g. Gujarat"
                    style={commonInputStyle}
                    placeholderTextColor={colors.sand[400]}
                    maxLength={100}
                  />
                </Field>
              </View>
            </View>

            <Field label="Pincode / Zipcode" optional>
              <TextInput
                value={pincode}
                onChangeText={(t) => setPincode(t.replace(/[^0-9]/g, ''))}
                placeholder="6-digit pincode (e.g. 395002)"
                keyboardType="number-pad"
                style={commonInputStyle}
                placeholderTextColor={colors.sand[400]}
                maxLength={6}
              />
            </Field>

            <View className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 mt-6 w-full">
              <Text className="text-amber-900 text-sm font-bold">📍 Store Address Tip</Text>
              <Text className="text-amber-800 text-xs sm:text-sm mt-1 leading-5">
                Your shop location will appear on your customer store links and digital invoices.
              </Text>
            </View>
          </View>
        );

      case 3:
        return (
          <View className="w-full">
            <Text className="text-sand-600 text-sm leading-5 mb-1">
              Required for generating GST invoices for your customer orders.
            </Text>

            <Field label="GSTIN" optional>
              <TextInput
                value={gstin}
                onChangeText={(t) => setGstin(t.toUpperCase())}
                placeholder="15-digit GSTIN (e.g. 24AAAAA0000A1Z5)"
                style={{ ...commonInputStyle, letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}
                placeholderTextColor={colors.sand[400]}
                autoCapitalize="characters"
                maxLength={15}
                autoFocus
              />
            </Field>
            <Text className="text-xs text-sand-500 mt-2 px-1">
              Format: 22AAAAA0000A1Z5 · You can also add or update this anytime in Settings.
            </Text>

            <View className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 mt-6 w-full">
              <Text className="text-amber-900 text-sm font-bold">💡 GST invoice tip</Text>
              <Text className="text-amber-800 text-xs sm:text-sm mt-1 leading-5">
                When a customer orders a product, Kanchuki can automatically generate a GST invoice.
                You can add your GSTIN now or skip it.
              </Text>
            </View>
          </View>
        );

      case 4:
        return (
          <View className="pt-2 items-center w-full">
            {/* Big celebration emoji */}
            <LinearGradient
              colors={[colors.rust[400], colors.rust[600]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 96,
                height: 96,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 10,
                elevation: 4,
              }}
            >
              <Text className="text-4xl">🎉</Text>
            </LinearGradient>

            <Text className="text-2xl font-bold text-sand-900 text-center">Congratulations!</Text>
            <Text className="text-sand-600 text-sm sm:text-base mt-1.5 text-center">
              Your store has been set up successfully.
            </Text>

            <View className="mt-6 w-full gap-3">
              <AnimatedPressable
                onPress={() => void handleNext()}
                className="bg-rust-500 rounded-2xl p-4 items-center shadow-sm active:bg-rust-600"
              >
                <Text className="text-white text-base font-bold">Go to Dashboard</Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={() => void handleCreateStoreQr()}
                className="flex-row items-center gap-3 bg-white border border-sand-200 rounded-2xl p-4 shadow-sm"
              >
                <View className="w-10 h-10 rounded-xl bg-sand-100 items-center justify-center">
                  <Text className="text-xl">🔳</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sand-900 text-sm font-bold">Create your store QR code</Text>
                  <Text className="text-sand-500 text-xs mt-0.5">
                    Customers scan it to open your catalog at your counter
                  </Text>
                </View>
                <Text className="text-sand-400 text-lg">→</Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={() => void handleGetCatalogHelp()}
                className="flex-row items-center gap-3 bg-white border border-sand-200 rounded-2xl p-4 shadow-sm"
              >
                <View className="w-10 h-10 rounded-xl bg-sand-100 items-center justify-center">
                  <Text className="text-xl">🧑‍💼</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sand-900 text-sm font-bold">
                    Get help adding your catalog
                  </Text>
                  <Text className="text-sand-500 text-xs mt-0.5">
                    A paid Kanchuki visit uploads it for you — skip anytime
                  </Text>
                </View>
                <Text className="text-sand-400 text-lg">→</Text>
              </AnimatedPressable>
            </View>
          </View>
        );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-50"
    >
      {/* ── Fixed Light Header ── */}
      <View
        className="bg-white border-b border-sand-200"
        style={{
          paddingTop: insets.top + 8,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        {/* Top bar with back button & title */}
        <View className="flex-row items-center px-4 pt-1 pb-1">
          <View className="w-10 items-start">
            {step > 1 && step < TOTAL_STEPS && (
              <AnimatedPressable
                onPress={() => goToStep((step - 1) as Step)}
                accessibilityLabel="Back"
                accessibilityRole="button"
                className="w-9 h-9 rounded-full bg-sand-100 items-center justify-center border border-sand-200 active:bg-sand-200"
              >
                <Text className="text-sand-800 text-lg font-bold">‹</Text>
              </AnimatedPressable>
            )}
          </View>
          <Text className="flex-1 text-center text-sand-900 text-base sm:text-lg font-bold">
            {STEP_META[step].title}
          </Text>
          <View className="w-10" />
        </View>

        {/* Progress bar */}
        <View className="h-1 bg-sand-200 mx-6 mt-1 rounded-full overflow-hidden">
          <View
            className="h-full bg-rust-500 rounded-full"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </View>

        {/* Step circles */}
        <StepIndicator currentStep={step} onPress={goToStep} />
      </View>

      {/* ── Main Form Body (Light & Centered) ── */}
      <View className="flex-1 bg-slate-50">
        <ScrollView
          className="flex-1 w-full"
          contentContainerStyle={{
            flexGrow: 1,
            maxWidth: 540,
            width: '100%',
            alignSelf: 'center',
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 32,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="bg-white border border-sand-200 rounded-3xl p-5 sm:p-7 shadow-sm w-full">
            {renderContent()}
          </View>
        </ScrollView>
      </View>

      {/* ── Bottom action bar (Light Mode) ── */}
      <View
        className="bg-white border-t border-sand-200 px-6 pt-3.5"
        style={{
          paddingBottom: Math.max(12, insets.bottom + 8),
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 4,
        }}
      >
        <View className="max-w-[540px] w-full self-center">
          <GradientButton
            label={
              showConfetti
                ? "🎉 You're in!"
                : step === TOTAL_STEPS
                  ? 'Go to Dashboard'
                  : 'Continue →'
            }
            onPress={() => void handleNext()}
            disabled={!canProceed() || showConfetti || saving}
            loading={saving}
          />

          {/* GST step skip button */}
          {step === 3 && (
            <AnimatedPressable
              onPress={() => void handleNext()}
              disabled={saving || showConfetti}
              accessibilityLabel="Skip — continue without a GST number"
              accessibilityRole="button"
              className="items-center justify-center py-2.5 mt-1.5"
            >
              <Text className="text-sm font-semibold text-rust-600">
                Skip — I don&apos;t have a GST number
              </Text>
            </AnimatedPressable>
          )}

          {/* Legal consent line */}
          {step < TOTAL_STEPS && (
            <Text className="text-center text-xs text-sand-500 mt-2 px-2 leading-4">
              By continuing, you agree to our{' '}
              <Text
                className="font-semibold text-rust-600"
                onPress={() => void Linking.openURL(`${WEB_URL}/terms`)}
              >
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text
                className="font-semibold text-rust-600"
                onPress={() => void Linking.openURL(`${WEB_URL}/privacy`)}
              >
                Privacy Policy
              </Text>
            </Text>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
