import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { router } from 'expo-router'
import { retailerApi } from '../src/lib/api'
import { PRODUCT_CATEGORIES, INDIAN_STATES } from '@kanchuki/shared'

type Step = 1 | 2 | 3 | 4 | 5 | 6

const TOTAL_STEPS = 6

export default function OnboardingScreen() {
  const [step, setStep] = useState<Step>(1)
  const [saving, setSaving] = useState(false)

  // Form state
  const [shopName, setShopName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [gstin, setGstin] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])

  const canProceed = (): boolean => {
    if (step === 1) return shopName.trim().length >= 2
    if (step === 2) return city.trim().length >= 2
    if (step === 3) return selectedCategories.length > 0
    return true // steps 4-6 optional
  }

  const handleNext = async () => {
    if (step < TOTAL_STEPS) {
      await retailerApi.update({ onboarding_step: step + 1 })
      setStep((s) => (s + 1) as Step)
      return
    }
    // Final step — save and complete
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
      await retailerApi.update({ onboarding_step: 6 })
      // Mark complete via patch
      await fetch(`${process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3001'}/v1/retailers/me/onboarding`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 6, completed: true }),
      })
      router.replace('/(tabs)')
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

  return (
    <View className="flex-1 bg-white">
      {/* Progress bar */}
      <View className="h-1 bg-gray-100 mt-14 mx-6 rounded-full overflow-hidden">
        <View
          className="h-full bg-violet-600 rounded-full transition-all"
          style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
        />
      </View>

      <ScrollView className="flex-1 px-6 pt-6" keyboardShouldPersistTaps="handled">
        {/* Step 1: Shop Name */}
        {step === 1 && (
          <StepWrapper
            title="What's your shop name?"
            subtitle="This will be visible to customers on your collection links"
          >
            <TextInput
              value={shopName}
              onChangeText={setShopName}
              placeholder="e.g. Priya Fashion House"
              className="border-2 border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900 mt-4"
              placeholderTextColor="#9CA3AF"
              autoFocus
              maxLength={200}
            />
            <TextInput
              value={ownerName}
              onChangeText={setOwnerName}
              placeholder="Your name (optional)"
              className="border-2 border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900 mt-3"
              placeholderTextColor="#9CA3AF"
              maxLength={200}
            />
          </StepWrapper>
        )}

        {/* Step 2: Location */}
        {step === 2 && (
          <StepWrapper
            title="Where is your shop?"
            subtitle="Helps customers know your location"
          >
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="City (e.g. Surat, Jaipur, Ludhiana)"
              className="border-2 border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900 mt-4"
              placeholderTextColor="#9CA3AF"
              autoFocus
              maxLength={100}
            />
            <TextInput
              value={state}
              onChangeText={setState}
              placeholder="State (optional)"
              className="border-2 border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900 mt-3"
              placeholderTextColor="#9CA3AF"
              maxLength={100}
            />
          </StepWrapper>
        )}

        {/* Step 3: Categories */}
        {step === 3 && (
          <StepWrapper
            title="What do you sell?"
            subtitle="Select all that apply"
          >
            <View className="flex-row flex-wrap gap-2 mt-4">
              {PRODUCT_CATEGORIES.map((cat) => {
                const selected = selectedCategories.includes(cat)
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => toggleCategory(cat)}
                    className={`px-4 py-2.5 rounded-2xl border-2 ${
                      selected ? 'bg-violet-600 border-violet-600' : 'bg-white border-gray-200'
                    }`}
                  >
                    <Text className={`font-medium text-sm ${selected ? 'text-white' : 'text-gray-700'}`}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </StepWrapper>
        )}

        {/* Step 4: GSTIN */}
        {step === 4 && (
          <StepWrapper
            title="GST number"
            subtitle="Required for generating GST invoices. You can add this later."
          >
            <TextInput
              value={gstin}
              onChangeText={(t) => setGstin(t.toUpperCase())}
              placeholder="15-digit GSTIN (optional)"
              className="border-2 border-gray-200 rounded-2xl px-4 py-4 text-base text-gray-900 mt-4 font-mono"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              maxLength={15}
            />
            <Text className="text-xs text-gray-400 mt-2 px-1">
              Format: 22AAAAA0000A1Z5
            </Text>
            <TouchableOpacity
              onPress={() => void handleNext()}
              className="mt-4"
            >
              <Text className="text-violet-600 text-sm font-semibold text-center">
                Skip for now →
              </Text>
            </TouchableOpacity>
          </StepWrapper>
        )}

        {/* Step 5: Rack setup hint */}
        {step === 5 && (
          <StepWrapper
            title="Set up your store racks"
            subtitle="Tell Kanchuki how your shop is organized so salesperson can find products fast"
          >
            <View className="bg-violet-50 rounded-2xl p-4 mt-4">
              <Text className="text-violet-800 text-sm font-medium">
                📦 Example organization:
              </Text>
              <Text className="text-violet-700 text-sm mt-2 leading-5">
                Floor → Section A → Rack 1 → Shelf 3{'\n'}
                Or simply: Rack A, Rack B, Rack C...
              </Text>
            </View>
            <Text className="text-gray-500 text-sm mt-4 text-center">
              You can set up racks after adding your first product.{'\n'}
              Skip this step for now.
            </Text>
          </StepWrapper>
        )}

        {/* Step 6: Done */}
        {step === 6 && (
          <StepWrapper
            title="You're all set! 🎉"
            subtitle="Your store is ready. Add your first product to get started."
          >
            <View className="mt-6 gap-3">
              <View className="flex-row items-center gap-3 bg-green-50 rounded-2xl p-4">
                <Text className="text-2xl">✅</Text>
                <Text className="text-green-800 text-sm font-medium flex-1">
                  Shop profile created
                </Text>
              </View>
              <View className="flex-row items-center gap-3 bg-violet-50 rounded-2xl p-4">
                <Text className="text-2xl">📷</Text>
                <Text className="text-violet-800 text-sm font-medium flex-1">
                  Add a product → AI tags it automatically
                </Text>
              </View>
              <View className="flex-row items-center gap-3 bg-blue-50 rounded-2xl p-4">
                <Text className="text-2xl">🔗</Text>
                <Text className="text-blue-800 text-sm font-medium flex-1">
                  Create a collection → Share on WhatsApp
                </Text>
              </View>
            </View>
          </StepWrapper>
        )}

        <View className="h-32" />
      </ScrollView>

      {/* Bottom navigation */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-6 py-4">
        <View className="flex-row items-center gap-3">
          {step > 1 && (
            <TouchableOpacity
              onPress={() => setStep((s) => (s - 1) as Step)}
              className="w-12 h-12 rounded-2xl border-2 border-gray-200 items-center justify-center"
            >
              <Text className="text-lg">←</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => void handleNext()}
            disabled={!canProceed() || saving}
            className={`flex-1 py-4 rounded-2xl items-center justify-center ${
              canProceed() && !saving ? 'bg-violet-600' : 'bg-gray-200'
            }`}
          >
            {saving
              ? <ActivityIndicator color="white" />
              : <Text className={`font-bold text-base ${canProceed() ? 'text-white' : 'text-gray-400'}`}>
                  {step === TOTAL_STEPS ? 'Go to Dashboard →' : 'Continue →'}
                </Text>}
          </TouchableOpacity>
        </View>
        <Text className="text-center text-xs text-gray-400 mt-2">
          Step {step} of {TOTAL_STEPS}
        </Text>
      </View>
    </View>
  )
}

function StepWrapper({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <View>
      <Text className="text-2xl font-bold text-gray-900">{title}</Text>
      <Text className="text-gray-500 text-base mt-2">{subtitle}</Text>
      {children}
    </View>
  )
}
