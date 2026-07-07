import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react-native'
import { customerApi } from '../../src/lib/api'

export default function AddCustomerScreen() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Missing info', 'Name and phone are required.')
      return
    }
    setSaving(true)
    try {
      const res = await customerApi.create({ name: name.trim(), phone: phone.trim() })
      void queryClient.invalidateQueries({ queryKey: ['customers'] })
      const created = (res as { data: { id: string } }).data
      router.replace(`/customer/${created.id}`)
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create customer')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="flex-row items-center justify-between px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()}>
          <X size={22} color="#374151" />
        </TouchableOpacity>
        <Text className="text-base font-bold text-gray-900">New Customer</Text>
        <TouchableOpacity
          onPress={() => void handleSave()}
          disabled={saving}
          className="bg-violet-600 px-4 py-2 rounded-xl"
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-semibold text-sm">Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <View className="px-4 py-4 gap-4">
        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Customer name"
            placeholderTextColor="#9CA3AF"
            className="text-base text-gray-900"
            autoFocus
          />
        </View>

        <View className="bg-white rounded-2xl p-4 border border-gray-100">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Phone</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="10-digit mobile number"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
            className="text-base text-gray-900"
          />
        </View>

        <Text className="text-xs text-gray-400 px-1">
          Preferences, budget, and measurements can be added after saving.
        </Text>
      </View>
    </ScrollView>
  )
}
