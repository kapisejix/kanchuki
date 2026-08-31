import { useState, useEffect } from 'react'
import { formatPriceRange, COLORS } from '@kanchuki/shared'
import { View, Text, FlatList, TextInput, ActivityIndicator, Alert, Image, Modal } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { Plus, Trash2, Pencil, X, ImagePlus, ChevronLeft } from 'lucide-react-native'
import ProductCard from '../../src/components/ProductCard'
import { DetailScreenSkeleton, ProductGridSkeleton } from '../../src/components/Skeleton'
import { useGridColumns } from '../../src/hooks/useIsTablet'
import { productApi, categoryApi, readLocalImage, uploadImageToR2, type ProductCategory } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'

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
  const { primaryColor, colors } = useTheme()
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
        <View className="bg-white rounded-3xl w-full p-6 gap-4 border border-lavender-200 shadow-lg">
          <View className="flex-row items-center justify-between">
            <Text
              style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
              className="text-lg font-bold text-spaceCadet-900"
            >
              Edit Category
            </Text>
            <AnimatedPressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
              <X size={20} color="#6B4773" />
            </AnimatedPressable>
          </View>

          <View className="items-center">
            <AnimatedPressable
              onPress={() => void handlePickImage()}
              disabled={uploading}
              className="w-24 h-24 rounded-2xl bg-lavender-50 border border-lavender-200 items-center justify-center overflow-hidden"
            >
              {uploading ? (
                <ActivityIndicator color="#BB3F95" />
              ) : imageUrl ? (
                <Image source={{ uri: imageUrl }} style={{ width: 96, height: 96 }} resizeMode="cover" />
              ) : (
                <ImagePlus size={22} color="#6B4773" />
              )}
            </AnimatedPressable>
            <Text className="text-[10px] text-heliotrope-500 mt-1.5 font-medium">Tap to change photo</Text>
          </View>

          <View>
            <Text className="text-xs font-bold text-heliotrope-600 uppercase tracking-wide mb-1.5">
              Category Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              className="bg-lavender-50 px-4 py-3 rounded-2xl text-sm font-bold text-spaceCadet-900 border border-lavender-200"
              maxLength={100}
            />
          </View>

          <View className="flex-row gap-3 mt-2">
            <AnimatedPressable onPress={onClose} disabled={saving} className="flex-1 bg-lavender-100 py-3.5 rounded-2xl items-center border border-lavender-200">
              <Text className="text-spaceCadet-900 font-bold text-xs uppercase tracking-wider">Cancel</Text>
            </AnimatedPressable>
            <View className="flex-1">
              <GradientButton
                label="Save Changes"
                onPress={() => void handleSave()}
                loading={saving}
                disabled={name.trim().length === 0}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

export default function CategoryDetailScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const columns = useGridColumns()
  const queryClient = useQueryClient()
  const [editModalOpen, setEditModalOpen] = useState(false)

  const { data: categoryData, isLoading: categoryLoading } = useQuery({
    queryKey: ['categories', id],
    queryFn: () => categoryApi.get(id),
  })
  const category = categoryData?.data

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'by-category', id],
    queryFn: () => productApi.list({ category_id: id, limit: 50 }),
  })
  const products = (productsData?.data as unknown as Product[]) ?? []

  const handleDelete = () => {
    Alert.alert('Delete Category', `Are you sure you want to delete "${category?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await categoryApi.delete(id)
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            router.back()
          } catch (err) {
            showError(err, 'Failed to delete category')
          }
        },
      },
    ])
  }

  if (categoryLoading) {
    return <DetailScreenSkeleton />
  }

  if (!category) {
    return (
      <View className="flex-1 items-center justify-center p-6 bg-[#F8F7FC]">
        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-lg font-bold text-spaceCadet-900"
        >
          Category not found
        </Text>
        <AnimatedPressable onPress={() => router.back()} className="mt-4 px-6 py-2.5 rounded-full bg-spaceCadet-900">
          <Text className="text-white font-bold text-xs">Go Back</Text>
        </AnimatedPressable>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-[#F8F7FC]">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-5 pb-3 bg-white border-b border-lavender-200"
        style={{ paddingTop: Math.max(insets.top, 24) + 12 }}
      >
        <AnimatedPressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
          hitSlop={8}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ChevronLeft size={20} color="#231F48" />
        </AnimatedPressable>

        <Text
          style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
          className="text-lg font-bold text-spaceCadet-900 truncate max-w-[200px]"
          numberOfLines={1}
        >
          {category.name}
        </Text>

        <View className="flex-row items-center gap-2">
          <AnimatedPressable
            onPress={() => setEditModalOpen(true)}
            className="w-10 h-10 rounded-full bg-lavender-100 items-center justify-center border border-lavender-200"
            accessibilityLabel="Edit category"
          >
            <Pencil size={18} color="#231F48" />
          </AnimatedPressable>
          <AnimatedPressable
            onPress={handleDelete}
            className="w-10 h-10 rounded-full bg-red-50 items-center justify-center border border-red-200"
            accessibilityLabel="Delete category"
          >
            <Trash2 size={18} color="#DC2626" />
          </AnimatedPressable>
        </View>
      </View>

      {/* Category Info Banner */}
      <View className="bg-white px-5 py-3.5 border-b border-lavender-200 flex-row items-center gap-3.5">
        <View className="w-14 h-14 rounded-2xl bg-lavender-100 border border-lavender-200 overflow-hidden items-center justify-center">
          {category.image_url ? (
            <Image source={{ uri: category.image_url }} style={{ width: 56, height: 56 }} resizeMode="cover" />
          ) : (
            <Text className="text-xl">🗂️</Text>
          )}
        </View>
        <View className="flex-1">
          <Text
            style={{ fontFamily: 'Marcellus_400Regular', letterSpacing: 0.32, fontWeight: '800' }}
            className="text-base font-bold text-spaceCadet-900"
          >
            {category.name}
          </Text>
          <Text className="text-xs text-heliotrope-500 font-medium mt-0.5">
            {products.length} product{products.length === 1 ? '' : 's'} in category
          </Text>
        </View>
      </View>

      {productsLoading ? (
        <ProductGridSkeleton />
      ) : (
        <FlatList
          key={columns}
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          columnWrapperStyle={{ gap: 14 }}
          contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
          renderItem={({ item }) => (
            <ProductCard
              imageUrl={item.primary_photo_url}
              onPress={() => router.push(`/product/${item.id}`)}
              statusBadge={item.status !== 'AVAILABLE' ? item.status : null}
              footer={
                <View className="gap-0.5">
                  <Text className="text-xs font-bold text-spaceCadet-900 truncate" numberOfLines={1}>
                    {item.category ?? 'Product'}
                    {item.primary_color ? ` · ${item.primary_color}` : ''}
                  </Text>
                  <Text className="text-xs font-extrabold text-spaceCadet-900 mt-0.5">
                    {formatPriceRange(item.price_min, item.price_max)}
                  </Text>
                </View>
              }
            />
          )}
          ListEmptyComponent={
            <View className="items-center py-16 px-6">
              <Text className="text-heliotrope-500 text-sm font-medium">No products in this category yet</Text>
            </View>
          }
        />
      )}

      {/* Add Products FAB */}
      <AnimatedPressable
        onPress={() => router.push(`/category/${id}/add-products`)}
        className="absolute bottom-8 right-6 flex-row items-center gap-2 bg-spaceCadet-900 px-5 py-3.5 rounded-full shadow-lg border border-white/20"
        style={{
          shadowColor: '#231F48',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 10,
          elevation: 6,
        }}
      >
        <Plus size={18} color="white" strokeWidth={2.5} />
        <Text className="text-white text-xs font-extrabold uppercase tracking-wider">Add Products</Text>
      </AnimatedPressable>

      <EditCategoryModal
        visible={editModalOpen}
        category={category}
        onClose={() => setEditModalOpen(false)}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['categories'] })
        }}
      />
    </View>
  )
}
