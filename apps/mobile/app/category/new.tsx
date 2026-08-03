import { useState } from 'react'
import { PRODUCT_CATEGORIES, COLORS } from '@kanchuki/shared'
import { View, Text, TextInput, ActivityIndicator, Image } from 'react-native'
import { Stack, router } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { ImagePlus, Check } from 'lucide-react-native'
import { categoryApi, readLocalImage, uploadImageToR2 } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

export default function NewCategoryScreen() {
  const { primaryColor } = useTheme()
  const [name, setName] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageR2Key, setImageR2Key] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const queryClient = useQueryClient()

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    })
    if (result.canceled || !result.assets[0]) return

    setUploading(true)
    try {
      const uri = result.assets[0].uri
      const blob = await readLocalImage(uri)
      const uploadResult = await categoryApi.getUploadUrl('image/jpeg', blob.size)
      const info = uploadResult.data
      await uploadImageToR2(uri, info.upload_url, 'image/jpeg')
      setImageUrl(info.public_url)
      setImageR2Key(info.r2_key)
    } catch (err) {
      showError(err, 'Failed to upload image')
    } finally {
      setUploading(false)
    }
  }

  const create = useMutation({
    mutationFn: () =>
      categoryApi.create({
        name: name.trim(),
        image_url: imageUrl ?? undefined,
        image_r2_key: imageR2Key ?? undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      router.back()
    },
    onError: (err: Error) => showError(err, 'Please try again.', 'Could not create category'),
  })

  const canCreate = name.trim().length > 0 && !uploading && !create.isPending

  return (
    <>
      <Stack.Screen options={{ title: 'New Category', headerShown: true }} />
      <View className="flex-1 bg-ink-50 px-4 py-5 gap-4">
        <View className="items-center">
          <AnimatedPressable
            onPress={() => void handlePickImage()}
            disabled={uploading}
            className="w-28 h-28 rounded-2xl bg-white border border-sand-200 items-center justify-center overflow-hidden"
          >
            {uploading ? (
              <ActivityIndicator color={primaryColor} />
            ) : imageUrl ? (
              <Image source={{ uri: imageUrl }} style={{ width: 112, height: 112 }} resizeMode="cover" />
            ) : (
              <ImagePlus size={26} color={COLORS.sand[400]} />
            )}
          </AnimatedPressable>
          <Text className="text-xs text-sand-400 mt-1.5">
            {imageUrl ? 'Tap to change photo' : 'Add a cover photo (optional)'}
          </Text>
        </View>

        <View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
            Category Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Wedding Sarees"
            placeholderTextColor={COLORS.sand[400]}
            className="bg-white px-4 py-3 rounded-xl text-sm text-sand-900 border border-sand-100"
            maxLength={100}
          />
        </View>

        <View>
          <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
            Suggestions
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PRODUCT_CATEGORIES.map((cat) => {
              const selected = name.trim() === cat
              return (
                <AnimatedPressable
                  key={cat}
                  onPress={() => setName(cat)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-3 py-1.5 rounded-full border flex-row items-center gap-1 ${
                    selected ? 'bg-ink-600 border-ink-600' : 'bg-white border-sand-200'
                  }`}
                >
                  {selected && <Check size={12} color="white" />}
                  <Text className={`text-xs font-medium ${selected ? 'text-white' : 'text-sand-600'}`}>
                    {cat}
                  </Text>
                </AnimatedPressable>
              )
            })}
          </View>
        </View>

        <GradientButton
          label="Create Category"
          disabled={!canCreate}
          loading={create.isPending}
          onPress={() => create.mutate()}
        />
      </View>
    </>
  )
}
