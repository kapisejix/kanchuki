import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
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
    // Reduce Motion: skip the decorative particle animation — the "Done" step's
    // own text already carries the completion state, confetti is decoration only
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

// ─── Step Indicator (fixed row — never scrolls off-screen) ───────
function StepIndicator({
  currentStep,
  onPress,
}: {
  currentStep: Step;
  onPress: (step: Step) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-start justify-center px-8 pt-3 pb-4">
      {([1, 2, 3, 4] as Step[]).map((s, i) => {
        const isActive = s === currentStep;
        const isPast = s < currentStep;
        return (
          <View key={s} className="flex-row items-start">
            {/* Connector line between circles */}
            {i > 0 && (
              <View
                className="h-0.5 w-6 rounded-full mt-[17px]"
                style={{
                  backgroundColor: s <= currentStep ? colors.rust[400] : 'rgba(255,255,255,0.25)',
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
                className={`w-9 h-9 rounded-full items-center justify-center border-2 ${
                  isActive
                    ? 'bg-rust-500 border-rust-300'
                    : isPast
                      ? 'bg-white/15 border-rust-300/70'
                      : 'bg-transparent border-white/40'
                }`}
              >
                <Text
                  className={`text-sm font-bold ${
                    isActive ? 'text-ink-900' : isPast ? 'text-white' : 'text-white/70'
                  }`}
                >
                  {isPast ? '✓' : s}
                </Text>
              </View>
              <Text
                className={`text-[10px] font-medium ${
                  isActive ? 'text-white' : isPast ? 'text-white/80' : 'text-white/50'
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

// ─── Form field wrapper ─────────────────────────────────────────────
// Light label above a white input. The drop shadow lives on a wrapper View
// (not the TextInput) so every field shares one definition — white field on
// the dark body, soft shadow, light border line (the border itself stays on
// the input via `inputClass` below). iOS rounds the shadow with the
// wrapper's rounded-2xl; Android renders it square-ish — acceptable.
const fieldShadow: ViewStyle = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 10,
  elevation: 5,
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
    <View className="mt-4">
      <Text className="text-sm font-semibold text-sand-100 mb-2">
        {label}
        {required && <Text style={{ color: colors.rust[500] }}> *</Text>}
        {optional && <Text className="text-sand-300 font-normal"> (optional)</Text>}
      </Text>
      <View className="rounded-2xl" style={fieldShadow}>
        {children}
      </View>
    </View>
  );
}

// White field + light outer border line, over the dark body (shadow applied
// by the Field wrapper).
const inputClass =
  'bg-white border border-sand-200 rounded-2xl px-4 py-4 text-base text-sand-900';

// ─── Main Screen ──────────────────────────────────────────────────
export default function OnboardingScreen() {
  const { colors, primaryColor } = useTheme();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // ── Animated values for transitions ──
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  // single choke point for the "stuck off-screen" race (see goToStep below) —
  // every step-change path (Continue, back arrow, step dots) routes through
  // goToStep, so guarding there covers all of them.
  const transitioningRef = useRef(false);

  // ── Form state ──
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [locating, setLocating] = useState(false);
  const [gstin, setGstin] = useState('');
  const [referralCode, setReferralCode] = useState('');

  const handleUseCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location access is needed to auto-fill your address.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const [place] = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      if (place) {
        if (place.city) setCity(place.city);
        if (place.district || place.subregion) setDistrict(place.district ?? place.subregion ?? '');
        if (place.region) setState(place.region);
        if (place.postalCode) setPincode(place.postalCode);
      }
    } catch {
      Alert.alert('Error', 'Could not detect your location. Please enter it manually.');
    } finally {
      setLocating(false);
    }
  };

  const canProceed = useCallback((): boolean => {
    if (step === 1) return shopName.trim().length >= 2;
    if (step === 2) return shopAddress.trim().length >= 5;
    if (step === 3) return true; // GST optional
    return true;
  }, [step, shopName, shopAddress]);

  const animateTransition = useCallback(
    (direction: 'forward' | 'back', onComplete: () => void) => {
      // Reduce Motion: crossfade only, no horizontal slide (HIG/Material guidance)
      const toValue = reduceMotion ? 0 : direction === 'forward' ? -1 : 1;
      slideAnim.setValue(0);
      fadeAnim.setValue(1);
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onComplete();
        slideAnim.setValue(reduceMotion ? 0 : direction === 'forward' ? 1 : -1);
        fadeAnim.setValue(0.5);
        Animated.parallel([
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // force the rest state instead of trusting the animation finished
          // cleanly — an interrupted/dropped return-phase (e.g. two transitions
          // racing) otherwise leaves slideAnim stuck off-zero, permanently
          // shifting that step's content off-screen.
          slideAnim.setValue(0);
          fadeAnim.setValue(1);
          transitioningRef.current = false;
        });
      });
    },
    [slideAnim, fadeAnim, reduceMotion],
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

  // Android hardware back steps to the previous step instead of popping the
  // whole onboarding screen (the header arrow is the only on-screen back).
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
    // Continue wasn't disabled during steps' network calls — a slow/double tap
    // could fire goToStep() twice concurrently, and two overlapping slide
    // animations can leave the Animated.Value stuck off-zero, permanently
    // shifting that step's content off-screen. Gating every step on `saving`
    // (not just the final one) blocks the re-entry. `showConfetti` also guards
    // the step-4 in-content buttons during the 2.5s confetti window (the
    // bottom GradientButton is already disabled via props).
    if (saving || showConfetti) return;
    setSaving(true);
    try {
      // Save step progress to server
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

  // Completes the profile + onboarding flags, and mirrors the fresh state
  // into the ['retailer', 'me'] query cache. The (tabs) dashboard gate reads
  // onboarding_completed from that cache — without this write, a stale
  // cached `false` (an earlier gate fetch during a dropped-off signup, or the
  // persisted offline cache from a previous session) is still within the 60s
  // staleTime when router.replace('/') lands, so the gate never refetches and
  // bounces the user straight back to onboarding step 1 — even though the DB
  // has the correct values.
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
    // Background refetch so the dashboard also gets the fresh profile fields.
    void queryClient.invalidateQueries({ queryKey: ['retailer', 'me'] });
  };

  // "Get help adding your catalog" — same final save (onboarding completes, so
  // no gate bounce can follow), then the F-019 paid catalog-upload flow
  // instead of a bare router.replace('/') that bounced back to step 1.
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

  // QR nudge on the final step — same final save (onboarding completes, so no
  // gate bounce can follow), then the Store QR screen instead of the dashboard:
  // the retailer generates their store QR code right after setup (public_slug
  // is null there until they tap "Generate QR Code", so the button shows).
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
          <View>
            <Text className="text-sand-300 text-sm leading-5">
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
                autoFocus
                maxLength={200}
              />
            </Field>

            <Field label="Your name" optional>
              <TextInput
                value={ownerName}
                onChangeText={setOwnerName}
                placeholder="e.g. Priya Sharma (optional)"
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

            <GradientBorderCard
              fill={colors.sand[100]}
              colors={[`${colors.sand[200]}00`, `${colors.ink[400]}66`, `${colors.sand[200]}00`]}
              style={{ marginTop: 24 }}
            >
              <View className="p-4">
                <Text className="text-ink-700 text-sm font-medium">✨ What happens next?</Text>
                <Text className="text-ink-600 text-sm mt-1 leading-5">
                  Add your shop details, then take a photo of any product — AI will automatically
                  tag it with category, color & fabric.
                </Text>
              </View>
            </GradientBorderCard>
          </View>
        );

      case 2:
        return (
          <View>
            <Text className="text-sand-300 text-sm leading-5">
              Customers use this to find your store
            </Text>

            <AnimatedPressable
              onPress={() => void handleUseCurrentLocation()}
              disabled={locating}
              className="mt-5 flex-row items-center justify-center gap-2 bg-white border border-sand-200 rounded-2xl px-4 py-3.5"
              style={fieldShadow}
            >
              {locating ? (
                <ActivityIndicator size="small" color={colors.ink[600]} />
              ) : (
                <Text className="text-ink-700 text-sm font-semibold">📍 Use current location</Text>
              )}
            </AnimatedPressable>
            <Text className="text-xs text-sand-300 mt-2 px-1">
              Autofill isn't always precise — check and correct the fields below before continuing.
            </Text>

            <Field label="Shop address" required>
              <TextInput
                value={shopAddress}
                onChangeText={setShopAddress}
                placeholder="Shop no., street, landmark — e.g. Shop 12, MG Road, near City Mall"
                className={inputClass}
                style={{ minHeight: 96, textAlignVertical: 'top' }}
                placeholderTextColor={colors.sand[400]}
                autoFocus
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

            <Field label="Zipcode">
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
          <View>
            <Text className="text-sand-300 text-sm leading-5">
              Required for generating GST invoices for your customers
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
                autoFocus
              />
            </Field>
            <Text className="text-xs text-sand-300 mt-2 px-1">
              Format: 22AAAAA0000A1Z5 · You can add this later
            </Text>

            <GradientBorderCard
              fill={colors.turmeric[50]}
              colors={[
                `${colors.turmeric[100]}00`,
                `${colors.rust[600]}66`,
                `${colors.turmeric[100]}00`,
              ]}
              style={{ marginTop: 24 }}
            >
              <View className="p-4">
                <Text className="text-turmeric-800 text-sm font-medium">💡 GST invoice tip</Text>
                <Text className="text-turmeric-700 text-sm mt-1 leading-5">
                  When a customer enquires about a product, Kanchuki can generate a GST invoice
                  automatically. Add your GSTIN now or skip and do it later from Settings.
                </Text>
              </View>
            </GradientBorderCard>
          </View>
        );

      case 4:
        return (
          <View className="pt-4 items-center">
            {/* Big celebration emoji — signature gradient moment */}
            <LinearGradient
              colors={[colors.rust[400], colors.rust[700]]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 128,
                height: 128,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
              }}
            >
              <Text className="text-6xl">🎉</Text>
            </LinearGradient>

            <Text className="text-2xl font-bold text-white text-center">Congratulations!</Text>
            <Text className="text-sand-300 text-base mt-2 text-center">
              Your store has been built.
            </Text>

            <View className="mt-8 w-full gap-3">
              <AnimatedPressable
                onPress={() => void handleNext()}
                className="bg-rust-500 rounded-2xl p-4 items-center"
              >
                <Text className="text-ink-900 text-sm font-bold">Go to Dashboard</Text>
              </AnimatedPressable>

              <AnimatedPressable
                onPress={() => void handleCreateStoreQr()}
                className="flex-row items-center gap-3 bg-white border-2 border-sand-200 rounded-2xl p-4"
              >
                <View className="w-10 h-10 rounded-xl bg-ink-50 items-center justify-center">
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
                className="flex-row items-center gap-3 bg-white border-2 border-sand-200 rounded-2xl p-4"
              >
                <View className="w-10 h-10 rounded-xl bg-ink-50 items-center justify-center">
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
      className="flex-1 bg-ink-900"
    >
      {/* Confetti overlay */}
      <ConfettiOverlay visible={showConfetti} />

      {/* ── Gradient header: back + title + progress + step circles ── */}
      <LinearGradient
        colors={[primaryColor, colors.ink[800]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 8 }}
      >
        {/* Top row */}
        <View className="flex-row items-center px-4 pt-2 pb-1">
          <View className="w-10 items-start">
            {step > 1 && step < TOTAL_STEPS && (
              <AnimatedPressable
                onPress={() => goToStep((step - 1) as Step)}
                accessibilityLabel="Back"
                accessibilityRole="button"
                className="w-10 h-10 rounded-full bg-white/10 items-center justify-center active:bg-white/20"
              >
                <Text className="text-white text-xl font-medium">‹</Text>
              </AnimatedPressable>
            )}
          </View>
          <Text className="flex-1 text-center text-white text-lg font-bold">
            {STEP_META[step].title}
          </Text>
          <View className="w-10" />
        </View>

        {/* Progress line */}
        <View className="h-1 bg-white/20 mx-6 mt-1 rounded-full overflow-hidden">
          <View
            className="h-full bg-rust-400 rounded-full"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </View>

        {/* Step circles */}
        <StepIndicator currentStep={step} onPress={goToStep} />
      </LinearGradient>

      {/* ── Dark card overlapping the header ──
          Shadow lives on the outer wrapper; rounded-t + overflow-hidden on the
          inner view. RN clips a View's own shadow when overflow: 'hidden' is on
          the same node (iOS masksToBounds), so splitting the two layers is what
          actually renders the drop shadow the design calls for. */}
      <View
        className="flex-1 -mt-4"
        style={{
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 8,
        }}
      >
        <View className="flex-1 bg-ink-800 rounded-t-3xl overflow-hidden">
        {/* Content with animated transitions */}
        <Animated.View
          className="flex-1 px-6 pt-6"
          style={{
            opacity: fadeAnim,
            transform: [
              {
                translateX: slideAnim.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [-60, 0, 60],
                }),
              },
            ],
          }}
        >
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderContent()}
            <View className="h-10" />
          </ScrollView>
        </Animated.View>
        </View>
      </View>

      {/* ── Bottom action bar ── */}
      <View
        className="bg-ink-900 border-t border-white/10 px-6 pt-4"
        style={{ paddingBottom: 12 + insets.bottom }}
      >
        <GradientButton
          label={
            showConfetti ? "🎉 You're in!" : step === TOTAL_STEPS ? 'Go to Dashboard' : 'Continue →'
          }
          onPress={() => void handleNext()}
          disabled={!canProceed() || showConfetti || saving}
          loading={saving}
        />

        {/* GST step — explicit skip affordance. GSTIN is already optional
            (Continue advances with an empty field); this makes it clear a
            retailer without a GST number can move on and add it later from
            Settings. Same handleNext path, so progress still saves. */}
        {step === 3 && (
          <AnimatedPressable
            onPress={() => void handleNext()}
            disabled={saving || showConfetti}
            accessibilityLabel="Skip — continue without a GST number"
            accessibilityRole="button"
            className="items-center justify-center py-2.5 mt-1"
          >
            <Text className="text-sm font-semibold text-rust-400">
              Skip — I don't have a GST number
            </Text>
          </AnimatedPressable>
        )}

        {/* Legal consent line */}
        {step < TOTAL_STEPS && (
          <Text className="text-center text-xs text-sand-300 mt-3 px-2 leading-4">
            By continuing, you agree to our{' '}
            <Text
              className="font-semibold text-rust-400"
              onPress={() => void Linking.openURL(`${WEB_URL}/terms`)}
            >
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text
              className="font-semibold text-rust-400"
              onPress={() => void Linking.openURL(`${WEB_URL}/privacy`)}
            >
              Privacy Policy
            </Text>
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
