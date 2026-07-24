import { useState, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Modal,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X, User, ChevronLeft } from 'lucide-react-native'
import { staffApi, type StaffMember } from '../../src/lib/api'

// ─── Add Staff Modal ───────────────────────────────────────────────

function AddStaffModal({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const queryClient = useQueryClient()

  const createStaff = useMutation({
    mutationFn: () =>
      staffApi.create({
        name: name.trim(),
        phone: phone.replace(/\D/g, ''),
        role: 'salesperson',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] })
      onClose()
      setName('')
      setPhone('')
    },
    onError: (err: Error) => {
      Alert.alert('Error', err.message || 'Failed to add team member')
    },
  })

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center px-6">
        <View className="bg-white rounded-3xl w-full p-6 gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-gray-900">Add Team Member</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View>
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ramesh"
              className="bg-gray-50 px-4 py-3 rounded-xl text-sm text-gray-900"
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
          </View>

          <View>
            <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="9876543210"
              keyboardType="numeric"
              maxLength={10}
              className="bg-gray-50 px-4 py-3 rounded-xl text-sm text-gray-900"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View className="flex-row gap-3 mt-2">
            <TouchableOpacity
              onPress={onClose}
              disabled={createStaff.isPending}
              className="flex-1 bg-gray-100 py-3.5 rounded-2xl items-center"
            >
              <Text className="text-gray-700 font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => createStaff.mutate()}
              disabled={!name.trim() || phone.replace(/\D/g, '').length !== 10 || createStaff.isPending}
              className={`flex-1 py-3.5 rounded-2xl items-center ${
                name.trim() && phone.replace(/\D/g, '').length === 10 ? 'bg-cyan-600' : 'bg-gray-200'
              }`}
            >
              {createStaff.isPending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-white font-semibold">Add</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── Main Staff Screen ─────────────────────────────────────────────

export default function StaffScreen() {
  const [showAdd, setShowAdd] = useState(false)
  const queryClient = useQueryClient()
  const insets = useSafeAreaInsets()

  const { data, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => staffApi.list(),
    staleTime: 30_000,
  })

  const staff = ((data as { data: StaffMember[] } | undefined)?.data ?? []).filter((s) => s.is_active)

  const handleRemove = useCallback(
    (member: StaffMember) => {
      Alert.alert(
        'Remove Team Member',
        `Deactivate "${member.name}"? They can be re-added later.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                await staffApi.delete(member.id)
                void queryClient.invalidateQueries({ queryKey: ['staff'] })
              } catch (err) {
                Alert.alert('Error', err instanceof Error ? err.message : 'Failed to remove')
              }
            },
          },
        ],
      )
    },
    [queryClient],
  )

  const renderItem = useCallback(
    ({ item }: { item: StaffMember }) => (
      <View className="bg-white rounded-2xl p-4 border border-gray-100 flex-row items-center">
        <View className="w-10 h-10 rounded-full bg-cyan-100 items-center justify-center mr-3">
          <Text className="text-cyan-700 text-sm font-bold">
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-900">{item.name}</Text>
          <Text className="text-xs text-gray-400">{item.phone} · {item.role}</Text>
        </View>
        <TouchableOpacity
          onPress={() => handleRemove(item)}
          className="w-9 h-9 rounded-full bg-red-50 items-center justify-center"
        >
          <Trash2 size={16} color="#DC2626" />
        </TouchableOpacity>
      </View>
    ),
    [handleRemove],
  )

  return (
    <View className="flex-1 bg-cyan-50">
      {/* Header */}
      <View
        className="bg-white border-b border-gray-100 px-4 pb-4"
        style={{ paddingTop: insets.top + 12 }}
      >
        <View className="flex-row items-center gap-3">
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <ChevronLeft size={24} color="#374151" />
          </TouchableOpacity>
          <Text className="text-base font-bold text-gray-900">Team Members</Text>
        </View>
      </View>

      <View className="flex-1 px-4 pt-4">
        {isLoading ? (
          <ActivityIndicator className="mt-16" color="#0891B2" />
        ) : staff.length === 0 ? (
          <View className="items-center py-16">
            <User size={40} color="#D1D5DB" />
            <Text className="text-gray-400 text-sm mt-4 text-center">
              No team members yet.{'\n'}Add shop staff to help manage the catalog.
            </Text>
            <TouchableOpacity
              onPress={() => setShowAdd(true)}
              className="mt-4 bg-cyan-600 px-5 py-2.5 rounded-xl"
            >
              <Text className="text-white text-sm font-semibold">Add Team Member</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={staff}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={{ gap: 8, flexGrow: 1 }}
            ListHeaderComponent={
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {staff.length} active member{staff.length !== 1 ? 's' : ''}
                </Text>
              </View>
            }
          />
        )}

        {/* FAB */}
        <TouchableOpacity
          onPress={() => setShowAdd(true)}
          className="absolute bottom-6 right-4 w-14 h-14 bg-cyan-600 rounded-full items-center justify-center shadow-lg"
          style={{ elevation: 6 }}
        >
          <Plus size={24} color="white" />
        </TouchableOpacity>

        <AddStaffModal visible={showAdd} onClose={() => setShowAdd(false)} />
      </View>
    </View>
  )
}
