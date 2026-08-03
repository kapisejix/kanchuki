import { useState, useCallback } from 'react'
import { SIZE_OPTIONS, COLORS } from '@kanchuki/shared'
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  TextInput,
  Alert,
  Switch,
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
import { showError, logError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'

// ─── Types ────────────────────────────────────────────────────────

type SourceType = 'image' | 'pdf'
type Step = 'source' | 'uploading' | 'detecting' | 'reviewing' | 'saving' | 'done'

type ReviewItem = {
  original: CatalogDetectedItem
  approved: boolean
  edits: {
    product_name: string
    subtype: string
    short_description: string
    category: string
    primary_color: string
    fabric_estimate: string
    pattern: string
    occasions: string
    search_tags: string
    sizes: string[]
    price: string
  }
}

// ─── Screen ───────────────────────────────────────────────────────

export default function CatalogImportScreen() {
  const { primaryColor } = useTheme()
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
  // Asked once per import batch — most catalogs don't list sizes, so default off.
  const [wantSizes, setWantSizes] = useState(false)
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
        allowsMultipleSelection: true,
        selectionLimit: 20,
      })

      if (result.canceled || result.assets.length === 0) return

      if (result.assets.length === 1) {
        const uri = result.assets[0]!.uri
        const compressed = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1400 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        )
        setSourceUrl(compressed.uri)
        setSourceType('image')
        await uploadSource(compressed.uri, 'image/jpeg')
        return
      }

      // Multiple pages picked at once (e.g. screenshots of a wholesaler PDF
      // catalog) — detect on each, merge into one review/select queue below.
      await uploadAndDetectMultiple(result.assets.map((a) => a.uri))
    } catch (err) {
      showError(err, 'Could not pick those photos.', 'Photo Error')
    }
  }, [])

  // ── Upload + detect multiple source photos, merge into one queue ─

  const uploadAndDetectMultiple = useCallback(async (uris: string[]) => {
    setStep('uploading')
    setError(null)
    try {
      const uploadedUrls: string[] = []
      for (const uri of uris) {
        const compressed = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1400 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        )
        const blob = await readLocalImage(compressed.uri)
        const uploadResult = await catalogImportApi.getUploadUrl(
          'catalog-source.jpg',
          'image/jpeg',
          blob.size,
        )
        const info = uploadResult.data
        await uploadImageToR2(compressed.uri, info.upload_url, 'image/jpeg')
        uploadedUrls.push(info.public_url)
      }
      setSourceUrl(uploadedUrls[0] ?? '')
      setSourceType('image')

      setStep('detecting')
      const merged: CatalogDetectedItem[] = []
      for (let i = 0; i < uploadedUrls.length; i++) {
        try {
          const detected = await catalogImportApi.detectItems(uploadedUrls[i]!)
          for (const item of detected.data.items) {
            merged.push({
              ...item,
              description: `Page ${i + 1}: ${item.description}`,
            })
          }
        } catch (err) {
          console.error(`Detection failed for page ${i + 1}:`, err)
        }
      }

      setItems(
        merged.map((item) => ({
          original: item,
          approved: !item.is_duplicate,
          edits: {
            product_name: item.tags.product_name ?? '',
            subtype: item.tags.subtype ?? '',
            short_description: item.tags.short_description ?? '',
            category: item.tags.category ?? '',
            primary_color: item.tags.primary_color ?? '',
            fabric_estimate: item.tags.fabric_estimate ?? '',
            pattern: item.tags.pattern ?? '',
            occasions: (item.tags.occasions ?? []).join(', '),
            search_tags: (item.tags.search_tags ?? []).join(', '),
            sizes: [],
            price: '',
          },
        })),
      )
      setStep('reviewing')
    } catch (err) {
      logError(err)
      setError('Upload failed. Try again.')
      setStep('source')
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
      logError(err)
      setError('Upload failed. Try again.')
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
            product_name: item.tags.product_name ?? '',
            subtype: item.tags.subtype ?? '',
            short_description: item.tags.short_description ?? '',
            category: item.tags.category ?? '',
            primary_color: item.tags.primary_color ?? '',
            fabric_estimate: item.tags.fabric_estimate ?? '',
            pattern: item.tags.pattern ?? '',
            occasions: (item.tags.occasions ?? []).join(', '),
            search_tags: (item.tags.search_tags ?? []).join(', '),
            sizes: [],
            price: '',
          },
        })),
      )

      setStep('reviewing')
    } catch (err) {
      logError(err)
      setError('Detection failed. Try again.')
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

  // ── Toggle a size checkbox for one item ─────────────────────────

  const toggleItemSize = useCallback((index: number, size: string) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const sizes = item.edits.sizes.includes(size)
          ? item.edits.sizes.filter((s) => s !== size)
          : [...item.edits.sizes, size]
        return { ...item, edits: { ...item.edits, sizes } }
      }),
    )
  }, [])

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
          product_name: item.edits.product_name || null,
          subtype: item.edits.subtype || null,
          short_description: item.edits.short_description || null,
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
          sizes: wantSizes && item.edits.sizes.length > 0 ? item.edits.sizes : undefined,
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
      void queryClient.invalidateQueries({ queryKey: ['retailer', 'stats'] })
      setStep('done')
    } catch (err) {
      setStep('reviewing')
      showError(err, 'Could not save products.', 'Save failed')
    }
  }, [items, queryClient, wantSizes])

  // ── Render Source Selection ───────────────────────────────────

  const renderSourceStep = () => (
    <>
      <ScrollView
        className="flex-1 px-4 pt-8"
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View className="items-center pt-8 gap-4">
          <View className="w-20 h-20 bg-ink-100 rounded-3xl items-center justify-center">
            <Sparkles size={36} color={primaryColor} />
          </View>
          <Text className="text-lg font-bold text-sand-900 text-center">
            Import products from photos
          </Text>
          <Text className="text-sand-500 text-sm text-center px-8 leading-5">
            Upload a catalog photo (rack shot, catalog page with multiple
            designs) or a PDF catalog. AI detects each garment, crops, and
            tags it.
          </Text>
        </View>

        {/* Error state */}
        {error && (
          <View className="bg-rust-50 border border-rust-200 rounded-2xl p-4 mt-6 flex-row items-start gap-3">
            <AlertTriangle size={18} color={COLORS.rust[500]} className="mt-0.5" />
            <View className="flex-1">
              <Text className="text-sm font-semibold text-rust-800">
                Detection failed
              </Text>
              <Text className="text-xs text-rust-600 mt-1">{error}</Text>
            </View>
          </View>
        )}

        {/* Option cards */}
        <AnimatedPressable
          onPress={() => void handlePickPhoto()}
          className="bg-white rounded-2xl border border-sand-100 p-4 flex-row items-center gap-4 mt-6"
        >
          <View className="w-14 h-14 bg-ink-50 rounded-2xl items-center justify-center">
            <ImagePlus size={28} color={primaryColor} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-sand-900">
              Catalog Photo
            </Text>
            <Text className="text-xs text-sand-500 mt-0.5">
              Rack shot, catalog page, or multi-product display photo — pick
              several pages at once, then choose which products to import
            </Text>
          </View>
          <Text className="text-sand-300">→</Text>
        </AnimatedPressable>

        <AnimatedPressable
          onPress={() => {
            Alert.alert(
              'PDF Import',
              'Select a PDF catalog file. Each page will be analyzed for garments. ' +
                'For best results, render each page to an image on your device first, ' +
                'then upload the page images using the "Catalog Photo" option.',
            )
          }}
          className="bg-white rounded-2xl border border-sand-100 p-4 flex-row items-center gap-4"
        >
          <View className="w-14 h-14 bg-turmeric-50 rounded-2xl items-center justify-center">
            <FileText size={28} color={COLORS.turmeric[600]} />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-sand-900">
              PDF Catalog
            </Text>
            <Text className="text-xs text-sand-500 mt-0.5">
              Manufacturer/wholesaler PDF catalog
            </Text>
          </View>
          <Text className="text-sand-300">→</Text>
        </AnimatedPressable>
      </ScrollView>

      {/* Tip */}
      <View
        className="bg-white border-t border-sand-100 px-4 pt-4"
        style={{ paddingBottom: 16 + insets.bottom }}
      >
        <Text className="text-xs text-sand-400 text-center leading-5">
          💡 Tip: For best results, use a well-lit, front-facing photo with
          garments clearly separated.
        </Text>
      </View>
    </>
  )

  // ── Render Uploading / Detecting ──────────────────────────────

  const renderProgressStep = (label: string, sublabel: string) => (
    <View className="flex-1 items-center justify-center px-8">
      <View className="w-20 h-20 bg-ink-100 rounded-3xl items-center justify-center mb-6">
        <Sparkles size={36} color={primaryColor} />
      </View>
      <ActivityIndicator size="large" color={primaryColor} className="mb-4" />
      <Text className="text-lg font-bold text-sand-900 text-center">
        {label}
      </Text>
      <Text className="text-sand-500 text-sm text-center mt-2 leading-5">
        {sublabel}
      </Text>
    </View>
  )

  // ── Render Review ─────────────────────────────────────────────

  const renderReviewStep = () => (
    <>
      {/* Source image preview */}
      <View className="bg-white px-4 py-3 border-b border-sand-100">
        <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-2">
          Source Photo
        </Text>
        <Image
          source={{ uri: sourceUrl }}
          className="w-full h-36 rounded-xl bg-sand-100"
          contentFit="contain"
        />
      </View>

      {/* Items */}
      <ScrollView
        className="flex-1 px-4 pt-4"
        contentContainerStyle={{ paddingBottom: 180 }}
      >
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm font-semibold text-sand-700">
            AI detected {items.length} item
            {items.length !== 1 ? 's' : ''}
          </Text>
          <AnimatedPressable
            onPress={() =>
              setItems((prev) =>
                prev.map((item) => ({ ...item, approved: true })),
              )
            }
          >
            <Text className="text-xs text-ink-600 font-medium">
              Select All
            </Text>
          </AnimatedPressable>
        </View>

        {/* Ask once per batch — most catalogs don't list sizes */}
        <View className="bg-white rounded-2xl border border-sand-100 p-3 mb-3 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-semibold text-sand-900">Add sizes?</Text>
            <Text className="text-xs text-sand-500 mt-0.5">
              Turn on to pick S/M/L/XL/XXL/XXXL for each item below. Leave off if the catalog doesn&apos;t list sizes.
            </Text>
          </View>
          <Switch value={wantSizes} onValueChange={setWantSizes} />
        </View>

        {items.map((item, index) => (
          <View
            key={`${item.original.description}-${index}`}
            className={`bg-white rounded-2xl border mb-3 overflow-hidden ${
              item.approved ? 'border-turmeric-200' : 'border-sand-200 opacity-60'
            }`}
          >
            {/* Item header */}
            <View className="flex-row p-3 gap-3">
              <Image
                source={{ uri: item.original.cropped_url }}
                className="w-20 h-24 rounded-xl bg-sand-100"
                contentFit="cover"
              />
              <View className="flex-1 justify-center gap-0.5">
                <Text className="text-sm font-semibold text-sand-900">
                  {item.original.description}
                </Text>
                {item.original.tags.category && (
                  <View className="flex-row flex-wrap gap-1 mt-1">
                    <Text className="text-xs bg-ink-50 text-ink-700 px-2 py-0.5 rounded-full">
                      {item.original.tags.category}
                    </Text>
                    {item.original.tags.subtype && (
                      <Text className="text-xs bg-turmeric-50 text-turmeric-700 px-2 py-0.5 rounded-full">
                        {item.original.tags.subtype}
                      </Text>
                    )}
                    {item.original.tags.primary_color && (
                      <Text className="text-xs bg-sand-100 text-sand-600 px-2 py-0.5 rounded-full">
                        {item.original.tags.primary_color}
                      </Text>
                    )}
                  </View>
                )}
                {item.original.tags.fabric_estimate && (
                  <Text className="text-xs text-sand-400 mt-1">
                    {item.original.tags.fabric_estimate}
                    {item.original.tags.pattern
                      ? ` · ${item.original.tags.pattern}`
                      : ''}
                  </Text>
                )}
              </View>
              <AnimatedPressable
                onPress={() => toggleApproval(index)}
                className={`w-9 h-9 rounded-full items-center justify-center border-2 ${
                  item.approved
                    ? 'bg-turmeric-500 border-turmeric-500'
                    : 'border-sand-300'
                }`}
              >
                {item.approved && <Check size={18} color="white" />}
              </AnimatedPressable>
            </View>

            {/* Expandable editor */}
            {editingIndex === index && (
              <View className="px-3 pb-3 gap-2.5 border-t border-sand-100 pt-3">
                <EditField
                  label="Name"
                  value={item.edits.product_name}
                  onChange={(v) => updateEdit(index, 'product_name', v)}
                />
                <EditField
                  label="Subtype"
                  value={item.edits.subtype}
                  onChange={(v) => updateEdit(index, 'subtype', v)}
                />
                <EditField
                  label="Short description"
                  value={item.edits.short_description}
                  onChange={(v) => updateEdit(index, 'short_description', v)}
                />
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
                {wantSizes && (
                  <View>
                    <Text className="text-xs font-medium text-sand-500 mb-1">Sizes</Text>
                    <View className="flex-row flex-wrap gap-2">
                      {SIZE_OPTIONS.map((size) => {
                        const selected = item.edits.sizes.includes(size)
                        return (
                          <AnimatedPressable
                            key={size}
                            onPress={() => toggleItemSize(index, size)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                              selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                            }`}
                          >
                            {selected && <Check size={12} color="white" />}
                            <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>
                              {size}
                            </Text>
                          </AnimatedPressable>
                        )
                      })}
                    </View>
                  </View>
                )}
                <AnimatedPressable
                  onPress={() => setEditingIndex(null)}
                  className="bg-sand-100 py-2.5 rounded-xl items-center mt-1"
                >
                  <Text className="text-sm text-sand-600 font-medium">
                    Done Editing
                  </Text>
                </AnimatedPressable>
              </View>
            )}

            {editingIndex !== index && (
              <AnimatedPressable
                onPress={() => setEditingIndex(index)}
                className="border-t border-sand-100 py-2.5 flex-row items-center justify-center gap-1.5"
              >
                <Edit3 size={14} color={COLORS.sand[600]} />
                <Text className="text-xs text-sand-500 font-medium">
                  Edit details
                </Text>
              </AnimatedPressable>
            )}
          </View>
        ))}

        {items.length === 0 && !error && (
          <View className="items-center py-12">
            <Text className="text-sand-400 text-sm">
              No garments detected. Try a different photo.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Save bar */}
      <View
        className="bg-white border-t border-sand-100 px-4 pt-4"
        style={{ paddingBottom: 16 + insets.bottom }}
      >
        <AnimatedPressable
          onPress={() => void handleSaveSelected()}
          disabled={items.filter((i) => i.approved).length === 0}
          className={`py-4 rounded-2xl items-center flex-row justify-center gap-2 ${
            items.filter((i) => i.approved).length > 0
              ? 'bg-ink-600'
              : 'bg-sand-200'
          }`}
        >
          <Save size={18} color="white" />
          <Text className="text-white font-bold text-base">
            Save {items.filter((i) => i.approved).length} Product
            {items.filter((i) => i.approved).length !== 1 ? 's' : ''}
          </Text>
        </AnimatedPressable>
      </View>
    </>
  )

  // ── Render Saving ─────────────────────────────────────────────

  const renderSavingStep = () => (
    <View className="flex-1 items-center justify-center px-8">
      <ActivityIndicator size="large" color={primaryColor} className="mb-4" />
      <Text className="text-lg font-bold text-sand-900 text-center">
        Creating products...
      </Text>
      <Text className="text-sand-500 text-sm text-center mt-2">
        AI tagging will continue in the background
      </Text>
    </View>
  )

  // ── Render Done ───────────────────────────────────────────────

  const renderDoneStep = () =>
    batchResult && (
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-24 h-24 bg-turmeric-100 rounded-3xl items-center justify-center mb-6">
          <Text className="text-5xl">
            {batchResult.created === batchResult.requested ? '🎉' : '⚠️'}
          </Text>
        </View>

        <Text className="text-2xl font-bold text-sand-900 text-center">
          {batchResult.created === batchResult.requested
            ? 'All items imported!'
            : 'Import complete with errors'}
        </Text>
        <Text className="text-sand-500 text-base mt-2 text-center leading-5">
          {batchResult.created} of {batchResult.requested} items saved.
          {'\n'}AI is tagging them in the background.
        </Text>

        <View className="mt-8 w-full gap-3">
          <AnimatedPressable
            onPress={() => {
              void queryClient.invalidateQueries({ queryKey: ['products'] })
              void queryClient.invalidateQueries({ queryKey: ['retailer', 'stats'] })
              router.replace('/')
            }}
            className="py-4 rounded-2xl items-center bg-ink-600"
          >
            <Text className="text-white font-bold">View Catalog</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => {
              setItems([])
              setBatchResult(null)
              setError(null)
              setStep('source')
            }}
            className="py-4 rounded-2xl items-center border-2 border-sand-200"
          >
            <Text className="text-sand-700 font-semibold">
              Import Another Photo
            </Text>
          </AnimatedPressable>
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
    <View className="flex-1 bg-sand-50">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100"
        style={{ paddingTop: insets.top + 12 }}
      >
        <AnimatedPressable
          onPress={() => {
            if (step === 'source' || step === 'done') {
              router.back()
            } else {
              setStep('source')
            }
          }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <X size={22} color={COLORS.sand[700]} />
        </AnimatedPressable>
        <Text className="text-base font-bold text-sand-900">
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
      <Text className="text-xs font-medium text-sand-500 mb-1">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        className="bg-sand-50 border border-sand-200 rounded-xl px-3 py-2.5 text-sm text-sand-900"
        placeholderTextColor={COLORS.sand[400]}
        keyboardType={keyboardType}
      />
    </View>
  )
}
