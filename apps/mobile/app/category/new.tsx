import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native'
import { Stack, router } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as ImagePicker from 'expo-image-picker'
import { ImagePlus } from 'lucide-react-native'
import { categoryApi, readLocalImage, uploadImageToR2 } from '../../src/lib/api'

export default function NewCategoryScreen() {
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
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to upload image')
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
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      router.replace(`/category/${res.data.id}`)
    },
    onError: (err: Error) => Alert.alert('Could not create category', err.message),
  })

  const canCreate = name.trim().length > 0 && !uploading && !create.isPending

  return (
    <>
      <Stack.Screen options={{ title: 'New Category', headerShown: true }} />
      <View className="flex-1 bg-cyan-50 px-4 py-5 gap-4">
        <View className="items-center">
          <TouchableOpacity
            onPress={() => void handlePickImage()}
            disabled={uploading}
            className="w-28 h-28 rounded-2xl bg-white border border-gray-200 items-center justify-center overflow-hidden"
          >
            {uploading ? (
              <ActivityIndicator color="#0891B2" />
            ) : imageUrl ? (
              <Image source={{ uri: imageUrl }} style={{ width: 112, height: 112 }} resizeMode="cover" />
            ) : (
              <ImagePlus size={26} color="#9CA3AF" />
            )}
          </TouchableOpacity>
          <Text className="text-xs text-gray-400 mt-1.5">
            {imageUrl ? 'Tap to change photo' : 'Add a cover photo (optional)'}
          </Text>
        </View>

        <View>
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
            Category Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Wedding Sarees"
            placeholderTextColor="#9CA3AF"
            className="bg-white px-4 py-3 rounded-xl text-sm text-gray-900 border border-gray-100"
            maxLength={100}
          />
        </View>

        <TouchableOpacity
          disabled={!canCreate}
          onPress={() => create.mutate()}
          className={`py-3.5 rounded-xl items-center mt-2 ${canCreate ? 'bg-cyan-600' : 'bg-gray-200'}`}
        >
          <Text className={`font-semibold ${canCreate ? 'text-white' : 'text-gray-400'}`}>
            {create.isPending ? 'Creating…' : 'Create Category'}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  )
}
