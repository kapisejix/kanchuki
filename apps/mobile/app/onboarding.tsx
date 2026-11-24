import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  FileText,
  MapPin,
  QrCode,
  Truck,
  User,
  Zap,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../src/components/AnimatedPressable';
import { GooglePlaceField } from '../src/components/GooglePlaceField';
import { GradientButton } from '../src/components/GradientButton';
import { KeyboardScreen } from '../src/components/KeyboardScreen';
import { retailerApi } from '../src/lib/api';
import { CATALOG_UPLOAD_ENABLED } from '../src/lib/catalog-upload-flag';
import { showError } from '../src/lib/errors';
import { resolveMapsLink } from '../src/lib/maps-link';
import { showPinReview } from '../src/lib/pin-alert';
import { reviewPin } from '../src/lib/pin-check';
import { clearCapturedReferralCode, getCapturedReferralCode } from '../src/lib/referral-capture';
import { WEB_URL } from '../src/lib/web-url';

type Step = 1 | 2 | 3 | 4 | 5;
const TOTAL_STEPS = 5;

const SPECIALIZATIONS = ['Women', 'Men', 'Kids'];

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
    title: 'Set up your shop',
    subtitle: 'Digitize your catalog and create your custom WhatsApp store URL.',
  },
  2: {
    label: 'Location',
    title: 'Shop location',
    subtitle: 'Add your shop address so local customers can easily discover and visit your store.',
  },
  3: {
    label: 'GST',
    title: 'GST details',
    subtitle: 'Optional — add your GSTIN now to enable automatic GST invoice generation.',
  },
  4: {
    label: 'Plan',
    title: 'Start your free demo',
    subtitle: 'Explore Kanchuki with full Pro access. No payment needed.',
  },
  5: {
    label: 'Done',
    title: "You're all set",
    subtitle: 'Your catalog is ready. Add products or create your store QR.',
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
      {([1, 2, 3, 4] as Step[]).map((s, i) => {
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
                className={`w-7 h-7 rounded-full items-center justify-center border overflow-hidden ${
                  isActive
                    ? 'bg-spaceCadet-900 border-spaceCadet-900'
                    : isPast
                      ? 'bg-fuchsia-500 border-fuchsia-500'
                      : 'bg-white border-lavender-200'
                }`}
              >
                <Text
                  className={`text-[11px] font-semibold ${
                    isActive || isPast ? 'text-white' : 'text-heliotrope-500'
                  }`}
                >
                  {isPast ? '✓' : s}
                </Text>
              </View>
              <Text
                className={`text-xs ${
                  isActive
                    ? 'text-spaceCadet-900 font-semibold'
                    : isPast
                      ? 'text-heliotrope-700 font-semibold'
                      : 'text-heliotrope-500 font-medium'
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
  // Sync guard: `saving` state reaches the handlers a render late, so two taps in
  // one tick (or Dashboard + QR) would both pass it and save/redirect twice.
  const busyRef = useRef(false);

  // ── Form state ──
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [selectedSpecs, setSelectedSpecs] = useState<string[]>(['Women']);
  const [shopAddress, setShopAddress] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [mapsLink, setMapsLink] = useState('');
  const [resolvingLink, setResolvingLink] = useState(false);
  const [gstin, setGstin] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string | null>('DEMO');
  const [consentGiven, setConsentGiven] = useState(false);

  // 5B.2: prefill (never submit) a code captured from a ?ref= app link. Only
  // fills an empty field, so a code the retailer typed is never overwritten.
  useEffect(() => {
    void getCapturedReferralCode().then((code) => {
      if (code) setReferralCode((current) => current || code);
    });
  }, []);

  const toggleSpec = (spec: string) => {
    setSelectedSpecs((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec],
    );
  };

  // ── Validation ──
  const canProceed = useCallback((): boolean => {
    if (step === 1) return shopName.trim().length >= 2 && consentGiven;
    if (step === 2) return shopAddress.trim().length >= 2 || city.trim().length >= 2;
    if (step === 3) return true; // GST is optional
    if (step === 4) return selectedPlan !== null; // must pick a plan
    return true;
  }, [step, shopName, shopAddress, city, selectedPlan, consentGiven]);

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
    if (busyRef.current || saving || showConfetti) return;
    busyRef.current = true;
    setSaving(true);
    try {
      const nextStep = (step + 1) as Step;

      if (step === 1) {
        await retailerApi.update({
          shop_name: shopName.trim(),
          owner_name: ownerName.trim() || undefined,
          referral_code: referralCode.trim() || undefined,
        });
        // Saved (the server validated it): the captured code has done its job.
        void clearCapturedReferralCode().catch(() => {});
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
          ...(latitude !== null && longitude !== null ? { latitude, longitude } : {}),
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

      if (step === 4) {
        // Demo → demo_plan flag (grants PRO/TRIAL server-side).
        await retailerApi.updateOnboarding(4, undefined, { demo_plan: true });
        goToStep(nextStep);
        return;
      }

      // Final step (5) — save full profile and redirect. Stack.Protected
      // guards already make Login unreachable; replace (not push) so this
      // screen can't linger beneath the dashboard either.
      await saveFinalStep();
      setShowConfetti(true);
      setTimeout(() => {
        router.replace('/(tabs)');
      }, 1500);
    } catch (err) {
      showError(err, 'Could not save details. Please check your connection and try again.');
    } finally {
      busyRef.current = false;
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
    // #1: Ensure the storefront slug + QR exist right after onboarding —
    // POST /me/qr-slug is get-or-create and derives the slug from shop_name.
    // Best-effort: a failure must never block completing onboarding (the
    // Store QR screen can still create it on demand).
    try {
      await retailerApi.getQrSlug();
    } catch {
      // ignore — slug can be generated later from the Store QR screen
    }
    const onboardingRes = await retailerApi.updateOnboarding(TOTAL_STEPS as number, true);
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
    if (busyRef.current || saving || showConfetti) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await saveFinalStep();
      setShowConfetti(true);
      setTimeout(() => {
        router.replace('/settings/catalog-upload');
      }, 1500);
    } catch (err) {
      showError(err, 'Could not save details. Please try again.');
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const handleCreateStoreQr = async () => {
    if (busyRef.current || saving || showConfetti) return;
    busyRef.current = true;
    setSaving(true);
    try {
      await saveFinalStep();
      setShowConfetti(true);
      setTimeout(() => {
        router.replace('/store-profile');
      }, 1500);
    } catch (err) {
      showError(err, 'Could not save details. Please try again.');
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  };

  const handleGetLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission',
          'Please enable location access in your device settings to use this feature.',
        );
        setLocating(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await applyPoint(loc.coords.latitude, loc.coords.longitude);
    } catch {
      Alert.alert('Location Error', 'Could not get your current location. Please try again.');
    } finally {
      setLocating(false);
    }
  };

  // Paste a Google Maps "Share" link instead of using GPS — same review as GPS.
  const handleUseMapsLink = async () => {
    setResolvingLink(true);
    try {
      const point = await resolveMapsLink(mapsLink);
      if (!point) {
        Alert.alert(
          'Link not recognised',
          'Open your shop in Google Maps, tap Share, and paste that link here.',
        );
        return;
      }
      setMapsLink('');
      await applyPoint(point.lat, point.lng);
    } finally {
      setResolvingLink(false);
    }
  };

  // One flow for GPS and pasted links: keep the pin, fill any EMPTY address fields from where
  // it landed (typed values are never overwritten), then show the nearby address with
  // Use this pin / Clear pin. The typed address is read before the fill, so the mismatch
  // warning compares against what the retailer actually typed.
  const applyPoint = async (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
    const review = await reviewPin(lat, lng, { pincode, state });
    const place = review?.place;
    if (place) {
      if (!city.trim() && place.city) setCity(place.city);
      if (!state.trim() && place.region) setState(place.region);
      if (!pincode.trim() && place.postalCode && /^\d{6}$/.test(place.postalCode)) {
        setPincode(place.postalCode);
      }
      if (!shopAddress.trim()) {
        const parts = [place.name, place.street, place.district].filter(Boolean);
        if (parts.length > 0) setShopAddress(parts.join(', '));
      }
    }
    showPinReview(review, () => {
      setLatitude(null);
      setLongitude(null);
    });
  };

  const renderContent = () => {
    switch (step) {
      case 1:
        return (
          <View className="space-y-4">
            {/* Field 1: Shop Name */}
            <View>
              <Text className="text-[11px] text-heliotrope-600 font-semibold mb-1.5">
                Shop Name <Text className="text-fuchsia-500">*</Text>
              </Text>
              <View className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5 gap-2.5">
                <Building2 size={16} color="#6B4773" />
                <TextInput
                  value={shopName}
                  onChangeText={setShopName}
                  placeholder="e.g. Radha Sarees & Bridal"
                  placeholderTextColor="#928EB2"
                  className="flex-1 text-sm font-semibold text-spaceCadet-900"
                  maxLength={200}
                  autoFocus
                />
              </View>
            </View>

            {/* Field 2: Owner Name */}
            <View className="mt-3">
              <Text className="text-[11px] text-heliotrope-600 font-semibold mb-1.5">
                Owner / Manager Name
              </Text>
              <View className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5 gap-2.5">
                <User size={16} color="#6B4773" />
                <TextInput
                  value={ownerName}
                  onChangeText={setOwnerName}
                  placeholder="e.g. Suresh Kumar Verma"
                  placeholderTextColor="#928EB2"
                  className="flex-1 text-sm font-semibold text-spaceCadet-900"
                  maxLength={200}
                />
              </View>
            </View>

            {/* Field 3: Primary Clothing Category — hidden from onboarding for now */}
            {false && (
              <View className="mt-3">
                <Text className="text-[11px] text-heliotrope-600 font-semibold mb-2">
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
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 16,
                          borderWidth: 1.5,
                          backgroundColor: isSelected ? '#231F48' : 'transparent',
                          borderColor: isSelected ? '#231F48' : '#928EB2',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '700',
                            color: isSelected ? '#FFFFFF' : '#231F48',
                          }}
                        >
                          {spec}
                        </Text>
                      </AnimatedPressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Field 4: Storefront Subdomain URL */}
            <View className="mt-3">
              <Text className="text-[11px] text-heliotrope-600 font-semibold mb-1.5">
                Your Store Web Link
              </Text>
              <View className="flex-row items-center p-3 bg-lavender-100/70 border border-lavender-200 rounded-2xl">
                <Text className="text-xs text-heliotrope-500 font-medium mr-1">kanchuki.app/</Text>
                <Text className="text-xs text-fuchsia-600 font-semibold">
                  {slugify(shopName) || 'your-shop-name'}
                </Text>
                <View className="ml-auto">
                  <CheckCircle2 size={16} color="#059669" />
                </View>
              </View>
            </View>

            {/* Field 5: Referral Code */}
            <View className="mt-3">
              <Text className="text-[11px] text-heliotrope-600 font-semibold mb-1.5">
                Referral Code (Optional)
              </Text>
              <View className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5 gap-2.5">
                <TextInput
                  value={referralCode}
                  onChangeText={(t) => setReferralCode(t.toUpperCase())}
                  placeholder="Referred by a Kanchuki agent?"
                  placeholderTextColor="#928EB2"
                  className="flex-1 text-sm font-semibold text-spaceCadet-900 tracking-wider"
                  autoCapitalize="characters"
                  maxLength={20}
                />
              </View>
            </View>

            {/* Consent & Consent Checkbox */}
            <View className="mt-4 bg-lavender-50 border border-lavender-200 rounded-2xl p-4">
              <Text className="text-[11px] text-heliotrope-600 leading-relaxed font-medium mb-3">
                By creating retailer profile, I provide consent to be contacted by Customer,
                Kanchuki&apos;s sales agents and customer support via WhatsApp, SMS, Phone Calls and
                email.
              </Text>
              <Text className="text-[11px] text-heliotrope-600 leading-relaxed font-medium mb-3">
                I understand that KYC verification is required and acknowledge the updated refund
                and privacy policies linked below.
              </Text>
              <AnimatedPressable
                onPress={() => setConsentGiven(!consentGiven)}
                accessibilityLabel="I agree to the Terms, Privacy Policy, and consent to be contacted"
                accessibilityRole="button"
                accessibilityState={{ selected: consentGiven }}
                className="flex-row items-start gap-3"
              >
                <View
                  className={`w-5 h-5 rounded-md border-2 items-center justify-center mt-0.5 ${
                    consentGiven
                      ? 'bg-fuchsia-600 border-fuchsia-600'
                      : 'bg-white border-lavender-300'
                  }`}
                >
                  {consentGiven && <CheckCircle2 size={12} color="white" />}
                </View>
                <Text className="flex-1 text-[11px] text-heliotrope-600 leading-relaxed font-medium">
                  I agree to the{' '}
                  <Text
                    className="font-semibold text-fuchsia-600 underline"
                    onPress={() => void Linking.openURL(`${WEB_URL}/terms`)}
                  >
                    Terms of Service
                  </Text>{' '}
                  and{' '}
                  <Text
                    className="font-semibold text-fuchsia-600 underline"
                    onPress={() => void Linking.openURL(`${WEB_URL}/privacy`)}
                  >
                    Privacy Policy
                  </Text>{' '}
                  and consent to be contacted as described above.
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        );

      case 2:
        return (
          <View className="space-y-4">
            <View>
              <Text className="text-[11px] text-heliotrope-600 font-semibold mb-1.5">
                Shop Address / Street <Text className="text-fuchsia-500">*</Text>
              </Text>
              <View className="bg-lavender-50 border border-lavender-200 rounded-2xl p-3.5">
                <TextInput
                  value={shopAddress}
                  onChangeText={setShopAddress}
                  placeholder="Shop no., building, street, area, landmark"
                  placeholderTextColor="#928EB2"
                  className="text-sm font-semibold text-spaceCadet-900"
                  style={{ minHeight: 70, textAlignVertical: 'top' }}
                  multiline
                  maxLength={300}
                  autoFocus
                />
              </View>
            </View>

            <View className="mt-3">
              <Text className="text-[11px] text-heliotrope-600 font-semibold mb-1.5">
                City <Text className="text-fuchsia-500">*</Text>
              </Text>
              <View className="flex-row items-center bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5 gap-2.5">
                <MapPin size={16} color="#6B4773" />
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="e.g. Surat / Jaipur / Delhi"
                  placeholderTextColor="#928EB2"
                  className="flex-1 text-sm font-semibold text-spaceCadet-900"
                  maxLength={100}
                />
              </View>
            </View>

            <View className="flex-row gap-3 mt-3">
              <View className="flex-1">
                <Text className="text-[11px] text-heliotrope-600 font-semibold mb-1.5">
                  District
                </Text>
                <View className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5">
                  <TextInput
                    value={district}
                    onChangeText={setDistrict}
                    placeholder="e.g. Surat"
                    placeholderTextColor="#928EB2"
                    className="text-sm font-semibold text-spaceCadet-900"
                    maxLength={100}
                  />
                </View>
              </View>

              <View className="flex-1">
                <Text className="text-[11px] text-heliotrope-600 font-semibold mb-1.5">State</Text>
                <View className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5">
                  <TextInput
                    value={state}
                    onChangeText={setState}
                    placeholder="e.g. Gujarat"
                    placeholderTextColor="#928EB2"
                    className="text-sm font-semibold text-spaceCadet-900"
                    maxLength={100}
                  />
                </View>
              </View>
            </View>

            <View className="mt-3">
              <Text className="text-[11px] text-heliotrope-600 font-semibold mb-1.5">
                Pincode / Zipcode
              </Text>
              <View className="bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3.5">
                <TextInput
                  value={pincode}
                  onChangeText={(t) => setPincode(t.replace(/[^0-9]/g, ''))}
                  placeholder="6-digit pincode (e.g. 395002)"
                  keyboardType="number-pad"
                  placeholderTextColor="#928EB2"
                  className="text-sm font-semibold text-spaceCadet-900"
                  maxLength={6}
                />
              </View>
            </View>

            {/* Get Location from Map */}
            <AnimatedPressable
              onPress={() => void handleGetLocation()}
              disabled={locating}
              accessibilityLabel="Get location from Google Maps"
              accessibilityRole="button"
              className="flex-row items-center gap-3 bg-white border border-lavender-200 rounded-2xl p-4 mt-3"
            >
              <MapPin size={18} color="#5A3962" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-spaceCadet-900">
                  {latitude ? 'Location saved' : 'Get location from map'}
                </Text>
                <Text className="text-[11px] text-heliotrope-500 mt-0.5 font-medium">
                  {latitude
                    ? `${latitude.toFixed(4)}, ${longitude!.toFixed(4)} — tap to update`
                    : 'Auto-detect your shop position for Google Maps directions'}
                </Text>
              </View>
              {locating ? (
                <ActivityIndicator size="small" color="#BB3F95" />
              ) : latitude ? (
                <Text className="text-fuchsia-600 text-xs font-semibold">✓</Text>
              ) : (
                <Text className="text-heliotrope-500 text-lg">→</Text>
              )}
            </AnimatedPressable>

            {/* Or paste the shop's Google Maps share link (works from anywhere, no GPS needed) */}
            <View className="flex-row items-center gap-2 mt-2">
              <TextInput
                value={mapsLink}
                onChangeText={setMapsLink}
                placeholder="Or paste a Google Maps link"
                placeholderTextColor="#928EB2"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                className="flex-1 bg-lavender-50 border border-lavender-200 rounded-2xl px-4 py-3 text-sm font-semibold text-spaceCadet-900"
              />
              <AnimatedPressable
                onPress={() => void handleUseMapsLink()}
                disabled={resolvingLink || mapsLink.trim().length === 0}
                accessibilityLabel="Use pasted Google Maps link"
                accessibilityRole="button"
                className="bg-spaceCadet-900 px-4 py-3 rounded-2xl min-h-[44px] justify-center"
                style={{ opacity: mapsLink.trim().length === 0 ? 0.5 : 1 }}
              >
                {resolvingLink ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-white text-sm font-semibold">Use</Text>
                )}
              </AnimatedPressable>
            </View>

            {/* Optional: link the shop's Google listing (saved immediately on pick) */}
            <View className="mt-3">
              <GooglePlaceField
                defaultQuery={[shopName.trim(), city.trim()].filter(Boolean).join(' ')}
              />
            </View>

            {/* Store Tip Box */}
            <View className="bg-lavender-50 border border-lavender-200 rounded-2xl p-3.5 mt-2 flex-row items-start gap-2.5">
              <MapPin size={16} color="#5A3962" />
              <Text className="flex-1 text-[11px] text-heliotrope-600 leading-relaxed font-medium">
                Your shop location will appear on your customer store links so visitors can get
                directions.
              </Text>
            </View>
          </View>
        );

      case 3:
        return (
          <View className="space-y-4">
            <View>
              <Text className="text-[11px] text-heliotrope-600 font-semibold mb-1.5">
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
                  className="flex-1 text-sm font-semibold text-spaceCadet-900 tracking-wider"
                  maxLength={15}
                  autoFocus
                />
              </View>
              <Text className="text-xs text-heliotrope-500 mt-2 px-1 font-medium">
                Format: 24AAAAA0000A1Z5 · You can also add or update this anytime in Settings.
              </Text>
            </View>

            {/* Skip GST — placed directly under the form field */}
            <AnimatedPressable
              onPress={() => void handleNext()}
              disabled={saving || showConfetti}
              accessibilityLabel="Skip — continue without a GST number"
              accessibilityRole="button"
              className="items-center justify-center py-2.5 border border-lavender-200 rounded-lg px-3 min-h-[36px]"
            >
              <Text className="text-sm font-semibold text-fuchsia-600">
                Skip — I don&apos;t have a GST number
              </Text>
            </AnimatedPressable>

            <View className="bg-lavender-100/70 border border-lavender-200 rounded-2xl p-4 mt-2">
              <Text className="text-spaceCadet-900 text-xs font-semibold mb-1">
                Automatic GST invoicing
              </Text>
              <Text className="text-heliotrope-600 text-xs leading-relaxed font-medium">
                When a customer orders a product via your store link, Kanchuki generates an itemized
                GST invoice automatically.
              </Text>
            </View>
          </View>
        );

      case 4:
        return (
          <View className="w-full">
            {/* Demo Plan — top CTA */}
            <AnimatedPressable
              onPress={() => setSelectedPlan('DEMO')}
              accessibilityLabel="Start Free Demo — full Pro access"
              accessibilityRole="button"
              accessibilityState={{ selected: selectedPlan === 'DEMO' }}
              className="w-full rounded-2xl p-4 mb-4 border-2 overflow-hidden"
              style={{
                backgroundColor: selectedPlan === 'DEMO' ? '#231F48' : '#FAF9FE',
                borderColor: selectedPlan === 'DEMO' ? '#231F48' : '#E0E1F6',
              }}
            >
              <View className="flex-row items-center gap-3">
                <View
                  className="w-12 h-12 rounded-xl items-center justify-center"
                  style={{
                    backgroundColor: selectedPlan === 'DEMO' ? 'rgba(255,255,255,0.12)' : '#F2F1FA',
                  }}
                >
                  <Zap size={20} color={selectedPlan === 'DEMO' ? '#FFFFFF' : '#6B4773'} />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: selectedPlan === 'DEMO' ? '#FFFFFF' : '#231F48' }}
                  >
                    Start Free Demo
                  </Text>
                  <Text
                    className="text-xs mt-0.5 font-medium"
                    style={{ color: selectedPlan === 'DEMO' ? '#E0E1F6' : '#6B4773' }}
                  >
                    Full Pro access · No payment needed
                  </Text>
                </View>
                {selectedPlan === 'DEMO' ? (
                  <CheckCircle2 size={20} color="#FFFFFF" />
                ) : (
                  <Text className="text-heliotrope-500 text-lg">○</Text>
                )}
              </View>
            </AnimatedPressable>
          </View>
        );

      case 5:
        return (
          <View className="items-center w-full">
            <LinearGradient
              colors={['#231F48', '#560A39']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              className="w-full rounded-2xl p-6 items-center shadow-lg mb-5"
            >
              <CheckCircle2 size={28} color="#FFFFFF" style={{ marginBottom: 12 }} />
              <Text className="text-3xl text-white font-extrabold font-marcellus text-center">
                You&apos;re all set
              </Text>
              <Text className="text-xs text-lavender-200 mt-1 text-center font-medium">
                {selectedPlan === 'DEMO'
                  ? 'Demo Pro access is active'
                  : 'Your catalog is ready for customers'}
              </Text>
            </LinearGradient>

            <View className="w-full gap-3">
              <GradientButton
                variant="web"
                label="Go to Dashboard →"
                onPress={() => void handleNext()}
                loading={saving}
              />

              {/* Show selected plan badge */}
              {selectedPlan && (
                <View className="items-center mt-2 mb-1">
                  <Text className="text-[11px] text-heliotrope-500 font-medium">
                    {selectedPlan === 'DEMO'
                      ? 'Demo Pro'
                      : `${selectedPlan.charAt(0) + selectedPlan.slice(1).toLowerCase()} plan`}
                  </Text>
                </View>
              )}

              <AnimatedPressable
                onPress={() => void handleCreateStoreQr()}
                className="flex-row items-center gap-3.5 bg-white border border-lavender-200 rounded-2xl p-4 shadow-sm"
              >
                <View className="w-10 h-10 rounded-2xl bg-lavender-100 items-center justify-center border border-lavender-200">
                  <QrCode size={20} color="#231F48" />
                </View>
                <View className="flex-1">
                  <Text className="text-spaceCadet-900 text-xs font-semibold">
                    Create your store QR code
                  </Text>
                  <Text className="text-heliotrope-500 text-[11px] mt-0.5 font-medium">
                    Customers scan to open your catalog
                  </Text>
                </View>
                <Text className="text-heliotrope-500 text-base font-semibold">→</Text>
              </AnimatedPressable>

              {CATALOG_UPLOAD_ENABLED && (
                <AnimatedPressable
                  onPress={() => void handleGetCatalogHelp()}
                  className="flex-row items-center gap-3.5 bg-white border border-lavender-200 rounded-2xl p-4 shadow-sm"
                >
                  <View className="w-10 h-10 rounded-2xl bg-lavender-100 items-center justify-center border border-lavender-200">
                    <Truck size={20} color="#231F48" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-spaceCadet-900 text-xs font-semibold">
                      Catalog Upload Help
                    </Text>
                    <Text className="text-heliotrope-500 text-[11px] mt-0.5 font-medium">
                      A team member adds your inventory for you
                    </Text>
                  </View>
                  <Text className="text-heliotrope-500 text-base font-semibold">→</Text>
                </AnimatedPressable>
              )}
            </View>
          </View>
        );
    }
  };

  return (
    <KeyboardScreen className="flex-1 bg-[#F8F7FC]">
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
          <Text className="text-base text-spaceCadet-900 font-extrabold font-marcellus">
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
        <Text className="text-sm text-heliotrope-600 leading-5 mb-4">
          {STEP_META[step].subtitle}
        </Text>

        {/* Form Container Card */}
        <View className="bg-white border border-lavender-200 rounded-2xl p-5 shadow-sm w-full">
          {/* key={step}: each step's subtree is a different shape; without a
              stable key React diffs step 1's fields against step 2's and
              react-native-css-interop's dev upgrade-warning path could fire
              mid-render. Remount cleanly per step instead. */}
          <View key={step}>{renderContent()}</View>
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
              variant="web"
              label={
                showConfetti
                  ? "You're in"
                  : step === 1
                    ? 'Save & Proceed to Location'
                    : step === 2
                      ? 'Save & Proceed to GST'
                      : step === 3
                        ? 'Save & Proceed to Plan'
                        : 'Complete Setup →'
              }
              onPress={() => void handleNext()}
              disabled={!canProceed() || showConfetti || saving}
              loading={saving}
            />
          </View>
        </View>
      )}
    </KeyboardScreen>
  );
}
