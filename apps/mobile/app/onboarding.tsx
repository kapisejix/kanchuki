import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
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
import { GradientBorderCard } from '../src/components/GradientBorderCard';
import { GradientButton } from '../src/components/GradientButton';
import { useReduceMotion } from '../src/hooks/useReduceMotion';
import { retailerApi } from '../src/lib/api';
import { useTheme } from '../src/lib/theme';
import { WEB_URL } from '../src/lib/web-url';

type Step = 1 | 2 | 3 | 4;
const TOTAL_STEPS = 4;

// ─── Step config ──────────────────────────────────────────────────
const STEP_META: Record<Step, { label: string; title: string }> = {
  1: { label: 'Shop', title: "Let's set up your shop" },
  2: { label: 'Location', title: "Where's your shop?" },
  3: { label: 'GST', title: 'GST details' },
  4: { label: 'Done', title: "You're all set!" },
};

// ─── Confetti Particle ────────────────────────────────────────────
interface Particle {
  x: Animated.Value;
  y: Animated.Value;
  rotate: Animated.Value;
  opacity: Animated.Value;
  emoji: string;
  xStart: number;
}

function ConfettiOverlay({ visible }: { visible: boolean }) {
  const reduceMotion = useReduceMotion();
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    if (!visible || reduceMotion) {
      setParticles([]);
      return;
    }
    const emojis = ['🎊', '✨', '🌟', '💫', '🎉', '⭐', '🔮', '👏'];
    const { width: w, height: h } = Dimensions.get('window');

    const newParticles: Particle[] = Array.from({ length: 20 }, (_, i) => {
      const xStart = Math.random() * w;
      return {
        x: new Animated.Value(xStart),
        y: new Animated.Value(-60 - Math.random() * 200),
        rotate: new Animated.Value(0),
        opacity: new Animated.Value(1),
        emoji: emojis[i % emojis.length],
        xStart,
      };
    });
    setParticles(newParticles);

    const anims = newParticles.map((p) =>
      Animated.parallel([
        Animated.timing(p.y, {
          toValue: h + 100,
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        }),
        Animated.timing(p.x, {
          toValue: p.xStart + (Math.random() - 0.5) * 200,
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        }),
        Animated.timing(p.rotate, {
          toValue: Math.random() * 720 - 360,
          duration: 3000 + Math.random() * 2000,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(Math.random() * 1500),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    const composite = Animated.stagger(80, anims);
    composite.start();

    return () => {
      composite.stop();
      for (const p of newParticles) {
        p.x.stopAnimation();
        p.y.stopAnimation();
        p.rotate.stopAnimation();
        p.opacity.stopAnimation();
      }
    };
  }, [visible, reduceMotion]);

  if (!visible || particles.length === 0) return null;

  return (
    <View className="absolute inset-0" pointerEvents="none" style={{ zIndex: 100 }}>
      {particles.map((p, i) => (
        <Animated.Text
          key={i}
          className="absolute text-2xl"
          style={{
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              {
                rotate: p.rotate.interpolate({
                  inputRange: [-360, 360],
                  outputRange: ['-360deg', '360deg'],
                }),
              },
            ],
            opacity: p.opacity,
          }}
        >
          {p.emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

// ─── Step Indicator (Fixed Light Header) ───────────────────────────
function StepIndicator({
  currentStep,
  onPress,
}: {
  currentStep: Step;
  onPress: (step: Step) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-start justify-center px-6 pt-3 pb-3">
      {([1, 2, 3, 4] as Step[]).map((s, i) => {
        const isActive = s === currentStep;
        const isPast = s < currentStep;
        return (
          <View key={s} className="flex-row items-start">
            {/* Connector line between circles */}
            {i > 0 && (
              <View
                className="h-0.5 w-6 sm:w-8 rounded-full mt-[16px]"
                style={{
                  backgroundColor: isPast || isActive ? colors.rust[500] : colors.sand[200],
                }}
              />
            )}
            <AnimatedPressable
              onPress={() => isPast && onPress(s)}
              disabled={!isPast}
              accessibilityLabel={STEP_META[s].label}
              accessibilityRole="button"
              className="items-center gap-1.5 px-0.5"
            >
              <View
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full items-center justify-center border-2 ${
                  isActive
                    ? 'bg-rust-500 border-rust-600 shadow-sm'
                    : isPast
                      ? 'bg-rust-100 border-rust-400'
                      : 'bg-white border-sand-300'
                }`}
              >
                <Text
                  className={`text-xs sm:text-sm font-bold ${
                    isActive ? 'text-white' : isPast ? 'text-rust-700' : 'text-sand-400'
                  }`}
                >
                  {isPast ? '✓' : s}
                </Text>
              </View>
              <Text
                className={`text-[10px] sm:text-xs font-semibold ${
                  isActive ? 'text-sand-900' : isPast ? 'text-sand-700' : 'text-sand-400'
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

// ─── Form field wrapper (Light Mode) ────────────────────────────────
const fieldShadow: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.04,
  shadowRadius: 3,
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
  const { colors } = useTheme();
  return (
    <View className="mt-4 w-full">
      <Text className="text-sm font-semibold text-sand-800 mb-1.5">
        {label}
        {required && <Text style={{ color: colors.rust[600] }}> *</Text>}
        {optional && <Text className="text-sand-400 font-normal"> (optional)</Text>}
      </Text>
      <View className="rounded-2xl w-full" style={fieldShadow}>
        {children}
      </View>
    </View>
  );
}

const inputClass =
  'bg-white border border-sand-300 focus:border-rust-500 rounded-2xl px-4 py-3.5 text-base text-sand-900 w-full';

// ─── Main Screen ──────────────────────────────────────────────────
export default function OnboardingScreen() {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // ── Animated values for transitions (Clean Fade & Settle) ──
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const translateYAnim = useRef(new Animated.Value(0)).current;
  const transitioningRef = useRef(false);

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

  const canProceed = useCallback((): boolean => {
    if (step === 1) return shopName.trim().length >= 2;
    if (step === 2) return shopAddress.trim().length >= 5;
    if (step === 3) return true; // GST optional
    return true;
  }, [step, shopName, shopAddress]);

  const animateTransition = useCallback(
    (_direction: 'forward' | 'back', onComplete: () => void) => {
      if (reduceMotion) {
        onComplete();
        transitioningRef.current = false;
        return;
      }

      // Smooth vertical crossfade without horizontal shifts to prevent screen cutoff
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(translateYAnim, {
          toValue: -8,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onComplete();
        translateYAnim.setValue(8);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 160,
            useNativeDriver: true,
          }),
          Animated.timing(translateYAnim, {
            toValue: 0,
            duration: 160,
            useNativeDriver: true,
          }),
        ]).start(() => {
          fadeAnim.setValue(1);
          translateYAnim.setValue(0);
          transitioningRef.current = false;
        });
      });
    },
    [fadeAnim, translateYAnim, reduceMotion],
  );

  const goToStep = useCallback(
    (s: Step) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;
      const dir = s > step ? 'forward' : 'back';
      animateTransition(dir, () => setStep(s));
    },
    [step, animateTransition],
  );

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

      if (step < TOTAL_STEPS) {
        await retailerApi.updateOnboarding(nextStep);
        goToStep(nextStep);
        return;
      }

      // Final step — save full profile and redirect
      await saveFinalStep();
      setShowConfetti(true);
      setTimeout(() => {
        router.replace('/');
      }, 2500);
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveFinalStep = async () => {
    await retailerApi.update({
      shop_name: shopName.trim(),
      owner_name: ownerName.trim() || undefined,
      address_line1: shopAddress.trim(),
      city: city.trim() || undefined,
      address_line2: district.trim() || undefined,
      state: state || undefined,
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
      }, 2500);
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
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
      }, 2500);
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderContent = () => {
    switch (step) {
      case 1:
        return (
          <View className="w-full">
            <Text className="text-sand-600 text-sm leading-5 mb-2">
              Create your digital store in minutes — AI catalogs your products and shares them with
              customers on WhatsApp.
            </Text>

            <Field label="Shop name" required>
              <TextInput
                value={shopName}
                onChangeText={setShopName}
                placeholder="e.g. Priya Fashion House"
                className={inputClass}
                placeholderTextColor={colors.sand[400]}
                maxLength={200}
              />
            </Field>

            <Field label="Your name" optional>
              <TextInput
                value={ownerName}
                onChangeText={setOwnerName}
                placeholder="e.g. Priya Sharma"
                className={inputClass}
                placeholderTextColor={colors.sand[400]}
                maxLength={200}
              />
            </Field>

            <Field label="Referral code" optional>
              <TextInput
                value={referralCode}
                onChangeText={(t) => setReferralCode(t.toUpperCase())}
                placeholder="Referred by a Kanchuki salesperson?"
                className={`${inputClass} tracking-wide`}
                placeholderTextColor={colors.sand[400]}
                autoCapitalize="characters"
                maxLength={20}
              />
            </Field>

            <View className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 mt-6 w-full">
              <Text className="text-amber-900 text-sm font-semibold">✨ What happens next?</Text>
              <Text className="text-amber-800 text-xs sm:text-sm mt-1 leading-5">
                Add your shop details, then take a photo of any product — AI will automatically tag
                it with category, color & fabric.
              </Text>
            </View>
          </View>
        );

      case 2:
        return (
          <View className="w-full">
            <Text className="text-sand-600 text-sm leading-5 mb-2">
              Customers use your shop address and location to discover your store.
            </Text>

            <Field label="Shop address" required>
              <TextInput
                value={shopAddress}
                onChangeText={setShopAddress}
                placeholder="Shop no., street, landmark — e.g. Shop 12, MG Road, near City Mall"
                className={inputClass}
                style={{ minHeight: 96, textAlignVertical: 'top' }}
                placeholderTextColor={colors.sand[400]}
                multiline
                maxLength={300}
              />
            </Field>

            <Field label="City">
              <TextInput
                value={city}
                onChangeText={setCity}
                placeholder="e.g. Jaipur"
                className={inputClass}
                placeholderTextColor={colors.sand[400]}
                maxLength={100}
              />
            </Field>

            <Field label="District">
              <TextInput
                value={district}
                onChangeText={setDistrict}
                placeholder="e.g. Jaipur District"
                className={inputClass}
                placeholderTextColor={colors.sand[400]}
                maxLength={100}
              />
            </Field>

            <Field label="State">
              <TextInput
                value={state}
                onChangeText={setState}
                placeholder="e.g. Rajasthan"
                className={inputClass}
                placeholderTextColor={colors.sand[400]}
                maxLength={100}
              />
            </Field>

            <Field label="Zipcode / Pincode">
              <TextInput
                value={pincode}
                onChangeText={(t) => setPincode(t.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 302001"
                keyboardType="number-pad"
                className={inputClass}
                placeholderTextColor={colors.sand[400]}
                maxLength={6}
              />
            </Field>
          </View>
        );

      case 3:
        return (
          <View className="w-full">
            <Text className="text-sand-600 text-sm leading-5 mb-2">
              Required for generating GST invoices for your customers.
            </Text>

            <Field label="GSTIN">
              <TextInput
                value={gstin}
                onChangeText={(t) => setGstin(t.toUpperCase())}
                placeholder="15-digit GSTIN"
                className={`${inputClass} font-mono tracking-widest`}
                placeholderTextColor={colors.sand[400]}
                autoCapitalize="characters"
                maxLength={15}
              />
            </Field>
            <Text className="text-xs text-sand-500 mt-2 px-1">
              Format: 22AAAAA0000A1Z5 · You can also add or update this later
            </Text>

            <View className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 mt-6 w-full">
              <Text className="text-amber-900 text-sm font-semibold">💡 GST invoice tip</Text>
              <Text className="text-amber-800 text-xs sm:text-sm mt-1 leading-5">
                When a customer enquires about a product, Kanchuki can generate a GST invoice
                automatically. Add your GSTIN now or skip and do it later from Settings.
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
                width: 110,
                height: 110,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 10,
                elevation: 4,
              }}
            >
              <Text className="text-5xl">🎉</Text>
            </LinearGradient>

            <Text className="text-2xl font-bold text-sand-900 text-center">Congratulations!</Text>
            <Text className="text-sand-600 text-sm sm:text-base mt-1.5 text-center">
              Your store has been set up successfully.
            </Text>

            <View className="mt-7 w-full gap-3">
              <AnimatedPressable
                onPress={() => void handleNext()}
                className="bg-rust-500 rounded-2xl p-4 items-center shadow-sm active:bg-rust-600"
              >
                <Text className="text-white text-base font-bold">Go to Dashboard</Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={() => void handleCreateStoreQr()}
                className="flex-row items-center gap-3 bg-white border border-sand-300 rounded-2xl p-4 shadow-sm"
              >
                <View className="w-10 h-10 rounded-xl bg-sand-100 items-center justify-center">
                  <Text className="text-xl">🔳</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sand-900 text-sm font-bold">Create your store QR code</Text>
                  <Text className="text-sand-500 text-xs mt-0.5">
                    Customers scan it to open your catalog — share it at the counter
                  </Text>
                </View>
                <Text className="text-sand-400 text-lg">→</Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={() => void handleGetCatalogHelp()}
                className="flex-row items-center gap-3 bg-white border border-sand-300 rounded-2xl p-4 shadow-sm"
              >
                <View className="w-10 h-10 rounded-xl bg-sand-100 items-center justify-center">
                  <Text className="text-xl">🧑‍💼</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sand-900 text-sm font-bold">
                    Get help adding your catalog
                  </Text>
                  <Text className="text-sand-500 text-xs mt-0.5">
                    A paid Kanchuki team visit uploads it for you — skip anytime
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
      className="flex-1 bg-sand-50"
    >
      {/* Confetti overlay */}
      <ConfettiOverlay visible={showConfetti} />

      {/* ── Fixed Light Header: back + title + progress + step circles ── */}
      <View
        className="bg-white border-b border-sand-200"
        style={{
          paddingTop: insets.top + 6,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          elevation: 2,
        }}
      >
        {/* Top bar */}
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

      {/* ── Main Form Body (Light & Perfectly Centered) ── */}
      <View className="flex-1 bg-sand-50">
        <ScrollView
          className="flex-1 w-full"
          contentContainerStyle={{
            flexGrow: 1,
            maxWidth: 540,
            width: '100%',
            alignSelf: 'center',
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 28,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Animated Form Content */}
          <Animated.View
            className="w-full"
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: translateYAnim }],
            }}
          >
            <View className="bg-white border border-sand-200/90 rounded-3xl p-5 sm:p-7 shadow-sm w-full">
              {renderContent()}
            </View>
          </Animated.View>
        </ScrollView>
      </View>

      {/* ── Bottom action bar (Light Mode) ── */}
      <View
        className="bg-white border-t border-sand-200 px-6 pt-3.5"
        style={{
          paddingBottom: Math.max(12, insets.bottom + 8),
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.04,
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

          {/* GST step skip affordance */}
          {step === 3 && (
            <AnimatedPressable
              onPress={() => void handleNext()}
              disabled={saving || showConfetti}
              accessibilityLabel="Skip — continue without a GST number"
              accessibilityRole="button"
              className="items-center justify-center py-2.5 mt-1"
            >
              <Text className="text-sm font-semibold text-rust-600">
                Skip — I don&apos;t have a GST number
              </Text>
            </AnimatedPressable>
          )}

          {/* Legal consent line */}
          {step < TOTAL_STEPS && (
            <Text className="text-center text-xs text-sand-500 mt-2.5 px-2 leading-4">
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
