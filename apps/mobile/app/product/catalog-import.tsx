import { useState, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  TextInput,
  Alert,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as ImageManipulator from 'expo-image-manipulator'
import { Image } from 'expo-image'
import { useQueryClient } from '@tanstack/react-query'
import {
  X,
  Check,
  Sparkles,
  Edit3,
  Save,
  ImagePlus,
  AlertTriangle,
  FileText,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  catalogImportApi,
  uploadImageToR2,
  readLocalImage,
  type CatalogDetectedItem,
} from '../../src/lib/api'

// ─── Types ────────────────────────────────────────────────────────

type SourceType = 'image' | 'pdf'
type Step = 'source' | 'uploading' | 'detecting' | 'reviewing' | 'saving' | 'done'

type ReviewItem = {
  original: CatalogDetectedItem
  approved: boolean
  edits: {
    category: string
    primary_color: string
    fabric_estimate: string
    pattern: string
    occasions: string
    search_tags: string
    price: string
  }
}

// ─── Screen ───────────────────────────────────────────────────────

export default function CatalogImportScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const params = useLocalSearchParams<{
    sourceUrl?: string
    sourceR2Key?: string
  }>()

  const [step, setStep] = useState<Step>('source')
  const [sourceType, setSourceType] = useState<SourceType>('image')
  const [sourceUrl, setSourceUrl] = useState(params.sourceUrl ?? '')
  const [sourceR2Key, setSourceR2Key] = useState(params.sourceR2Key ?? '')
  const [items, setItems] = useState<ReviewItem[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [batchResult, setBatchResult] = useState<{
    requested: number
    created: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Pick photo from gallery ───────────────────────────────────

  const handlePickPhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      })

      if (result.canceled || !result.assets[0]) return

      const uri = result.assets[0].uri

      // Compress
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1400 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
      )

      setSourceUrl(compressed.uri)
      setSourceType('image')

      // Upload
      await uploadSource(compressed.uri, 'image/jpeg')
    } catch (err) {
      Alert.alert(
        'Photo Error',
        err instanceof Error ? err.message : 'Could not pick that photo.',
      )
    }
  }, [])

  // ── Upload source to R2 ───────────────────────────────────────

  const uploadSource = useCallback(async (uri: string, contentType: string) => {
    setStep('uploading')

    try {
      const blob = await readLocalImage(uri)
      const ext = contentType === 'application/pdf' ? '.pdf' : '.jpg'
      const filename = `catalog-source${ext}`

      const uploadResult = await catalogImportApi.getUploadUrl(
        filename,
        contentType,
        blob.size,
      )
      const info = uploadResult.data

      await uploadImageToR2(uri, info.upload_url, contentType)

      setSourceUrl(info.public_url)
      setSourceR2Key(info.r2_key)

      // Now run detection
      await runDetection(info.public_url)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Upload failed. Try again.',
      )
      setStep('source')
    }
  }, [])

  // ── Run AI detection ──────────────────────────────────────────

  const runDetection = useCallback(async (url: string) => {
    setStep('detecting')
    setError(null)

    try {
      const result = await catalogImportApi.detectItems(url)

      setItems(
        result.data.items.map((item) => ({
          original: item,
          approved: true,
          edits: {
            category: item.tags.category ?? '',
            primary_color: item.tags.primary_color ?? '',
            fabric_estimate: item.tags.fabric_estimate ?? '',
            pattern: item.tags.pattern ?? '',
            occasions: (item.tags.occasions ?? []).join(', '),
            search_tags: (item.tags.search_tags ?? []).join(', '),
            price: '',
          },
        })),
      )

      setStep('reviewing')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Detection failed. Try again.',
      )
      setStep('source')
    }
  }, [])

  // If source URL passed via params (from catalog screen), run detection
  // We use a ref-like pattern via a counter to avoid re-triggering on re-renders
  const [runCount, setRunCount] = useState(0)
  if (params.sourceUrl && runCount === 0) {
    setRunCount(1)
    // Defer to next microtask so state updates are batched
    queueMicrotask(() => {
      setSourceUrl(params.sourceUrl!)
      setSourceR2Key(params.sourceR2Key ?? '')
      setStep('detecting')
      runDetection(params.sourceUrl!).catch(() => {})
    })
  }

  // ── Toggle approval ───────────────────────────────────────────

  const toggleApproval = useCallback((index: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, approved: !item.approved } : item,
      ),
    )
  }, [])

  // ── Edit field update ─────────────────────────────────────────

  const updateEdit = useCallback(
    (index: number, field: keyof ReviewItem['edits'], value: string) => {
      setItems((prev) =>
        prev.map((item, i) =>
          i === index
            ? { ...item, edits: { ...item.edits, [field]: value } }
            : item,
        ),
      )
    },
    [],
  )

  // ── Save selected items ───────────────────────────────────────

  const handleSaveSelected = useCallback(async () => {
    const approved = items.filter((item) => item.approved)
    if (approved.length === 0) {
      Alert.alert('No items selected', 'Approve at least one item to import.')
      return
    }

    setStep('saving')

    try {
      const result = await catalogImportApi.bulkCreateProducts(
        approved.map((item) => ({
          cropped_r2_key: item.original.cropped_r2_key,
          cropped_url: item.original.cropped_url,
          category: item.edits.category || null,
          primary_color: item.edits.primary_color || null,
          fabric_estimate: item.edits.fabric_estimate || null,
          pattern: item.edits.pattern || null,
          occasions: item.edits.occasions
            ? item.edits.occasions
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          search_tags: item.edits.search_tags
            ? item.edits.search_tags
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
          ...(item.edits.price
            ? { price_min: Math.round(parseFloat(item.edits.price) * 100) }
            : {}),
        })),
      )

      setBatchResult({
        requested: approved.length,
        created: result.data.total_created,
      })

      void queryClient.invalidateQueries({ queryKey: ['products'] })
      setStep('done')
    } catch (err) {
      setStep('reviewing')
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Could not save products.',
      )
    }
  }, [items, queryClient])

  // ── Render Source Selection ───────────────────────────────────

  const renderSourceStep = () => (
    <>
      <ScrollView
        className="flex-1 px-4 pt-8"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View className="items-center pt-8 gap-4">
          <View className="w-20 h-20 bg-cyan-100 rounded-3xl items-center justify-center">
            <Sparkles size={36} color="#0891B2" />
          </View>
          <Text className="text-lg font-bold text-gray-900 text-center">
            Import products from photos
          </Text>
          <Text className="text-gray-500 text-sm text-center px-8 leading-5">
            Upload a catalog photo (rack shot, catalog page with multiple
            designs) or a PDF catalog. AI detects each garment, crops, and
            tags it.
          </Text>
        </View>

        {/* Error state */}
        {error && (
          <View className="bg-red-50 border border-red-200 rounded-2xl p-4 mt-6 flex-row items-start gap-3">
            <AlertTriangle size={18} color="#EF4444" className="mt-0.5" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-red-800">
                Detection failed
              </Text>
              <Text className="text-xs text-red-600 mt-1">{error}</Text>
            </View>
          </View>
        )}

        {/* Option cards */}
        <TouchableOpacity
          onPress={() => void handlePickPhoto()}
          className="bg-white rounded-2xl border border-gray-100 p-4 flex-row items-center gap-4 mt-6"
          activeOpacity={0.7}
        >
          <View className="w-14 h-14 bg-cyan-50 rounded-2xl items-center justify-center">
            <ImagePlus size={28} color="#0891B2" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-gray-900">
              Catalog Photo
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">
              Rack shot, catalog page, or multi-product display photo
            </Text>
          </View>
          <Text className="text-gray-300">→</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              'PDF Import',
              'Select a PDF catalog file. Each page will be analyzed for garments. ' +
                'For best results, render each page to an image on your device first, ' +
                'then upload the page images using the "Catalog Photo" option.',
            )
          }}
          className="bg-white rounded-2xl border border-gray-100 p-4 flex-row items-center gap-4"
          activeOpacity={0.7}
        >
          <View className="w-14 h-14 bg-amber-50 rounded-2xl items-center justify-center">
            <FileText size={28} color="#D97706" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-gray-900">
              PDF Catalog
            </Text>
            <Text className="text-xs text-gray-500 mt-0.5">
              Manufacturer/wholesaler PDF catalog
            </Text>
          </View>
          <Text className="text-gray-300">→</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Tip */}
      <View
        className="bg-white border-t border-gray-100 px-4 pt-4"
        style={{ paddingBottom: 16 + insets.bottom }}
      >
        <Text className="text-xs text-gray-400 text-center leading-5">
          💡 Tip: For best results, use a well-lit, front-facing photo with
          garments clearly separated.
        </Text>
      </View>
    </>
  )

  // ── Render Uploading / Detecting ──────────────────────────────

  const renderProgressStep = (label: string, sublabel: string) => (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-20 h-20 bg-cyan-100 rounded-3xl items-center justify-center mb-6">
        <Sparkles size={36} color="#0891B2" />
      </View>
      <ActivityIndicator size="large" color="#0891B2" className="mb-4" />
      <Text className="text-lg font-bold text-gray-900 text-center">
        {label}
      </Text>
      <Text className="text-gray-500 text-sm text-center mt-2 leading-5">
        {sublabel}
      </Text>
    </View>
  )

  // ── Render Review ─────────────────────────────────────────────

  const renderReviewStep = () => (
    <>
      {/* Source image preview */}
      <View className="bg-white px-4 py-3 border-b border-gray-100">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Source Photo
        </Text>
        <Image
          source={{ uri: sourceUrl }}
          className="w-full h-36 rounded-xl bg-gray-100"
          contentFit="contain"
        />
      </View>

      {/* Items */}
      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 180 }}
      >
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm font-semibold text-gray-700">
            AI detected {items.length} item
            {items.length !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity
            onPress={() =>
              setItems((prev) =>
                prev.map((item) => ({ ...item, approved: true })),
              )
            }
          >
            <Text className="text-xs text-cyan-600 font-medium">
              Select All
            </Text>
          </TouchableOpacity>
        </View>

        {items.map((item, index) => (
          <View
            key={`${item.original.description}-${index}`}
            className={`bg-white rounded-2xl border mb-3 overflow-hidden ${
              item.approved ? 'border-green-200' : 'border-gray-200 opacity-60'
            }`}
          >
            {/* Item header */}
            <View className="flex-row p-3 gap-3">
              <Image
                source={{ uri: item.original.cropped_url }}
                className="w-20 h-24 rounded-xl bg-gray-100"
                contentFit="cover"
              />
              <View className="flex-1 justify-center gap-0.5">
                <Text className="text-sm font-semibold text-gray-900">
                  {item.original.description}
                </Text>
                {item.original.tags.category && (
                  <View className="flex-row flex-wrap gap-1 mt-1">
                    <Text className="text-xs bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full">
                      {item.original.tags.category}
                    </Text>
                    {item.original.tags.primary_color && (
                      <Text className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {item.original.tags.primary_color}
                      </Text>
                    )}
                  </View>
                )}
                {item.original.tags.fabric_estimate && (
                  <Text className="text-xs text-gray-400 mt-1">
                    {item.original.tags.fabric_estimate}
                    {item.original.tags.pattern
                      ? ` · ${item.original.tags.pattern}`
                      : ''}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => toggleApproval(index)}
                className={`w-9 h-9 rounded-full items-center justify-center border-2 ${
                  item.approved
                    ? 'bg-green-500 border-green-500'
                    : 'border-gray-300'
                }`}
              >
                {item.approved && <Check size={18} color="white" />}
              </TouchableOpacity>
            </View>

            {/* Expandable editor */}
            {editingIndex === index && (
              <View className="px-3 pb-3 gap-2.5 border-t border-gray-100 pt-3">
                <EditField
                  label="Category"
                  value={item.edits.category}
                  onChange={(v) => updateEdit(index, 'category', v)}
                />
                <EditField
                  label="Color"
                  value={item.edits.primary_color}
                  onChange={(v) => updateEdit(index, 'primary_color', v)}
                />
                <EditField
                  label="Fabric"
                  value={item.edits.fabric_estimate}
                  onChange={(v) => updateEdit(index, 'fabric_estimate', v)}
                />
                <EditField
                  label="Pattern"
                  value={item.edits.pattern}
                  onChange={(v) => updateEdit(index, 'pattern', v)}
                />
                <EditField
                  label="Occasions (comma-sep)"
                  value={item.edits.occasions}
                  onChange={(v) => updateEdit(index, 'occasions', v)}
                />
                <EditField
                  label="Search tags (comma-sep)"
                  value={item.edits.search_tags}
                  onChange={(v) => updateEdit(index, 'search_tags', v)}
                />
                <EditField
                  label="Price (₹)"
                  value={item.edits.price}
                  onChange={(v) => updateEdit(index, 'price', v)}
                  keyboardType="numeric"
                />
                <TouchableOpacity
                  onPress={() => setEditingIndex(null)}
                  className="bg-gray-100 py-2.5 rounded-xl items-center mt-1"
                >
                  <Text className="text-sm text-gray-600 font-medium">
                    Done Editing
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {editingIndex !== index && (
              <TouchableOpacity
                onPress={() => setEditingIndex(index)}
                className="border-t border-gray-100 py-2.5 flex-row items-center justify-center gap-1.5"
              >
                <Edit3 size={14} color="#6B7280" />
                <Text className="text-xs text-gray-500 font-medium">
                  Edit details
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        {items.length === 0 && !error && (
          <View className="items-center py-12">
            <Text className="text-gray-400 text-sm">
              No garments detected. Try a different photo.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Save bar */}
      <View
        className="bg-white border-t border-gray-100 px-4 pt-4"
        style={{ paddingBottom: 16 + insets.bottom }}
      >
        <TouchableOpacity
          onPress={() => void handleSaveSelected()}
          disabled={items.filter((i) => i.approved).length === 0}
          className={`py-4 rounded-2xl items-center flex-row justify-center gap-2 ${
            items.filter((i) => i.approved).length > 0
              ? 'bg-cyan-600'
              : 'bg-gray-200'
          }`}
          activeOpacity={0.8}
        >
          <Save size={18} color="white" />
          <Text className="text-white font-bold text-base">
            Save {items.filter((i) => i.approved).length} Product
            {items.filter((i) => i.approved).length !== 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  )

  // ── Render Saving ─────────────────────────────────────────────

  const renderSavingStep = () => (
    <View className="flex-1 items-center justify-center px-8">
      <ActivityIndicator size="large" color="#0891B2" className="mb-4" />
      <Text className="text-lg font-bold text-gray-900 text-center">
        Creating products...
      </Text>
      <Text className="text-gray-500 text-sm text-center mt-2">
        AI tagging will continue in the background
      </Text>
    </View>
  )

  // ── Render Done ───────────────────────────────────────────────

  const renderDoneStep = () =>
    batchResult && (
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-24 h-24 bg-green-100 rounded-3xl items-center justify-center mb-6">
          <Text className="text-5xl">
            {batchResult.created === batchResult.requested ? '🎉' : '⚠️'}
          </Text>
        </View>

        <Text className="text-2xl font-bold text-gray-900 text-center">
          {batchResult.created === batchResult.requested
            ? 'All items imported!'
            : 'Import complete with errors'}
        </Text>
        <Text className="text-gray-500 text-base mt-2 text-center leading-5">
          {batchResult.created} of {batchResult.requested} items saved.
          {'\n'}AI is tagging them in the background.
        </Text>

        <View className="mt-8 w-full gap-3">
          <TouchableOpacity
            onPress={() => {
              void queryClient.invalidateQueries({ queryKey: ['products'] })
              router.replace('/(tabs)')
            }}
            className="py-4 rounded-2xl items-center bg-cyan-600"
            activeOpacity={0.8}
          >
            <Text className="text-white font-bold">View Catalog</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setItems([])
              setBatchResult(null)
              setError(null)
              setStep('source')
            }}
            className="py-4 rounded-2xl items-center border-2 border-gray-200"
            activeOpacity={0.7}
          >
            <Text className="text-gray-700 font-semibold">
              Import Another Photo
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )

  // ── Main Render ───────────────────────────────────────────────

  const stepTitles: Record<Step, string> = {
    source: 'Catalog Import',
    uploading: 'Uploading...',
    detecting: 'Analyzing Photo...',
    reviewing: `Review Items${items.length > 0 ? ` (${items.length})` : ''}`,
    saving: 'Saving Products...',
    done: 'Import Complete',
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-gray-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <TouchableOpacity
          onPress={() => {
            if (step === 'source' || step === 'done') {
              router.back()
            } else {
              setStep('source')
            }
          }}
        >
          <X size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">
          {stepTitles[step]}
        </Text>
        <View className="w-6" />
      </View>

      {step === 'source' && renderSourceStep()}
      {step === 'uploading' &&
        renderProgressStep('Uploading...', 'Sending to cloud...')}
      {step === 'detecting' &&
        renderProgressStep(
          'AI is analyzing your photo',
          'Detecting each garment, cropping, and tagging...',
        )}
      {step === 'reviewing' && renderReviewStep()}
      {step === 'saving' && renderSavingStep()}
      {step === 'done' && renderDoneStep()}
    </View>
  )
}

// ─── Edit Field Component ─────────────────────────────────────────

function EditField({
  label,
  value,
  onChange,
  keyboardType,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  keyboardType?: 'default' | 'numeric'
}) {
  return (
    <View>
      <Text className="text-xs font-medium text-gray-500 mb-1">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900"
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
      />
    </View>
  )
}
