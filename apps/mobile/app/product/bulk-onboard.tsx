import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Camera, Check, FileText, Plus, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { GradientButton } from '../../src/components/GradientButton';
import { KeyboardScreen } from '../../src/components/KeyboardScreen';
import { addAudience, audienceFromTags } from '../../src/components/product-detail/AudienceChips';
import {
  type CatalogDetectedItem,
  catalogImportApi,
  prepareImageForUpload,
  retailerApi,
  uploadImageToR2,
} from '../../src/lib/api';
import { apiMessage, logError, showError } from '../../src/lib/errors';
import { useScreenInsets } from '../../src/lib/safe-area';
import { useTheme } from '../../src/lib/theme';

// F-001d: guided bulk onboarding — Path A (rack/shelf batch capture).
// Reuses the same detect/tag/crop pipeline as F-001c/F-001b (catalog-import.ts);
// the only net-new piece is asking for rack/shelf location once per photo
// instead of once per item, plus a running catalogued-count across photos.

// ─── Types ────────────────────────────────────────────────────────

type Section = { id: string; name: string; type: string };

type Step = 'location' | 'uploading' | 'detecting' | 'reviewing' | 'saving';

type ReviewItem = {
  original: CatalogDetectedItem;
  approved: boolean;
  sectionId: string | null;
};

export default function BulkOnboardScreen() {
  const { primaryColor, colors } = useTheme();
  const { insets, headerPaddingTop } = useScreenInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ target?: string }>();
  const target = params.target ? Number(params.target) : null;

  const [step, setStep] = useState<Step>('location');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [newSectionName, setNewSectionName] = useState('');
  const [addingSection, setAddingSection] = useState(false);

  const [baselineCount, setBaselineCount] = useState(0);
  const [sessionCreated, setSessionCreated] = useState(0);

  const [sourceUrl, setSourceUrl] = useState('');
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ── Load sections + baseline catalog count once ────────────────

  useEffect(() => {
    retailerApi
      .getSections()
      .then((res) => setSections(res.data as Section[]))
      .catch((err) =>
        setError(
          apiMessage(err, 'Could not load your racks. Go back and reopen this screen to retry.'),
        ),
      );
    retailerApi
      .getStats()
      .then((res) => {
        const stats = res.data as { total_products_available?: number };
        setBaselineCount(stats.total_products_available ?? 0);
      })
      .catch((err) =>
        setError(
          apiMessage(err, 'Could not load your catalogue count, so the number below may be low.'),
        ),
      );
  }, []);

  // ── Create a new rack/shelf inline ──────────────────────────────

  const handleCreateSection = useCallback(async () => {
    const name = newSectionName.trim();
    if (!name) return;
    try {
      const res = await retailerApi.createSection({ name, type: 'rack' });
      setSections((prev) => [...prev, res.data as Section]);
      setSelectedSectionId(res.data.id);
      setNewSectionName('');
      setAddingSection(false);
    } catch (err) {
      showError(err, 'Try again.', 'Could not add location');
    }
  }, [newSectionName]);

  // ── Capture + upload + detect one rack photo ────────────────────

  const runPhoto = useCallback(
    async (uri: string) => {
      setStep('uploading');
      setError(null);
      try {
        const compressed = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1400 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
        );
        const prep = await prepareImageForUpload(compressed.uri, 'image/jpeg');
        const uploadResult = await catalogImportApi.getUploadUrl(
          'rack-photo.jpg',
          'image/jpeg',
          prep.size,
        );
        const info = uploadResult.data;
        await uploadImageToR2(prep.uri, info.upload_url, 'image/jpeg', undefined, undefined, {
          compress: false,
        });
        setSourceUrl(info.public_url);

        setStep('detecting');
        const detected = await catalogImportApi.detectItems(info.public_url);
        setItems(
          detected.data.items.map((item) => ({
            original: item,
            approved: true,
            sectionId: selectedSectionId,
          })),
        );
        setStep('reviewing');
      } catch (err) {
        logError(err);
        setError(apiMessage(err, 'Something went wrong. Try again.'));
        setStep('location');
      }
    },
    [selectedSectionId],
  );

  const handleCapturePhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled || !result.assets[0]) return;
      await runPhoto(result.assets[0].uri);
    } catch (err) {
      showError(err, 'Could not take that photo.', 'Camera Error');
    }
  }, [runPhoto]);

  const handlePickPhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      await runPhoto(result.assets[0].uri);
    } catch (err) {
      showError(err, 'Could not pick that photo.', 'Photo Error');
    }
  }, [runPhoto]);

  // ── Save this photo's approved items, then loop back ────────────

  const handleSaveBatch = useCallback(async () => {
    const approved = items.filter((i) => i.approved);
    if (approved.length === 0) {
      Alert.alert('No items selected', 'Approve at least one item to save.');
      return;
    }
    setStep('saving');
    try {
      const result = await catalogImportApi.bulkCreateProducts(
        approved.map((item) => ({
          cropped_r2_key: item.original.cropped_r2_key,
          cropped_url: item.original.cropped_url,
          category: item.original.tags.category,
          // AI audience first, keyword guess from the category when the AI gave none.
          ...addAudience(audienceFromTags(item.original.tags), [item.original.tags.category ?? '']),
          primary_color: item.original.tags.primary_color,
          fabric_estimate: item.original.tags.fabric_estimate,
          pattern: item.original.tags.pattern,
          search_tags: item.original.tags.search_tags,
          section_id: item.sectionId,
        })),
        selectedSectionId,
      );
      setSessionCreated((n) => n + result.data.total_created);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['retailer', 'stats'] });
      setItems([]);
      setSourceUrl('');
      setStep('location');
    } catch (err) {
      setStep('reviewing');
      showError(err, 'Could not save products.', 'Save failed');
    }
  }, [items, selectedSectionId, queryClient]);

  const toggleApproval = (index: number) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, approved: !it.approved } : it)));

  const cycleItemSection = (index: number) => {
    if (sections.length === 0) return;
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== index) return it;
        const currentIdx = sections.findIndex((s) => s.id === it.sectionId);
        const next = sections[(currentIdx + 1) % sections.length];
        return next ? { ...it, sectionId: next.id } : it;
      }),
    );
  };

  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? 'No location';
  const catalogued = baselineCount + sessionCreated;
  const approvedCount = items.filter((i) => i.approved).length;

  // ── Render: location + photo picker step ────────────────────────

  const renderLocationStep = () => (
    <ScrollView className="flex-1 px-4 pt-6" contentContainerStyle={{ paddingBottom: 140 }}>
      <View className="items-center gap-3">
        <Camera size={32} color="#6B4773" />
        <Text className="text-lg font-semibold text-spaceCadet-900 text-center">
          Bulk onboarding
        </Text>
        <Text className="text-heliotrope-500 text-sm text-center px-6 leading-5">
          Photograph one rack/shelf at a time — AI splits it into individual products.
        </Text>
      </View>

      <View className="bg-lavender-50 rounded-2xl p-4 mt-6 items-center">
        <Text className="text-2xl font-semibold text-ink-800">
          {catalogued}
          {target ? ` / ${target}` : ''}
        </Text>
        <Text className="text-xs text-ink-600 mt-1">items catalogued so far</Text>
      </View>

      {error && (
        <View className="bg-rust-50 border border-rust-200 rounded-2xl p-4 mt-4 flex-row items-start gap-3">
          <AlertTriangle size={18} color={colors.rust[500]} />
          <Text className="text-xs text-rust-600 flex-1">{error}</Text>
        </View>
      )}

      <Text className="text-sm font-semibold text-heliotrope-600 mt-6 mb-2">
        Which rack/shelf is this photo?
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {sections.map((s) => (
          <AnimatedPressable
            key={s.id}
            onPress={() => setSelectedSectionId(s.id)}
            className={`px-4 py-2.5 rounded-xl border-2 ${
              selectedSectionId === s.id
                ? 'bg-ink-600 border-ink-600'
                : 'bg-white border-lavender-200'
            }`}
          >
            <Text
              className={
                selectedSectionId === s.id ? 'text-white font-medium' : 'text-heliotrope-600'
              }
            >
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
            className="flex-1 bg-lavender-50 border border-lavender-200 rounded-xl px-3 py-2.5 text-sm"
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
        <Text className="text-white font-semibold text-base">Photograph this rack</Text>
      </AnimatedPressable>

      <AnimatedPressable
        onPress={() => void handlePickPhoto()}
        className="border-2 border-lavender-200 rounded-2xl p-4 items-center mt-3"
      >
        <Text className="text-heliotrope-600 font-semibold text-sm">Choose from gallery</Text>
      </AnimatedPressable>

      <AnimatedPressable
        onPress={() => router.push('/product/catalog-import')}
        className="flex-row items-center justify-center gap-2 mt-4 py-2 border border-lavender-200 rounded-lg px-3 min-h-[36px]"
      >
        <FileText size={16} color={colors.sand[600]} />
        <Text className="text-heliotrope-500 text-sm">Restocking from a supplier PDF instead?</Text>
      </AnimatedPressable>
    </ScrollView>
  );

  // ── Render: progress ─────────────────────────────────────────────

  const renderProgress = (label: string) => (
    <View className="flex-1 items-center justify-center px-8">
      <ActivityIndicator size="large" color={primaryColor} className="mb-4" />
      <Text className="text-lg font-semibold text-spaceCadet-900 text-center">{label}</Text>
    </View>
  );

  // ── Render: review ────────────────────────────────────────────────

  const renderReview = () => (
    <>
      <View className="bg-white px-4 py-3 border-b border-lavender-200">
        <Image
          source={{ uri: sourceUrl }}
          className="w-full h-32 rounded-xl bg-sand-100"
          contentFit="contain"
        />
      </View>
      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 160 }}>
        <Text className="text-sm font-semibold text-heliotrope-600 mb-3">
          AI detected {items.length} item{items.length !== 1 ? 's' : ''} — location defaults to{' '}
          {sectionName(selectedSectionId)}, tap the location chip to override.
        </Text>
        {items.map((item, index) => (
          <View
            key={`${item.original.description}-${index}`}
            className={`bg-white rounded-2xl border mb-3 overflow-hidden ${
              item.approved ? 'border-turmeric-200' : 'border-lavender-200 opacity-60'
            }`}
          >
            <View className="flex-row p-3 gap-3">
              <Image
                source={{ uri: item.original.cropped_url }}
                className="w-20 h-24 rounded-xl bg-sand-100"
                contentFit="cover"
              />
              <View className="flex-1 justify-center gap-1">
                <Text className="text-sm font-semibold text-spaceCadet-900">
                  {item.original.description}
                </Text>
                {item.original.tags.category && (
                  <Text className="text-xs bg-lavender-50 text-ink-700 px-2 py-0.5 rounded-full self-start">
                    {item.original.tags.category}
                  </Text>
                )}
                <AnimatedPressable onPress={() => cycleItemSection(index)} className="mt-1">
                  <Text className="text-xs text-heliotrope-500">
                    {sectionName(item.sectionId)} {sections.length > 1 ? '(tap to change)' : ''}
                  </Text>
                </AnimatedPressable>
              </View>
              <AnimatedPressable
                onPress={() => toggleApproval(index)}
                className={`w-9 h-9 rounded-full items-center justify-center border-2 ${
                  item.approved ? 'bg-turmeric-500 border-turmeric-500' : 'border-lavender-300'
                }`}
              >
                {item.approved && <Check size={18} color="white" />}
              </AnimatedPressable>
            </View>
          </View>
        ))}
        {items.length === 0 && (
          <Text className="text-heliotrope-500 text-sm text-center py-12">
            No garments detected. Try a different photo.
          </Text>
        )}
      </ScrollView>
      <View
        className="bg-white border-t border-lavender-200 px-4 pt-4"
        style={{ paddingBottom: 16 + insets.bottom }}
      >
        <GradientButton
          variant="web"
          label={`Save ${approvedCount} & photograph next rack`}
          onPress={() => void handleSaveBatch()}
          disabled={approvedCount === 0}
        />
      </View>
    </>
  );

  const stepTitles: Record<Step, string> = {
    location: 'Bulk Onboarding',
    uploading: 'Uploading...',
    detecting: 'Analyzing rack photo...',
    reviewing: `Review (${items.length})`,
    saving: 'Saving products...',
  };

  return (
    <KeyboardScreen className="flex-1 bg-lavender-50">
      <View
        className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-lavender-200"
        style={{ paddingTop: headerPaddingTop }}
      >
        <AnimatedPressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <X size={22} color={colors.sand[700]} />
        </AnimatedPressable>
        <Text className="text-base font-semibold text-spaceCadet-900">{stepTitles[step]}</Text>
        <View className="w-6" />
      </View>

      {step === 'location' && renderLocationStep()}
      {step === 'uploading' && renderProgress('Uploading photo...')}
      {step === 'detecting' && renderProgress('AI is finding each garment...')}
      {step === 'reviewing' && renderReview()}
      {step === 'saving' && renderProgress('Creating products...')}
    </KeyboardScreen>
  );
}
