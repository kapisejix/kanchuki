import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { retailerApi } from '../src/lib/api'
import { PRODUCT_CATEGORIES, INDIAN_STATES } from '@kanchuki/shared'

type Step = 1 | 2 | 3 | 4 | 5 | 6
const TOTAL_STEPS = 6

// ─── Step config ──────────────────────────────────────────────────
const STEP_META: Record<Step, { icon: string; label: string }> = {
  1: { icon: '🏪', label: 'Shop' },
  2: { icon: '📍', label: 'Location' },
  3: { icon: '👗', label: 'Category' },
  4: { icon: '🧾', label: 'GST' },
  5: { icon: '📦', label: 'Racks' },
  6: { icon: '🎉', label: 'Done' },
}

// ─── Confetti Particle ────────────────────────────────────────────
interface Particle {
  x: Animated.Value
  y: Animated.Value
  rotate: Animated.Value
  opacity: Animated.Value
  emoji: string
  xStart: number
}

function ConfettiOverlay({ visible }: { visible: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (!visible) {
      setParticles([])
      return
    }
    const emojis = ['🎊', '✨', '🌟', '💫', '🎉', '⭐', '🔮', '👏']
    const { width: w, height: h } = Dimensions.get('window')

    const newParticles: Particle[] = Array.from({ length: 20 }, (_, i) => {
      const xStart = Math.random() * w
      return {
        x: new Animated.Value(xStart),
        y: new Animated.Value(-60 - Math.random() * 200),
        rotate: new Animated.Value(0),
        opacity: new Animated.Value(1),
        emoji: emojis[i % emojis.length],
        xStart,
      }
    })
    setParticles(newParticles)

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
    )

    const composite = Animated.stagger(80, anims)
    composite.start()

    return () => {
      composite.stop()
      for (const p of newParticles) {
        p.x.stopAnimation()
        p.y.stopAnimation()
        p.rotate.stopAnimation()
        p.opacity.stopAnimation()
      }
    }
  }, [visible])

  if (!visible || particles.length === 0) return null

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
  )
}

// ─── Step Indicator ───────────────────────────────────────────────
function StepIndicator({
  currentStep,
  onPress,
}: {
  currentStep: Step
  onPress: (step: Step) => void
}) {
  return (
    <View className="flex-row items-center justify-center gap-2 px-6 pt-2 pb-3">
      {([1, 2, 3, 4, 5, 6] as Step[]).map((s) => {
        const isActive = s === currentStep
        const isPast = s < currentStep
        return (
          <TouchableOpacity
            key={s}
            onPress={() => isPast && onPress(s)}
            disabled={!isPast}
            className="items-center gap-1"
          >
            <View
              className={`w-8 h-8 rounded-full items-center justify-center border-2 ${
                isActive
                  ? 'bg-cyan-600 border-cyan-600'
                  : isPast
                  ? 'bg-cyan-100 border-cyan-300'
                  : 'bg-cyan-50 border-gray-200'
              } ${isPast ? '' : ''}`}
            >
              <Text
                className={`text-xs ${
                  isActive ? 'text-white' : isPast ? 'text-cyan-600' : 'text-gray-300'
                }`}
              >
                {isPast ? '✓' : s}
              </Text>
            </View>
            <Text
              className={`text-[10px] ${
                isActive ? 'text-cyan-600 font-semibold' : 'text-gray-400'
              }`}
            >
              {STEP_META[s].label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ─── Main Screen ──────────────────────────────────────────────────
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  // ── Animated values for transitions ──
  const slideAnim = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(1)).current

  // ── Form state ──
  const [shopName, setShopName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [gstin, setGstin] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [statePickerOpen, setStatePickerOpen] = useState(false)

  const canProceed = useCallback((): boolean => {
    if (step === 1) return shopName.trim().length >= 2
    if (step === 2) return city.trim().length >= 2
    if (step === 3) return selectedCategories.length > 0
    if (step === 4) return true // optional
    if (step === 5) return true // optional
    return true
  }, [step, shopName, city, selectedCategories])

  const animateTransition = useCallback(
    (direction: 'forward' | 'back', onComplete: () => void) => {
      const toValue = direction === 'forward' ? -1 : 1
      slideAnim.setValue(0)
      fadeAnim.setValue(1)
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
        onComplete()
        slideAnim.setValue(direction === 'forward' ? 1 : -1)
        fadeAnim.setValue(0.5)
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
        ]).start()
      })
    },
    [slideAnim, fadeAnim],
  )

  const goToStep = useCallback(
    (s: Step) => {
      const dir = s > step ? 'forward' : 'back'
      animateTransition(dir, () => setStep(s))
    },
    [step, animateTransition],
  )

  const handleNext = async () => {
    // Save step progress to server
    const nextStep = (step + 1) as Step

    if (step === 1) {
      await retailerApi.update({
        shop_name: shopName.trim(),
        owner_name: ownerName.trim() || undefined,
        onboarding_step: 1,
      })
      goToStep(nextStep)
      return
    }

    if (step < TOTAL_STEPS) {
      await retailerApi.update({ onboarding_step: nextStep })
      goToStep(nextStep)
      return
    }

    // Final step — save full profile and redirect
    setSaving(true)
    try {
      await retailerApi.update({
        shop_name: shopName.trim(),
        owner_name: ownerName.trim() || undefined,
        city: city.trim(),
        state: state || undefined,
        gstin: gstin.trim() || undefined,
        categories: selectedCategories,
        onboarding_step: 6,
      })
      setShowConfetti(true)
      setTimeout(() => {
        router.replace('/(tabs)')
      }, 2500)
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    )
  }

  // ── Emoji map for categories ──
  const categoryEmoji: Record<string, string> = useMemo(
    () => ({
      'Ladies Suit': '🥻',
      'Kurti': '👚',
      'Saree': '🧣',
      'Lehenga': '👗',
      'Gown': '👸',
      'Dupatta': '🪞',
      'Blouse': '👔',
      "Men's Kurta Pajama": '🧑‍💼',
      'Sherwani': '🤵',
      'Kids Ethnic Wear': '👧',
      'Readymade Suit': '🛍️',
      'Other': '📦',
    }),
    [],
  )

  const renderContent = () => {
    switch (step) {
      case 1:
        return (
          <View className="pt-4">
            {/* Brand header */}
            <View className="flex-row items-center gap-3 mb-6">
              <View className="w-12 h-12 bg-cyan-600 rounded-2xl items-center justify-center">
                <Text className="text-white text-xl font-bold">K</Text>
              </View>
              <View>
                <Text className="text-lg font-bold text-gray-900">Kanchuki</Text>
                <Text className="text-xs text-gray-500">Aapki dukan, AI ki taakat</Text>
              </View>
            </View>

            <Text className="text-2xl font-bold text-gray-900">Welcome to Kanchuki!</Text>
            <Text className="text-gray-500 text-base mt-2 leading-5">
              Set up your digital store in minutes. AI will help you catalog products and
              share them with customers on WhatsApp.
            </Text>

            <View className="mt-6">
              <Text className="text-sm font-semibold text-gray-600 mb-2">Shop name *</Text>
              <TextInput
                value={shopName}
                onChangeText={setShopName}
                placeholder="e.g. Priya Fashion House"
                className="border-2 border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900"
                placeholderTextColor="#9CA3AF"
                autoFocus
                maxLength={200}
              />
            </View>

            <View className="mt-4">
              <Text className="text-sm font-semibold text-gray-600 mb-2">Your name</Text>
              <TextInput
                value={ownerName}
                onChangeText={setOwnerName}
                placeholder="e.g. Priya Sharma (optional)"
                className="border-2 border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900"
                placeholderTextColor="#9CA3AF"
                maxLength={200}
              />
            </View>

            <View className="mt-6 bg-cyan-50 rounded-2xl p-4">
              <Text className="text-cyan-700 text-sm font-medium">✨ What happens next?</Text>
              <Text className="text-cyan-600 text-sm mt-1 leading-5">
                Add your shop details, then take a photo of any product — AI will automatically
                tag it with category, color, fabric & occasion.
              </Text>
            </View>
          </View>
        )

      case 2:
        return (
          <View className="pt-6">
            <Text className="text-2xl font-bold text-gray-900">Where's your shop?</Text>
            <Text className="text-gray-500 text-base mt-2">
              Customers use this to find your store
            </Text>

            <View className="mt-6">
              <Text className="text-sm font-semibold text-gray-600 mb-2">City *</Text>
              <TextInput
                value={city}
                onChangeText={(t) => {
                  setCity(t)
                  setStatePickerOpen(false)
                }}
                placeholder="e.g. Surat, Jaipur, Ludhiana"
                className="border-2 border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900"
                placeholderTextColor="#9CA3AF"
                autoFocus
                maxLength={100}
              />
            </View>

            {/* State dropdown */}
            <View className="mt-4">
              <Text className="text-sm font-semibold text-gray-600 mb-2">
                State <Text className="text-gray-400 font-normal">(optional)</Text>
              </Text>
              <TouchableOpacity
                onPress={() => setStatePickerOpen((p) => !p)}
                className="border-2 border-gray-200 rounded-2xl px-4 py-4 flex-row items-center justify-between"
                activeOpacity={0.7}
              >
                <Text className={`text-base ${state ? 'text-gray-900' : 'text-gray-400'}`}>
                  {state || 'Select state'}
                </Text>
                <Text className="text-gray-400 text-lg">{statePickerOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {statePickerOpen && (
                <View className="mt-2 border-2 border-gray-100 rounded-2xl max-h-48 overflow-hidden">
                  <ScrollView className="divide-y divide-gray-50" nestedScrollEnabled>
                    {INDIAN_STATES.map((s) => (
                      <TouchableOpacity
                        key={s}
                        onPress={() => {
                          setState(s)
                          setStatePickerOpen(false)
                        }}
                        className={`px-4 py-3 ${state === s ? 'bg-cyan-50' : ''}`}
                        activeOpacity={0.6}
                      >
                        <Text
                          className={`text-sm ${state === s ? 'text-cyan-700 font-semibold' : 'text-gray-700'}`}
                        >
                          {s}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        )

      case 3:
        return (
          <View className="pt-6">
            <Text className="text-2xl font-bold text-gray-900">What do you sell?</Text>
            <Text className="text-gray-500 text-base mt-2">
              Select all that apply — helps AI tag products accurately
            </Text>

            <View className="flex-row flex-wrap gap-3 mt-6">
              {PRODUCT_CATEGORIES.map((cat) => {
                const selected = selectedCategories.includes(cat)
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => toggleCategory(cat)}
                    className={`flex-row items-center gap-2 px-4 py-3 rounded-2xl border-2 ${
                      selected
                        ? 'bg-cyan-600 border-cyan-600'
                        : 'bg-white border-gray-200 active:border-cyan-300'
                    }`}
                    activeOpacity={0.7}
                  >
                    <Text className="text-base">{categoryEmoji[cat] ?? '📦'}</Text>
                    <Text
                      className={`font-medium text-sm ${selected ? 'text-white' : 'text-gray-700'}`}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text className="text-xs text-gray-400 mt-4 text-center">
              {selectedCategories.length} selected
            </Text>
          </View>
        )

      case 4:
        return (
          <View className="pt-6">
            <Text className="text-2xl font-bold text-gray-900">GST number</Text>
            <Text className="text-gray-500 text-base mt-2">
              Required for generating GST invoices for your customers
            </Text>

            <View className="mt-6">
              <TextInput
                value={gstin}
                onChangeText={(t) => setGstin(t.toUpperCase())}
                placeholder="15-digit GSTIN"
                className="border-2 border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900 font-mono tracking-widest"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                maxLength={15}
                autoFocus
              />
              <Text className="text-xs text-gray-400 mt-2 px-1">
                Format: 22AAAAA0000A1Z5 · You can add this later
              </Text>
            </View>

            <View className="mt-6 bg-amber-50 rounded-2xl p-4">
              <Text className="text-amber-800 text-sm font-medium">💡 GST invoice tip</Text>
              <Text className="text-amber-700 text-sm mt-1 leading-5">
                When a customer enquires about a product, Kanchuki can generate a GST invoice
                automatically. Add your GSTIN now or skip and do it later from Settings.
              </Text>
            </View>

            <TouchableOpacity
              onPress={async () => {
                // Persist step 5 progress before skipping
                await retailerApi.update({ onboarding_step: 5 }).catch(() => {})
                goToStep(6 as Step)
              }}
              className="mt-4 py-3"
              activeOpacity={0.6}
            >
              <Text className="text-cyan-600 text-sm font-semibold text-center">
                Skip for now →
              </Text>
            </TouchableOpacity>
          </View>
        )

      case 5:
        return (
          <View className="pt-6">
            <Text className="text-2xl font-bold text-gray-900">Organize your racks</Text>
            <Text className="text-gray-500 text-base mt-2">
              Tell us how your shop is arranged — makes finding products fast
            </Text>

            <View className="mt-6 bg-cyan-50 rounded-2xl p-4 border border-cyan-100">
              <Text className="text-cyan-800 text-sm font-medium mb-2">📦 Example layouts:</Text>
              <Text className="text-cyan-700 text-sm leading-6">
                • Floor → Section A → Rack 1 → Shelf 3{'\n'}
                • Rack A, Rack B, Rack C...{'\n'}
                • By category: Suit Rack, Saree Rack, Kurti Rack
              </Text>
            </View>

            <View className="mt-4 gap-2">
              {['By rack (A, B, C...)', 'By category', 'By price range', 'I will set up later'].map(
                (preset) => (
                  <TouchableOpacity
                    key={preset}
                    onPress={() => {
                      if (preset === 'I will set up later') {
                        goToStep(6 as Step)
                      } else {
                        goToStep(6 as Step) // For now all options proceed
                      }
                    }}
                    className="flex-row items-center gap-3 p-4 border-2 border-gray-200 rounded-2xl active:border-cyan-300"
                    activeOpacity={0.7}
                  >
                    <Text className="text-lg">
                      {preset === 'By rack (A, B, C...)' && '🔤'}
                      {preset === 'By category' && '📁'}
                      {preset === 'By price range' && '💰'}
                      {preset === 'I will set up later' && '⏭️'}
                    </Text>
                    <Text className="text-gray-700 text-sm font-medium">{preset}</Text>
                  </TouchableOpacity>
                ),
              )}
            </View>

            <Text className="text-gray-400 text-xs mt-4 text-center">
              You can also set up racks after adding products
            </Text>
          </View>
        )

      case 6:
        return (
          <View className="pt-2 items-center">
            {/* Big celebration emoji */}
            <View className="w-24 h-24 bg-cyan-100 rounded-3xl items-center justify-center mb-6">
              <Text className="text-5xl">🎉</Text>
            </View>

            <Text className="text-2xl font-bold text-gray-900 text-center">
              You're all set!
            </Text>
            <Text className="text-gray-500 text-base mt-2 text-center">
              Your store is ready to go. Here's what to do next:
            </Text>

            <View className="mt-6 w-full gap-3">
              <TouchableOpacity
                onPress={() => router.replace('/(tabs)')}
                className="flex-row items-center gap-3 bg-cyan-600 rounded-2xl p-4 active:opacity-90"
                activeOpacity={0.9}
              >
                <View className="w-10 h-10 rounded-xl bg-cyan-500 items-center justify-center">
                  <Text className="text-xl">📷</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-white text-sm font-bold">Add your first product</Text>
                  <Text className="text-cyan-200 text-xs mt-0.5">
                    AI tags it automatically — takes 8 seconds
                  </Text>
                </View>
                <Text className="text-white text-lg">→</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.replace('/(tabs)')}
                className="flex-row items-center gap-3 bg-white border-2 border-gray-200 rounded-2xl p-4 active:border-cyan-300"
                activeOpacity={0.8}
              >
                <View className="w-10 h-10 rounded-xl bg-cyan-50 items-center justify-center">
                  <Text className="text-xl">👥</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-gray-900 text-sm font-bold">Add customers</Text>
                  <Text className="text-gray-500 text-xs mt-0.5">
                    Save preferences for faster selling
                  </Text>
                </View>
                <Text className="text-gray-400 text-lg">→</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.replace('/(tabs)')}
                className="flex-row items-center gap-3 bg-white border-2 border-gray-200 rounded-2xl p-4 active:border-cyan-300"
                activeOpacity={0.8}
              >
                <View className="w-10 h-10 rounded-xl bg-cyan-50 items-center justify-center">
                  <Text className="text-xl">🔗</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-gray-900 text-sm font-bold">Create a collection</Text>
                  <Text className="text-gray-500 text-xs mt-0.5">
                    Share on WhatsApp with a single link
                  </Text>
                </View>
                <Text className="text-gray-400 text-lg">→</Text>
              </TouchableOpacity>
            </View>
          </View>
        )
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      {/* Confetti overlay */}
      <ConfettiOverlay visible={showConfetti} />

      <View className="flex-1 pt-14">
        {/* Progress bar */}
        <View className="h-1 bg-gray-100 mx-6 rounded-full overflow-hidden">
          <View
            className="h-full bg-cyan-600 rounded-full"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </View>

        {/* Step indicator dots */}
        <StepIndicator currentStep={step} onPress={goToStep} />

        {/* Content with animated transitions */}
        <Animated.View
          className="flex-1 px-6"
          style={{
            opacity: fadeAnim,
            transform: [{ translateX: slideAnim.interpolate({
              inputRange: [-1, 0, 1],
              outputRange: [-60, 0, 60],
            }) }],
          }}
        >
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderContent()}
            <View className="h-40" />
          </ScrollView>
        </Animated.View>
      </View>

      {/* Bottom navigation */}
      <View
        className="bg-white border-t border-gray-100 px-6 pt-4"
        style={{ paddingBottom: 16 + insets.bottom }}
      >
        <View className="flex-row items-center gap-3">
          {step > 1 && (
            <TouchableOpacity
              onPress={() => goToStep((step - 1) as Step)}
              className="w-12 h-12 rounded-2xl border-2 border-gray-200 items-center justify-center active:bg-cyan-50"
              activeOpacity={0.7}
            >
              <Text className="text-gray-600 text-lg">←</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => void handleNext()}
            disabled={!canProceed() || saving || showConfetti}
            className={`flex-1 py-4 rounded-2xl items-center justify-center ${
              canProceed() && !saving ? 'bg-cyan-600 active:bg-cyan-700' : 'bg-gray-200'
            }`}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="white" />
            ) : showConfetti ? (
              <Text className="text-white font-bold text-base">🎉 You're in!</Text>
            ) : (
              <Text
                className={`font-bold text-base ${
                  canProceed() ? 'text-white' : 'text-gray-400'
                }`}
              >
                {step === TOTAL_STEPS ? 'Go to Dashboard' : 'Continue →'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        <Text className="text-center text-xs text-gray-400 mt-2">
          Step {step} of {TOTAL_STEPS}
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}
