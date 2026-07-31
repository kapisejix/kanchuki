import { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useQueryClient } from '@tanstack/react-query'
import { X, Check, Sparkles, Camera, AlertTriangle, FileText, Plus } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  catalogImportApi,
  retailerApi,
  uploadImageToR2,
  readLocalImage,
  type CatalogDetectedItem,
} from '../../src/lib/api'
import { showError, logError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

// F-001d: guided bulk onboarding — Path A (rack/shelf batch capture).
// Reuses the same detect/tag/crop pipeline as F-001c/F-001b (catalog-import.ts);
// the only net-new piece is asking for rack/shelf location once per photo
// instead of once per item, plus a running catalogued-count across photos.

// ─── Types ────────────────────────────────────────────────────────

type Section = { id: string; name: string; type: string }

type Step = 'location' | 'uploading' | 'detecting' | 'reviewing' | 'saving'

type ReviewItem = {
  original: CatalogDetectedItem
  approved: boolean
  sectionId: string | null
}

export default function BulkOnboardScreen() {
  const { primaryColor } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{ target?: string }>()
  const target = params.target ? Number(params.target) : null

  const [step, setStep] = useState<Step>('location')
  const [sections, setSections] = useState<Section[]>([])
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [newSectionName, setNewSectionName] = useState('')
  const [addingSection, setAddingSection] = useState(false)

  const [baselineCount, setBaselineCount] = useState(0)
  const [sessionCreated, setSessionCreated] = useState(0)

  const [sourceUrl, setSourceUrl] = useState('')
  const [items, setItems] = useState<ReviewItem[]>([])
  const [error, setError] = useState<string | null>(null)

  // ── Load sections + baseline catalog count once ────────────────

  useEffect(() => {
    retailerApi
      .getSections()
      .then((res) => setSections(res.data as Section[]))
      .catch(() => {})
    retailerApi
      .getStats()
      .then((res) => {
        const stats = res.data as { total_products_available?: number }
        setBaselineCount(stats.total_products_available ?? 0)
      })
      .catch(() => {})
  }, [])

  // ── Create a new rack/shelf inline ──────────────────────────────

  const handleCreateSection = useCallback(async () => {
    const name = newSectionName.trim()
    if (!name) return
    try {
      const res = await retailerApi.createSection({ name, type: 'rack' })
      setSections((prev) => [...prev, res.data as Section])
      setSelectedSectionId(res.data.id)
      setNewSectionName('')
      setAddingSection(false)
    } catch (err) {
      showError(err, 'Try again.', 'Could not add location')
    }
  }, [newSectionName])

  // ── Capture + upload + detect one rack photo ────────────────────

  const handleCapturePhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
      if (result.canceled || !result.assets[0]) return
      await runPhoto(result.assets[0].uri)
    } catch (err) {
      showError(err, 'Could not take that photo.', 'Camera Error')
    }
  }, [])

  const handlePickPhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 })
      if (result.canceled || !result.assets[0]) return
      await runPhoto(result.assets[0].uri)
    } catch (err) {
      showError(err, 'Could not pick that photo.', 'Photo Error')
    }
  }, [])

  const runPhoto = useCallback(async (uri: string) => {
    setStep('uploading')
    setError(null)
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1400 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      )
      const blob = await readLocalImage(compressed.uri)
      const uploadResult = await catalogImportApi.getUploadUrl('rack-photo.jpg', 'image/jpeg', blob.size)
      const info = uploadResult.data
      await uploadImageToR2(compressed.uri, info.upload_url, 'image/jpeg')
      setSourceUrl(info.public_url)

      setStep('detecting')
      const detected = await catalogImportApi.detectItems(info.public_url)
      setItems(
        detected.data.items.map((item) => ({
          original: item,
          approved: !item.is_duplicate,
          sectionId: selectedSectionId,
        })),
      )
      setStep('reviewing')
    } catch (err) {
      logError(err)
      setError('Something went wrong. Try again.')
      setStep('location')
    }
  }, [selectedSectionId])

  // ── Save this photo's approved items, then loop back ────────────

  const handleSaveBatch = useCallback(async () => {
    const approved = items.filter((i) => i.approved)
    if (approved.length === 0) {
      Alert.alert('No items selected', 'Approve at least one item to save.')
      return
    }
    setStep('saving')
    try {
      const result = await catalogImportApi.bulkCreateProducts(
        approved.map((item) => ({
          cropped_r2_key: item.original.cropped_r2_key,
          cropped_url: item.original.cropped_url,
          category: item.original.tags.category,
          primary_color: item.original.tags.primary_color,
          fabric_estimate: item.original.tags.fabric_estimate,
          pattern: item.original.tags.pattern,
          occasions: item.original.tags.occasions,
          search_tags: item.original.tags.search_tags,
          section_id: item.sectionId,
          phash: item.original.phash,
        })),
        selectedSectionId,
      )
      setSessionCreated((n) => n + result.data.total_created)
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      setItems([])
      setSourceUrl('')
      setStep('location')
    } catch (err) {
      setStep('reviewing')
      showError(err, 'Could not save products.', 'Save failed')
    }
  }, [items, selectedSectionId, queryClient])

  const toggleApproval = (index: number) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, approved: !it.approved } : it)))

  const cycleItemSection = (index: number) => {
    if (sections.length === 0) return
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it
        const currentIdx = sections.findIndex((s) => s.id === it.sectionId)
        const next = sections[(currentIdx + 1) % sections.length]!
        return { ...it, sectionId: next.id }
      }),
    )
  }

  const sectionName = (id: string | null) => sections.find((s) => s.id === id)?.name ?? 'No location'
  const catalogued = baselineCount + sessionCreated
  const approvedCount = items.filter((i) => i.approved).length

  // ── Render: location + photo picker step ────────────────────────

  const renderLocationStep = () => (
    <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 140 }}>
      <View className="items-center gap-3">
        <View className="w-20 h-20 bg-ink-100 rounded-3xl items-center justify-center">
          <Sparkles size={36} color={primaryColor} />
        </View>
        <Text className="text-lg font-bold text-sand-900 text-center">Bulk onboarding</Text>
        <Text className="text-sand-500 text-sm text-center px-6 leading-5">
          Photograph one rack/shelf at a time — AI splits it into individual products.
        </Text>
      </View>

      <View className="bg-ink-50 rounded-2xl p-4 mt-6 items-center">
        <Text className="text-2xl font-bold text-ink-800">
          {catalogued}
          {target ? ` / ${target}` : ''}
        </Text>
        <Text className="text-xs text-ink-600 mt-1">items catalogued so far</Text>
      </View>

      {error && (
        <View className="bg-rust-50 border border-rust-200 rounded-2xl p-4 mt-4 flex-row items-start gap-3">
          <AlertTriangle size={18} color="#BF6973" />
          <Text className="text-xs text-rust-600 flex-1">{error}</Text>
        </View>
      )}

      <Text className="text-sm font-semibold text-sand-700 mt-6 mb-2">
        Which rack/shelf is this photo?
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {sections.map((s) => (
          <AnimatedPressable
            key={s.id}
            onPress={() => setSelectedSectionId(s.id)}
            className={`px-4 py-2.5 rounded-xl border-2 ${
              selectedSectionId === s.id ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
            }`}
          >
            <Text className={selectedSectionId === s.id ? 'text-white font-medium' : 'text-sand-700'}>
              {s.name}
            </Text>
          </AnimatedPressable>
        ))}
        <AnimatedPressable
          onPress={() => setAddingSection(true)}
          className="px-4 py-2.5 rounded-xl border-2 border-dashed border-ink-300 flex-row items-center gap-1"
        >
          <Plus size={14} color={primaryColor} />
          <Text className="text-ink-600 font-medium">New</Text>
        </AnimatedPressable>
      </View>

      {addingSection && (
        <View className="flex-row items-center gap-2 mt-3">
          <TextInput
            value={newSectionName}
            onChangeText={setNewSectionName}
            placeholder="e.g. Rack A"
            className="flex-1 bg-sand-50 border border-sand-200 rounded-xl px-3 py-2.5 text-sm"
            autoFocus
          />
          <AnimatedPressable
            onPress={() => void handleCreateSection()}
            className="bg-ink-600 rounded-xl px-4 py-2.5"
          >
            <Text className="text-white font-medium text-sm">Add</Text>
          </AnimatedPressable>
        </View>
      )}

      <AnimatedPressable
        onPress={() => void handleCapturePhoto()}
        className="bg-ink-600 rounded-2xl p-4 flex-row items-center justify-center gap-2 mt-8"
      >
        <Camera size={20} color="white" />
        <Text className="text-white font-bold text-base">Photograph this rack</Text>
      </AnimatedPressable>

      <AnimatedPressable
        onPress={() => void handlePickPhoto()}
        className="border-2 border-sand-200 rounded-2xl p-4 items-center mt-3"
      >
        <Text className="text-sand-700 font-semibold text-sm">Choose from gallery</Text>
      </AnimatedPressable>

      <AnimatedPressable
        onPress={() => router.push('/product/catalog-import')}
        className="flex-row items-center justify-center gap-2 mt-4 py-2"
      >
        <FileText size={16} color="#847B75" />
        <Text className="text-sand-500 text-sm">Restocking from a supplier PDF instead?</Text>
      </AnimatedPressable>
    </ScrollView>
  )

  // ── Render: progress ─────────────────────────────────────────────

  const renderProgress = (label: string) => (
    <View className="flex-1 items-center justify-center px-8">
      <ActivityIndicator size="large" color={primaryColor} className="mb-4" />
      <Text className="text-lg font-bold text-sand-900 text-center">{label}</Text>
    </View>
  )

  // ── Render: review ────────────────────────────────────────────────

  const renderReview = () => (
    <>
      <View className="bg-white px-4 py-3 border-b border-sand-100">
        <Image source={{ uri: sourceUrl }} className="w-full h-32 rounded-xl bg-sand-100" contentFit="contain" />
      </View>
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 160 }}>
        <Text className="text-sm font-semibold text-sand-700 mb-3">
          AI detected {items.length} item{items.length !== 1 ? 's' : ''} — location defaults to{' '}
          {sectionName(selectedSectionId)}, tap the location chip to override.
        </Text>
        {items.map((item, index) => (
          <View
            key={`${item.original.description}-${index}`}
            className={`bg-white rounded-2xl border mb-3 overflow-hidden ${
              item.approved ? 'border-turmeric-200' : 'border-sand-200 opacity-60'
            }`}
          >
            <View className="flex-row p-3 gap-3">
              <Image
                source={{ uri: item.original.cropped_url }}
                className="w-20 h-24 rounded-xl bg-sand-100"
                contentFit="cover"
              />
              <View className="flex-1 justify-center gap-1">
                <Text className="text-sm font-semibold text-sand-900">{item.original.description}</Text>
                {item.original.tags.category && (
                  <Text className="text-xs bg-ink-50 text-ink-700 px-2 py-0.5 rounded-full self-start">
                    {item.original.tags.category}
                  </Text>
                )}
                <AnimatedPressable onPress={() => cycleItemSection(index)} className="mt-1">
                  <Text className="text-xs text-sand-500">
                    📍 {sectionName(item.sectionId)} {sections.length > 1 ? '(tap to change)' : ''}
                  </Text>
                </AnimatedPressable>
                {item.original.is_duplicate && (
                  <View className="flex-row items-center gap-1 mt-1">
                    <AlertTriangle size={12} color="#7D5334" />
                    <Text className="text-xs text-turmeric-600">Looks already catalogued</Text>
                  </View>
                )}
              </View>
              <AnimatedPressable
                onPress={() => toggleApproval(index)}
                className={`w-9 h-9 rounded-full items-center justify-center border-2 ${
                  item.approved ? 'bg-turmeric-500 border-turmeric-500' : 'border-sand-300'
                }`}
              >
                {item.approved && <Check size={18} color="white" />}
              </AnimatedPressable>
            </View>
          </View>
        ))}
        {items.length === 0 && (
          <Text className="text-sand-400 text-sm text-center py-12">No garments detected. Try a different photo.</Text>
        )}
      </ScrollView>
      <View className="bg-white border-t border-sand-100 px-4 pt-4" style={{ paddingBottom: 16 + insets.bottom }}>
        <GradientButton
          label={`Save ${approvedCount} & photograph next rack`}
          onPress={() => void handleSaveBatch()}
          disabled={approvedCount === 0}
        />
      </View>
    </>
  )

  const stepTitles: Record<Step, string> = {
    location: 'Bulk Onboarding',
    uploading: 'Uploading...',
    detecting: 'Analyzing rack photo...',
    reviewing: `Review (${items.length})`,
    saving: 'Saving products...',
  }

  return (
    <View className="flex-1 bg-sand-50">
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <AnimatedPressable onPress={() => router.back()} accessibilityLabel="Close" accessibilityRole="button">
          <X size={22} color="#4B4039" />
        </AnimatedPressable>
        <Text className="text-base font-bold text-sand-900">{stepTitles[step]}</Text>
        <View className="w-6" />
      </View>

      {step === 'location' && renderLocationStep()}
      {step === 'uploading' && renderProgress('Uploading photo...')}
      {step === 'detecting' && renderProgress('AI is finding each garment...')}
      {step === 'reviewing' && renderReview()}
      {step === 'saving' && renderProgress('Creating products...')}
    </View>
  )
}
