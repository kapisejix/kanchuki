import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  FileText,
  MapPin,
  QrCode,
  Sparkles,
  Truck,
  User,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../src/components/AnimatedPressable';
import { GradientButton } from '../src/components/GradientButton';
import { retailerApi } from '../src/lib/api';
import { WEB_URL } from '../src/lib/web-url';

type Step = 1 | 2 | 3 | 4;
const TOTAL_STEPS = 4;

const SPECIALIZATIONS = [
  'Sarees & Silk',
  'Bridal Lehengas',
  'Suits & Kurtis',
  'Designer Blouses',
  'Western & Fusion',
  'Fabrics & Unstitched',
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Step config ──────────────────────────────────────────────────
const STEP_META: Record<Step, { label: string; title: string; subtitle: string }> = {
  1: {
    label: 'Shop',
    title: 'Setup Your Shop',
    subtitle: 'Digitize your catalog and create your custom WhatsApp store URL.',
  },
  2: {
    label: 'Location',
    title: 'Shop Location',
    subtitle: 'Add your shop address so local customers can easily discover and visit your store.',
  },
  3: {
    label: 'GST',
    title: 'GST Details',
    subtitle: 'Optional — add your GSTIN now to enable automatic GST invoice generation.',
  },
  4: {
    label: 'Done',
    title: "You're All Set!",
    subtitle: 'Your digital luxury catalog is ready. Start adding products or create your store QR.',
  },
};

// ─── Step Indicator ───────────────────────────────────────────────
function StepIndicator({
  currentStep,
  onPress,
}: {
  currentStep: Step;
  onPress: (step: Step) => void;
}) {
  return (
    <View className="flex-row items-center justify-between px-2 pt-3 pb-2">
      {([1, 2, 3] as Step[]).map((s, i) => {
        const isActive = s === currentStep;
        const isPast = s < currentStep;
        return (
          <View key={s} className="flex-row items-center flex-1">
            {/* Connector line before step (except first) */}
            {i > 0 && (
              <View
                className="h-0.5 flex-1 rounded-full mx-2"
                style={{
                  backgroundColor: isPast || isActive ? '#BB3F95' : '#E0E1F6',
                }}
              />
            )}
            <AnimatedPressable
              onPress={() => isPast && onPress(s)}
              disabled={!isPast}
              accessibilityLabel={STEP_META[s].label}
              accessibilityRole="button"
              className="flex-row items-center gap-1.5"
            >
              <View
                className={`w-7 h-7 rounded-full items-center justify-center border ${
                  isActive
                    ? 'bg-spaceCadet-900 border-spaceCadet-900 shadow-sm'
                    : isPast
                      ? 'bg-fuchsia-500 border-fuchsia-500'
                      : 'bg-white border-lavender-200'
                }`}
              >
                <Text
                  className={`text-[11px] font-extrabold ${
                    isActive ? 'text-white' : isPast ? 'text-white' : 'text-heliotrope-500'
                  }`}
                >
                  {isPast ? '✓' : s}
                </Text>
              </View>
              <Text
                className={`text-xs ${
                  isActive
                    ? 'text-spaceCadet-900 font-extrabold'
                    : isPast
                      ? 'text-heliotrope-700 font-bold'
                      : 'text-heliotrope-400 font-medium'
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

// ─── Main Onboarding Screen ────────────────────────────────────────
export default function OnboardingScreen() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // ── Form state ──
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>(['Sarees & Silk']);
  const [shopAddress, setShopAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [gstin, setGstin] = useState('');
  const [referralCode, setReferralCode] = useState('');

  const toggleSpec = (spec: string) => {
    setSelectedSpecs((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]
    );
  };

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
        router.replace('/(tabs)');
      }, 1500);
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

  const renderContent = () => {
    switch (step) {
      case 1:
        return (
          <View className="space-y-4">
            {/* Field 1: Shop Name */}
            <View>
              <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mb-1.5">
                Shop Name <Text className="text-fuchsia-500">*</Text>
              </Text>
              <View className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5 gap-2.5">
                <Building2 size={16} color="#6B4773" />
                <TextInput
                  value={shopName}
                  onChangeText={setShopName}
                  placeholder="e.g. Radha Sarees & Bridal"
                  placeholderTextColor="#928EB2"
                  className="flex-1 text-sm font-bold text-spaceCadet-900"
                  maxLength={200}
                  autoFocus
                />
              </View>
            </View>

            {/* Field 2: Owner Name */}
            <View className="mt-3">
              <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mb-1.5">
                Owner / Manager Name
              </Text>
              <View className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5 gap-2.5">
                <User size={16} color="#6B4773" />
                <TextInput
                  value={ownerName}
                  onChangeText={setOwnerName}
                  placeholder="e.g. Suresh Kumar Verma"
                  placeholderTextColor="#928EB2"
                  className="flex-1 text-sm font-bold text-spaceCadet-900"
                  maxLength={200}
                />
              </View>
            </View>

            {/* Field 3: Primary Clothing Category */}
            <View className="mt-3">
              <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mb-2">
                Primary Specialization
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {SPECIALIZATIONS.map((spec) => {
                  const isSelected = selectedSpecs.includes(spec);
                  return (
                    <AnimatedPressable
                      key={spec}
                      onPress={() => toggleSpec(spec)}
                      accessibilityLabel={spec}
                      accessibilityState={{ selected: isSelected }}
                      /* ponytail: static className + conditional style. A className whose class *set*
                         changes after mount trips react-native-css-interop@0.1.22's dev-only
                         upgrade-warning path, which crashes on JSON.stringify of the element tree. */
                      className="px-3.5 py-2 rounded-2xl border"
                      style={{
                        backgroundColor: isSelected ? '#231F48' : '#FAF9FE',
                        borderColor: isSelected ? '#231F48' : '#E0E1F6',
                      }}
                    >
                      <Text
                        className="text-xs font-bold"
                        style={{ color: isSelected ? '#FFFFFF' : '#231F48' }}
                      >
                        {spec}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </View>
            </View>

            {/* Field 4: Storefront Subdomain URL */}
            <View className="mt-3">
              <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mb-1.5">
                Your Store Web Link
              </Text>
              <View className="flex-row items-center p-3 bg-lavender-100/70 border border-lavender-200 rounded-2xl">
                <Text className="text-xs text-heliotrope-500 font-medium mr-1">kanchuki.app/</Text>
                <Text className="text-xs text-fuchsia-600 font-bold">
                  {slugify(shopName) || 'your-shop-name'}
                </Text>
                <View className="ml-auto">
                  <CheckCircle2 size={16} color="#059669" />
                </View>
              </View>
            </View>

            {/* Field 5: Referral Code */}
            <View className="mt-3">
              <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mb-1.5">
                Referral Code (Optional)
              </Text>
              <View className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5 gap-2.5">
                <TextInput
                  value={referralCode}
                  onChangeText={(t) => setReferralCode(t.toUpperCase())}
                  placeholder="Referred by a Kanchuki agent?"
                  placeholderTextColor="#928EB2"
                  className="flex-1 text-sm font-bold text-spaceCadet-900 tracking-wider"
                  autoCapitalize="characters"
                  maxLength={20}
                />
              </View>
            </View>
          </View>
        );

      case 2:
        return (
          <View className="space-y-4">
            <View>
              <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mb-1.5">
                Shop Address / Street <Text className="text-fuchsia-500">*</Text>
              </Text>
              <View className="bg-lavender-50 border border-lavender-200 rounded-2xl p-3.5">
                <TextInput
                  value={shopAddress}
                  onChangeText={setShopAddress}
                  placeholder="Shop no., building, street, area, landmark"
                  placeholderTextColor="#928EB2"
                  className="text-sm font-bold text-spaceCadet-900"
                  style={{ minHeight: 70, textAlignVertical: 'top' }}
                  multiline
                  maxLength={300}
                  autoFocus
                />
              </View>
            </View>

            <View className="mt-3">
              <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mb-1.5">
                City <Text className="text-fuchsia-500">*</Text>
              </Text>
              <View className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5 gap-2.5">
                <MapPin size={16} color="#6B4773" />
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="e.g. Surat / Jaipur / Delhi"
                  placeholderTextColor="#928EB2"
                  className="flex-1 text-sm font-bold text-spaceCadet-900"
                  maxLength={100}
                />
              </View>
            </View>

            <View className="flex-row gap-3 mt-3">
              <View className="flex-1">
                <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mb-1.5">
                  District
                </Text>
                <View className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5">
                  <TextInput
                    value={district}
                    onChangeText={setDistrict}
                    placeholder="e.g. Surat"
                    placeholderTextColor="#928EB2"
                    className="text-sm font-bold text-spaceCadet-900"
                    maxLength={100}
                  />
                </View>
              </View>

              <View className="flex-1">
                <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mb-1.5">
                  State
                </Text>
                <View className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5">
                  <TextInput
                    value={state}
                    onChangeText={setState}
                    placeholder="e.g. Gujarat"
                    placeholderTextColor="#928EB2"
                    className="text-sm font-bold text-spaceCadet-900"
                    maxLength={100}
                  />
                </View>
              </View>
            </View>

            <View className="mt-3">
              <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mb-1.5">
                Pincode / Zipcode
              </Text>
              <View className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5">
                <TextInput
                  value={pincode}
                  onChangeText={(t) => setPincode(t.replace(/[^0-9]/g, ''))}
                  placeholder="6-digit pincode (e.g. 395002)"
                  keyboardType="number-pad"
                  placeholderTextColor="#928EB2"
                  className="text-sm font-bold text-spaceCadet-900"
                  maxLength={6}
                />
              </View>
            </View>

            {/* Store Tip Box */}
            <View className="bg-lavender-50 border border-lavender-200 rounded-2xl p-3.5 mt-3 flex-row items-start gap-2.5">
              <Text className="text-sm">📍</Text>
              <Text className="flex-1 text-[11px] text-heliotrope-600 leading-relaxed font-medium">
                Your shop location will appear on your customer store links and digital invoices.
              </Text>
            </View>
          </View>
        );

      case 3:
        return (
          <View className="space-y-4">
            <View>
              <Text className="text-[11px] uppercase tracking-wider text-heliotrope-600 font-bold mb-1.5">
                GSTIN (Optional)
              </Text>
              <View className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5 gap-2.5">
                <FileText size={16} color="#6B4773" />
                <TextInput
                  value={gstin}
                  onChangeText={(t) => setGstin(t.toUpperCase())}
                  placeholder="15-digit GSTIN (e.g. 24AAAAA0000A1Z5)"
                  placeholderTextColor="#928EB2"
                  autoCapitalize="characters"
                  className="flex-1 text-sm font-bold text-spaceCadet-900 tracking-wider"
                  maxLength={15}
                  autoFocus
                />
              </View>
              <Text className="text-xs text-heliotrope-500 mt-2 px-1 font-medium">
                Format: 24AAAAA0000A1Z5 · You can also add or update this anytime in Settings.
              </Text>
            </View>

            <View className="bg-lavender-100/70 border border-lavender-200 rounded-2xl p-4 mt-4">
              <View className="flex-row items-center gap-2 mb-1">
                <Sparkles size={14} color="#BB3F95" />
                <Text className="text-spaceCadet-900 text-xs font-bold uppercase tracking-wider">
                  Automatic GST Invoicing
                </Text>
              </View>
              <Text className="text-heliotrope-600 text-xs leading-relaxed font-medium">
                When a customer orders a product via your store link, Kanchuki generates an itemized
                GST invoice automatically.
              </Text>
            </View>
          </View>
        );

      case 4:
        return (
          <View className="items-center w-full">
            <LinearGradient
              colors={['#231F48', '#560A39']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="w-full rounded-3xl p-6 items-center shadow-lg mb-5"
            >
              <View className="w-14 h-14 rounded-2xl bg-white/10 items-center justify-center mb-3 border border-white/20">
                <Sparkles size={28} color="#BB3F95" />
              </View>
              <Text className="text-2xl font-extrabold text-white font-marcellus text-center">
                You&apos;re All Set!
              </Text>
              <Text className="text-xs text-lavender-200 mt-1 text-center font-medium">
                Your digital luxury catalog is ready to receive customers.
              </Text>
            </LinearGradient>

            <View className="w-full gap-3">
              <GradientButton
                label="Go to Dashboard →"
                onPress={() => void handleNext()}
                loading={saving}
              />

              <AnimatedPressable
                onPress={() => void handleCreateStoreQr()}
                className="flex-row items-center gap-3.5 bg-white border border-lavender-200 rounded-3xl p-4 shadow-sm"
              >
                <View className="w-10 h-10 rounded-2xl bg-lavender-100 items-center justify-center border border-lavender-200">
                  <QrCode size={20} color="#231F48" />
                </View>
                <View className="flex-1">
                  <Text className="text-spaceCadet-900 text-xs font-bold uppercase tracking-wider">
                    Create your store QR code
                  </Text>
                  <Text className="text-heliotrope-500 text-[11px] mt-0.5 font-medium">
                    Customers scan to open your luxury catalog
                  </Text>
                </View>
                <Text className="text-heliotrope-400 text-base font-bold">→</Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={() => void handleGetCatalogHelp()}
                className="flex-row items-center gap-3.5 bg-white border border-lavender-200 rounded-3xl p-4 shadow-sm"
              >
                <View className="w-10 h-10 rounded-2xl bg-lavender-100 items-center justify-center border border-lavender-200">
                  <Truck size={20} color="#BB3F95" />
                </View>
                <View className="flex-1">
                  <Text className="text-spaceCadet-900 text-xs font-bold uppercase tracking-wider">
                    Catalog Upload Help
                  </Text>
                  <Text className="text-heliotrope-500 text-[11px] mt-0.5 font-medium">
                    A team member adds your inventory for you
                  </Text>
                </View>
                <Text className="text-heliotrope-400 text-base font-bold">→</Text>
              </AnimatedPressable>
            </View>
          </View>
        );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-[#F8F7FC]"
    >
      {/* ── Fixed Luxury Header ── */}
      <View
        className="bg-white border-b border-lavender-200 px-5 pb-3"
        style={{ paddingTop: insets.top + 8 }}
      >
        {/* Top bar with back button */}
        <View className="flex-row items-center justify-between pt-1 pb-1">
          <View className="w-10 items-start">
            {step > 1 && step < TOTAL_STEPS && (
              <AnimatedPressable
                onPress={() => goToStep((step - 1) as Step)}
                accessibilityLabel="Back"
                accessibilityRole="button"
                className="w-9 h-9 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
              >
                <ChevronLeft size={20} color="#231F48" />
              </AnimatedPressable>
            )}
          </View>
          <Text className="text-base font-bold text-spaceCadet-900 font-marcellus">
            {STEP_META[step].title}
          </Text>
          <View className="w-10" />
        </View>

        {/* Step circles */}
        <StepIndicator currentStep={step} onPress={goToStep} />
      </View>

      {/* ── Main Form Body ── */}
      <ScrollView
        className="flex-1"
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
        {/* Screen Title in Marcellus */}
        <View className="mb-4">
          <Text className="text-2xl font-extrabold text-spaceCadet-900 font-marcellus">
            {STEP_META[step].title}
          </Text>
          <Text className="text-xs text-heliotrope-500 mt-0.5 font-medium">
            {STEP_META[step].subtitle}
          </Text>
        </View>

        {/* Form Container Card */}
        <View className="bg-white border border-lavender-200 rounded-3xl p-5 shadow-sm w-full">
          {renderContent()}
        </View>
      </ScrollView>

      {/* ── Bottom action bar ── */}
      {step < TOTAL_STEPS && (
        <View
          className="bg-white border-t border-lavender-200 px-6 pt-3.5"
          style={{
            paddingBottom: Math.max(12, insets.bottom + 8),
          }}
        >
          <View className="max-w-[540px] w-full self-center">
            <GradientButton
              label={
                showConfetti
                  ? "🎉 You're in!"
                  : step === 1
                    ? 'Save & Proceed to Location'
                    : step === 2
                      ? 'Save & Proceed to GST'
                      : 'Complete Setup →'
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
                className="items-center justify-center py-2.5 mt-1"
              >
                <Text className="text-xs font-bold text-fuchsia-600 uppercase tracking-wider">
                  Skip — I don&apos;t have a GST number
                </Text>
              </AnimatedPressable>
            )}

            {/* Legal consent line */}
            <Text className="text-center text-[11px] text-heliotrope-500 mt-2 px-2 leading-4 font-medium">
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
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
