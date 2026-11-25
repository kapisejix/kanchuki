import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router } from 'expo-router';
import { Check, Droplet, ImagePlus } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { GradientButton } from '../../src/components/GradientButton';
import { KeyboardScreen } from '../../src/components/KeyboardScreen';
import {
  type ShowcaseDesignCategory,
  prepareImageForUpload,
  showcaseDesignsApi,
  uploadImageToR2,
} from '../../src/lib/api';
import { showError } from '../../src/lib/errors';
import { useScreenInsets } from '../../src/lib/safe-area';

export default function NewShowcaseDesignScreen() {
  const { insets } = useScreenInsets();
  const queryClient = useQueryClient();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [rawR2Key, setRawR2Key] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [detectedColor, setDetectedColor] = useState<string | null>(null);

  const { data: categoriesData } = useQuery({
    queryKey: ['showcase-designs', 'categories'],
    queryFn: () => showcaseDesignsApi.categories(),
    staleTime: 60_000,
  });
  const categories: ShowcaseDesignCategory[] = categoriesData?.data ?? [];

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (result.canceled || !result.assets[0]) return;

    const uri = result.assets[0].uri;
    setUploading(true);
    try {
      // Compress + upload the RAW image (server watermarks it on create).
      const prep = await prepareImageForUpload(uri, 'image/jpeg');
      const uploadResult = await showcaseDesignsApi.getUploadUrl('image/jpeg', prep.size);
      const info = uploadResult.data;
      await uploadImageToR2(prep.uri, info.upload_url, 'image/jpeg', undefined, undefined, {
        compress: false,
      });
      setPhotoUri(info.public_url);
      setRawR2Key(info.r2_key);
      // Auto-suggest a retail-ready name + color from the photo (AI, fail-open).
      setSuggesting(true);
      try {
        const suggestion = await showcaseDesignsApi.suggest(info.r2_key);
        const s = suggestion.data;
        if (s.color) setDetectedColor(s.color);
        const suggestedName = s.name;
        if (suggestedName) setName((prev) => (prev.trim() ? prev : suggestedName));
      } catch {
        // AI unavailable — leave the name blank for manual entry.
      } finally {
        setSuggesting(false);
      }
    } catch (err) {
      showError(err, 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const create = useMutation({
    mutationFn: () => {
      if (!categoryId || !rawR2Key) throw new Error('Pick a category and a photo first');
      return showcaseDesignsApi.create({
        category_id: categoryId,
        name: name.trim() ? name.trim() : null,
        raw_r2_key: rawR2Key,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['showcase-designs'] });
      router.back();
    },
    onError: (err: Error) => showError(err, 'Please try again.', 'Could not save design'),
  });

  const canSave = !!photoUri && !!rawR2Key && !!categoryId && !uploading && !create.isPending;

  return (
    <>
      <Stack.Screen options={{ title: 'New Design', headerShown: true, presentation: 'modal' }} />
      <KeyboardScreen>
        <ScrollView
          className="flex-1 bg-[#F8F7FC]"
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 20 }}
        >
          {/* Photo picker */}
          <View className="items-center">
            <AnimatedPressable
              onPress={() => void handlePickImage()}
              disabled={uploading}
              className="w-44 h-56 rounded-2xl bg-white border border-lavender-200 items-center justify-center overflow-hidden border-dashed"
            >
              {uploading ? (
                <ActivityIndicator color="#6B4773" />
              ) : photoUri ? (
                <Image
                  source={{ uri: photoUri }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              ) : (
                <View className="items-center gap-2 px-4">
                  <ImagePlus size={30} color="#6B4773" />
                  <Text className="text-xs text-heliotrope-500 font-medium text-center">
                    Tap to add a design photo
                  </Text>
                </View>
              )}
            </AnimatedPressable>
            <View className="flex-row items-center gap-1.5 mt-2.5 bg-lavender-100 px-3 py-1.5 rounded-full border border-lavender-200">
              <Droplet size={12} color="#6B4773" />
              <Text className="text-[11px] text-heliotrope-600 font-semibold">
                A light store watermark is added automatically
              </Text>
            </View>
          </View>

          {/* Category (DB chips, required) */}
          <View>
            <Text className="text-xs font-semibold text-heliotrope-600 mb-2">Category *</Text>
            <View className="flex-row flex-wrap gap-2">
              {categories.map((cat) => {
                const selected = categoryId === cat.id;
                return (
                  <AnimatedPressable
                    key={cat.id}
                    onPress={() => setCategoryId(selected ? null : cat.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className={`px-3.5 py-2 rounded-full border flex-row items-center gap-1.5 ${
                      selected
                        ? 'bg-spaceCadet-900 border-spaceCadet-900'
                        : 'bg-white border-lavender-200'
                    }`}
                  >
                    {selected && <Check size={12} color="white" />}
                    <Text
                      className={`text-xs font-semibold ${selected ? 'text-white' : 'text-spaceCadet-900'}`}
                    >
                      {cat.name}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </View>
            {categories.length === 0 && (
              <Text className="text-xs text-heliotrope-500 font-medium mt-1">
                No design categories yet — the admin adds them from the web dashboard.
              </Text>
            )}
          </View>

          {/* Name (optional) — AI auto-suggested when the photo is added */}
          <View>
            <Text className="text-xs font-semibold text-heliotrope-600 mb-1.5">
              Name (optional)
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={suggesting ? 'Detecting name…' : 'e.g. Anarkali floor-length'}
              placeholderTextColor="#928EB2"
              className="bg-white px-4 py-3 rounded-2xl text-sm font-semibold text-spaceCadet-900 border border-lavender-200"
              maxLength={150}
              editable={!suggesting}
            />
            <View className="flex-row items-center gap-2 mt-1.5">
              {suggesting ? (
                <View className="flex-row items-center gap-1.5">
                  <ActivityIndicator size={12} color="#6B4773" />
                  <Text className="text-[11px] text-heliotrope-500 font-medium">
                    Auto-detecting name &amp; color…
                  </Text>
                </View>
              ) : detectedColor ? (
                <View className="flex-row items-center gap-1.5 bg-lavender-100 px-2.5 py-1 rounded-full border border-lavender-200">
                  <Droplet size={12} color="#6B4773" />
                  <Text className="text-[11px] text-heliotrope-600 font-semibold">
                    Detected color: {detectedColor}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <GradientButton
            variant="web"
            label="Save Design"
            disabled={!canSave}
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
        </ScrollView>
      </KeyboardScreen>
    </>
  );
}
