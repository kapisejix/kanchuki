import { useState } from 'react'
import { View, Text, TextInput, ActivityIndicator, Image, ScrollView } from 'react-native'
import { Stack, router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { ImagePlus, Check, Droplet } from 'lucide-react-native'
import {
  showcaseDesignsApi,
  uploadImageToR2,
  type ShowcaseDesignCategory,
} from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useScreenInsets } from '../../src/lib/safe-area'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

export default function NewShowcaseDesignScreen() {
  const { insets } = useScreenInsets()
  const queryClient = useQueryClient()
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [rawR2Key, setRawR2Key] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [name, setName] = useState('')

  const { data: categoriesData } = useQuery({
    queryKey: ['showcase-designs', 'categories'],
    queryFn: () => showcaseDesignsApi.categories(),
    staleTime: 60_000,
  })
  const categories: ShowcaseDesignCategory[] = categoriesData?.data ?? []

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [3, 4],
    })
    if (result.canceled || !result.assets[0]) return

    const uri = result.assets[0].uri
    setUploading(true)
    try {
      // Compress + upload the RAW image (server watermarks it on create).
      const uploadResult = await showcaseDesignsApi.getUploadUrl('image/jpeg')
      const info = uploadResult.data
      await uploadImageToR2(uri, info.upload_url, 'image/jpeg')
      setPhotoUri(info.public_url)
      setRawR2Key(info.r2_key)
    } catch (err) {
      showError(err, 'Failed to upload photo')
    } finally {
      setUploading(false)
    }
  }

  const create = useMutation({
    mutationFn: () =>
      showcaseDesignsApi.create({
        category_id: categoryId!,
        name: name.trim() ? name.trim() : null,
        raw_r2_key: rawR2Key!,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['showcase-designs'] })
      router.back()
    },
    onError: (err: Error) => showError(err, 'Please try again.', 'Could not save design'),
  })

  const canSave = !!photoUri && !!rawR2Key && !!categoryId && !uploading && !create.isPending

  return (
    <>
      <Stack.Screen options={{ title: 'New Design', headerShown: true, presentation: 'modal' }} />
      <ScrollView
        className="flex-1 bg-[#F8F7FC]"
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 20 }}
      >
        {/* Photo picker */}
        <View className="items-center">
          <AnimatedPressable
            onPress={() => void handlePickImage()}
            disabled={uploading}
            className="w-44 h-56 rounded-3xl bg-white border border-lavender-200 items-center justify-center overflow-hidden shadow-sm border-dashed"
          >
            {uploading ? (
              <ActivityIndicator color="#BB3F95" />
            ) : photoUri ? (
              <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <View className="items-center gap-2 px-4">
                <ImagePlus size={30} color="#6B4773" />
                <Text className="text-xs text-heliotrope-500 font-medium text-center">Tap to add a design photo</Text>
              </View>
            )}
          </AnimatedPressable>
          <View className="flex-row items-center gap-1.5 mt-2.5 bg-lavender-100 px-3 py-1.5 rounded-full border border-lavender-200">
            <Droplet size={12} color="#6B4773" />
            <Text className="text-[11px] text-heliotrope-600 font-bold">
              A light store watermark is added automatically
            </Text>
          </View>
        </View>

        {/* Category (DB chips, required) */}
        <View>
          <Text className="text-xs font-bold text-heliotrope-600 uppercase tracking-wide mb-2">Category *</Text>
          <View className="flex-row flex-wrap gap-2">
            {categories.map((cat) => {
              const selected = categoryId === cat.id
              return (
                <AnimatedPressable
                  key={cat.id}
                  onPress={() => setCategoryId(selected ? null : cat.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3.5 py-2 rounded-full border flex-row items-center gap-1.5 ${
                    selected ? 'bg-spaceCadet-900 border-spaceCadet-900' : 'bg-white border-lavender-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-spaceCadet-900'}`}>
                    {cat.name}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
          {categories.length === 0 && (
            <Text className="text-xs text-heliotrope-500 font-medium mt-1">
              No design categories yet — the admin adds them from the web dashboard.
            </Text>
          )}
        </View>

        {/* Name (optional) */}
        <View>
          <Text className="text-xs font-bold text-heliotrope-600 uppercase tracking-wide mb-1.5">
            Name (optional)
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Anarkali floor-length"
            placeholderTextColor="#928EB2"
            className="bg-white px-4 py-3 rounded-2xl text-sm font-bold text-spaceCadet-900 border border-lavender-200"
            maxLength={150}
          />
        </View>

        <GradientButton label="Save Design" disabled={!canSave} loading={create.isPending} onPress={() => create.mutate()} />
      </ScrollView>
    </>
  )
}