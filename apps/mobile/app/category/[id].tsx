import { useState, useEffect } from 'react'
import { View, Text, FlatList, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image, Modal } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { Plus, Trash2, Pencil, X, ImagePlus, ChevronLeft } from 'lucide-react-native'
import ProductCard from '../../src/components/ProductCard'
import { DetailScreenSkeleton, ProductGridSkeleton } from '../../src/components/Skeleton'
import { productApi, categoryApi, readLocalImage, uploadImageToR2, type ProductCategory } from '../../src/lib/api'
import { formatPriceRange } from '@kanchuki/shared'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'

type Product = {
  id: string
  category: string | null
  primary_color: string | null
  price_min: number | null
  price_max: number | null
  status: string
  primary_photo_url: string | null
}

function EditCategoryModal({
  visible,
  category,
  onClose,
  onSaved,
}: {
  visible: boolean
  category: ProductCategory | null
  onClose: () => void
  onSaved: () => void
}) {
  const { primaryColor } = useTheme()
  const [name, setName] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageR2Key, setImageR2Key] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (category) {
      setName(category.name)
      setImageUrl(category.image_url)
      setImageR2Key(null)
    }
  }, [category, visible])

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

  const handleSave = async () => {
    if (!category || name.trim().length === 0) return
    setSaving(true)
    try {
      await categoryApi.update(category.id, {
        name: name.trim(),
        ...(imageR2Key ? { image_url: imageUrl, image_r2_key: imageR2Key } : {}),
      })
      onSaved()
      onClose()
    } catch (err) {
      showError(err, 'Failed to update category')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center px-6">
        <View className="bg-white rounded-3xl w-full p-6 gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-sand-900">Edit Category</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color="#ABA39C" />
            </TouchableOpacity>
          </View>

          <View className="items-center">
            <TouchableOpacity
              onPress={() => void handlePickImage()}
              disabled={uploading}
              className="w-24 h-24 rounded-2xl bg-sand-50 border border-sand-200 items-center justify-center overflow-hidden"
            >
              {uploading ? (
                <ActivityIndicator color={primaryColor} />
              ) : imageUrl ? (
                <Image source={{ uri: imageUrl }} style={{ width: 96, height: 96 }} resizeMode="cover" />
              ) : (
                <ImagePlus size={22} color="#ABA39C" />
              )}
            </TouchableOpacity>
            <Text className="text-[10px] text-sand-400 mt-1.5">Tap to change photo</Text>
          </View>

          <View>
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
              Category Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              className="bg-sand-50 px-4 py-3 rounded-xl text-sm text-sand-900"
              maxLength={100}
            />
          </View>

          <View className="flex-row gap-3 mt-2">
            <TouchableOpacity onPress={onClose} disabled={saving} className="flex-1 bg-sand-100 py-3.5 rounded-2xl items-center">
              <Text className="text-sand-700 font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleSave()}
              disabled={saving || uploading || name.trim().length === 0}
              className="flex-1 bg-ink-600 py-3.5 rounded-2xl items-center"
            >
              {saving ? <ActivityIndicator size="small" color="white" /> : <Text className="text-white font-semibold">Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

export default function CategoryDetailScreen() {
  const { primaryColor } = useTheme()
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  const { data: catData, isLoading: catLoading } = useQuery({
    queryKey: ['categories', id],
    queryFn: () => categoryApi.get(id),
  })
  const category = catData?.data

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'list', { category_id: id }],
    queryFn: () => productApi.list({ category_id: id, limit: 50 }),
    enabled: !!id,
  })
  const products = ((productsData as { data: Product[] } | undefined)?.data ?? [])

  const handleDelete = () => {
    Alert.alert(
      `Delete "${category?.name}"?`,
      'Products stay in your catalog — they just lose this category label.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true)
            try {
              await categoryApi.delete(id)
              await queryClient.invalidateQueries({ queryKey: ['categories'] })
              router.back()
            } catch (err) {
              showError(err, 'Try again.', 'Delete failed')
              setDeleting(false)
            }
          },
        },
      ],
    )
  }

  if (catLoading || !category) {
    return <DetailScreenSkeleton withPhoto={false} />
  }

  return (
    <>
      <View className="flex-1 bg-ink-50">
        {/* Icon-only header — no title text, matches the rest of the app's
            custom headers instead of the native Stack header (which showed
            the previous screen's title as the back-button label). */}
        <View
          className="flex-row items-center justify-between px-4 pb-4 bg-white border-b border-sand-100"
          style={{ paddingTop: insets.top + 12 }}
        >
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <ChevronLeft size={24} color="#4B4039" />
          </TouchableOpacity>
          <View className="flex-row items-center gap-4">
            <TouchableOpacity onPress={() => setShowEdit(true)} hitSlop={8}>
              <Pencil size={18} color={primaryColor} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} disabled={deleting} hitSlop={8}>
              {deleting ? <ActivityIndicator size="small" color="#A24854" /> : <Trash2 size={20} color="#A24854" />}
            </TouchableOpacity>
          </View>
        </View>

        <View className="bg-white px-4 py-3 border-b border-sand-100 flex-row items-center gap-3">
          <View className="w-14 h-14 rounded-xl bg-sand-100 overflow-hidden items-center justify-center">
            {category.image_url ? (
              <Image source={{ uri: category.image_url }} style={{ width: 56, height: 56 }} resizeMode="cover" />
            ) : (
              <Text className="text-xl">🗂️</Text>
            )}
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-sand-900">{category.name}</Text>
            <Text className="text-xs text-sand-500 mt-0.5">
              {category.product_count} product{category.product_count === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        {productsLoading ? (
          <ProductGridSkeleton />
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={{ gap: 10 }}
            contentContainerStyle={{ padding: 12, gap: 10, flexGrow: 1 }}
            renderItem={({ item }) => (
              <ProductCard
                imageUrl={item.primary_photo_url}
                onPress={() => router.push(`/product/${item.id}`)}
                footer={
                  <View className="p-2.5">
                    <Text className="text-xs font-semibold text-sand-900" numberOfLines={1}>
                      {item.category ?? 'Product'} · {item.primary_color ?? '—'}
                    </Text>
                    <Text className="text-xs text-sand-500 mt-0.5">
                      {formatPriceRange(item.price_min, item.price_max)}
                    </Text>
                  </View>
                }
              />
            )}
            ListEmptyComponent={
              <View className="items-center py-16">
                <Text className="text-sand-400 text-sm">No products in this category yet</Text>
              </View>
            }
          />
        )}

        <TouchableOpacity
          onPress={() => router.push(`/category/${id}/add-products`)}
          className="absolute bottom-6 right-4 flex-row items-center gap-1.5 bg-ink-600 px-4 py-3.5 rounded-full shadow-lg"
          style={{ elevation: 6 }}
          activeOpacity={0.85}
        >
          <Plus size={18} color="white" />
          <Text className="text-white text-sm font-semibold">Add Products</Text>
        </TouchableOpacity>
      </View>

      <EditCategoryModal
        visible={showEdit}
        category={category}
        onClose={() => setShowEdit(false)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['categories'] })
        }}
      />
    </>
  )
}
