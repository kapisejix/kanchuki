import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ChevronRight, ChevronLeft, User, CreditCard, Smartphone,
  Users, QrCode, Trash2, LogOut, Check, X, Package,
  BarChart2, AlertTriangle,
} from 'lucide-react-native'
import { retailerApi, clearToken } from '../../src/lib/api'

// ─── Profile Edit Modal ────────────────────────────────────────────

function ProfileEditModal({
  visible,
  retailer,
  onClose,
  onSaved,
}: {
  visible: boolean
  retailer: Record<string, any> | null
  onClose: () => void
  onSaved: () => void
}) {
  const [shopName, setShopName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [city, setCity] = useState('')
  const [stateVal, setStateVal] = useState('')
  const [gstin, setGstin] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (retailer) {
      setShopName(retailer.shop_name ?? '')
      setOwnerName(retailer.owner_name ?? '')
      setCity(retailer.city ?? '')
      setStateVal(retailer.state ?? '')
      setGstin(retailer.gstin ?? '')
    }
  }, [retailer])

  const handleSave = async () => {
    if (!shopName.trim()) return
    setSaving(true)
    try {
      await retailerApi.update({
        shop_name: shopName.trim(),
        owner_name: ownerName.trim() || undefined,
        city: city.trim() || undefined,
        state: stateVal.trim() || undefined,
        gstin: gstin.trim() || undefined,
      })
      onSaved()
      onClose()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 bg-black/50 justify-center px-6"
      >
        <View className="bg-white rounded-3xl w-full p-6 gap-4 max-h-[80%]">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-gray-900">Edit Profile</Text>
            <TouchableOpacity onPress={onClose}>
              <X size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView className="gap-3">
            <Field label="Shop Name *" value={shopName} onChange={setShopName} />
            <Field label="Owner Name" value={ownerName} onChange={setOwnerName} />
            <Field label="City" value={city} onChange={setCity} />
            <Field label="State" value={stateVal} onChange={setStateVal} />
            <Field
              label="GSTIN"
              value={gstin}
              onChange={setGstin}
              placeholder="22AAAAA0000A1Z5"
            />

            <Text className="text-[10px] text-gray-400 mt-1">
              GSTIN format: 22AAAAA0000A1Z5 (15 characters)
            </Text>

            <View className="flex-row gap-3 mt-2">
              <TouchableOpacity
                onPress={onClose}
                disabled={saving}
                className="flex-1 bg-gray-100 py-3.5 rounded-2xl items-center"
              >
                <Text className="text-gray-700 font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleSave()}
                disabled={saving || !shopName.trim()}
                className="flex-1 bg-cyan-600 py-3.5 rounded-2xl items-center"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-semibold">Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

function Field({
  label, value, onChange, placeholder, keyboardType,
}: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; keyboardType?: 'default' | 'numeric'
}) {
  return (
    <View>
      <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        keyboardType={keyboardType}
        className="bg-gray-50 px-4 py-3 rounded-xl text-sm text-gray-900"
        placeholderTextColor="#9CA3AF"
      />
    </View>
  )
}

// ─── WhatsApp Modal ────────────────────────────────────────────────

function WhatsAppModal({
  visible,
  current,
  onClose,
  onSaved,
}: {
  visible: boolean
  current: string
  onClose: () => void
  onSaved: () => void
}) {
  const [number, setNumber] = useState(current)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setNumber(current) }, [current, visible])

  const handleSave = async () => {
    const digits = number.replace(/\D/g, '')
    if (digits.length !== 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit Indian mobile number')
      return
    }
    setSaving(true)
    try {
      await retailerApi.update({ whatsapp_number: digits })
      onSaved()
      onClose()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center px-6">
        <View className="bg-white rounded-3xl w-full p-6 gap-4">
          <Text className="text-lg font-bold text-gray-900">WhatsApp Number</Text>
          <Text className="text-xs text-gray-500">
            Used for collection link enquiries and remote try-on. Leave empty to use your account phone number.
          </Text>
          <Field
            label="WhatsApp Number"
            value={number}
            onChange={setNumber}
            placeholder="9876543210"
            keyboardType="numeric"
          />
          <View className="flex-row gap-3 mt-2">
            <TouchableOpacity onPress={onClose} disabled={saving} className="flex-1 bg-gray-100 py-3.5 rounded-2xl items-center">
              <Text className="text-gray-700 font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void handleSave()} disabled={saving} className="flex-1 bg-cyan-600 py-3.5 rounded-2xl items-center">
              {saving ? <ActivityIndicator size="small" color="white" /> : <Text className="text-white font-semibold">Save</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── Delete Account Modal ──────────────────────────────────────────

function DeleteAccountModal({
  visible,
  onClose,
  onDeleted,
}: {
  visible: boolean
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (confirm !== 'DELETE') return
    setDeleting(true)
    try {
      await retailerApi.delete()
      onDeleted()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete account')
      setDeleting(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center px-6">
        <View className="bg-white rounded-3xl w-full p-6 gap-4">
          <Text className="text-lg font-bold text-red-600">Delete Account</Text>
          <Text className="text-sm text-gray-600 leading-relaxed">
            This will deactivate your account and archive all collections.{'\n\n'}
            Products, customers, and billing records are retained for audit purposes.{'\n\n'}
            Type DELETE to confirm.
          </Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder='Type "DELETE" to confirm'
            className="bg-red-50 border border-red-200 px-4 py-3 rounded-xl text-sm text-gray-900"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="characters"
          />
          <View className="flex-row gap-3">
            <TouchableOpacity onPress={onClose} disabled={deleting} className="flex-1 bg-gray-100 py-3.5 rounded-2xl items-center">
              <Text className="text-gray-700 font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void handleDelete()}
              disabled={confirm !== 'DELETE' || deleting}
              className={`flex-1 py-3.5 rounded-2xl items-center ${confirm === 'DELETE' ? 'bg-red-600' : 'bg-red-200'}`}
            >
              {deleting ? <ActivityIndicator size="small" color="white" /> : <Text className="text-white font-semibold">Delete Forever</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── Settings Row ──────────────────────────────────────────────────

function SettingsRow({
  icon,
  label,
  subtitle,
  onPress,
  destructive,
}: {
  icon: React.ReactNode
  label: string
  subtitle?: string
  onPress: () => void
  destructive?: boolean
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center bg-white rounded-2xl p-4 border border-gray-100"
    >
      <View className="w-9 h-9 rounded-xl bg-gray-100 items-center justify-center mr-3">
        {icon}
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-semibold ${destructive ? 'text-red-600' : 'text-gray-900'}`}>{label}</Text>
        {subtitle && <Text className="text-xs text-gray-400 mt-0.5">{subtitle}</Text>}
      </View>
      <ChevronRight size={18} color="#9CA3AF" />
    </TouchableOpacity>
  )
}

// ─── Usage Section (F-010) ─────────────────────────────────────────

function UsageSection() {
  const { data: usageData, isLoading } = useQuery({
    queryKey: ['retailer', 'usage'],
    queryFn: () => retailerApi.getUsage(),
  })

  const resources = (usageData as { data: Array<{ resource_type: string; limit: number; used: number; period: string; source: string }> } | undefined)?.data ?? []

  if (isLoading || resources.length === 0) return null

  const labelMap: Record<string, string> = {
    PRODUCT_UPLOAD: 'Product Uploads',
    AI_TAGGING_CALL: 'AI Tagging',
    TRY_ON: 'Try-Ons',
    IMAGE_CROP: 'Image Crops',
    BG_REMOVAL: 'Bg Removals',
    API_REQUEST: 'API Calls',
  }

  const activeResources = resources.filter((r) => r.limit !== -1 && r.limit > 0)
  if (activeResources.length === 0) return null

  return (
    <View className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
      <View className="flex-row items-center gap-2 mb-3">
        <BarChart2 size={16} color="#0891B2" />
        <Text className="text-sm font-bold text-gray-900">Usage</Text>
      </View>
      {activeResources.map((r) => {
        const pct = Math.min(Math.round((r.used / r.limit) * 100), 100)
        const isOver = r.used >= r.limit
        const barColor = isOver ? '#DC2626' : pct > 80 ? '#D97706' : '#0891B2'
        return (
          <View key={r.resource_type} className="mb-2.5">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-xs text-gray-600">{labelMap[r.resource_type] ?? r.resource_type}</Text>
              <Text className={`text-xs font-medium ${isOver ? 'text-red-600' : 'text-gray-700'}`}>
                {r.used}/{r.limit} {r.period === 'MONTH' ? 'mo' : r.period === 'DAY' ? 'day' : ''}
              </Text>
            </View>
            <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <View
                style={{
                  width: `${Math.max(pct, 3)}%`,
                  backgroundColor: barColor,
                }}
                className="h-full rounded-full"
              />
            </View>
            {isOver && (
              <View className="flex-row items-center gap-1 mt-1">
                <AlertTriangle size={10} color="#DC2626" />
                <Text className="text-[10px] text-red-600">Limit reached. Upgrade or contact support.</Text>
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

// ─── Main Settings Screen ──────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const { data: meData, isLoading } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
  })
  const retailer = (meData as { data: Record<string, any> } | undefined)?.data as Record<string, any> | undefined

  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await clearToken()
          router.replace('/auth/phone')
        },
      },
    ])
  }

  const handleProfileSaved = () => {
    void queryClient.invalidateQueries({ queryKey: ['retailer', 'me'] })
  }

  const phone = retailer?.phone ?? ''
  const whatsapp = retailer?.whatsapp_number ?? phone

  if (isLoading) {
    return (
      <View className="flex-1 bg-cyan-50 items-center justify-center">
        <ActivityIndicator color="#0891B2" />
      </View>
    )
  }

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
          <Text className="text-base font-bold text-gray-900">Settings</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Shop Card */}
        <View className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
          <Text className="text-base font-bold text-gray-900">{retailer?.shop_name ?? 'My Store'}</Text>
          <Text className="text-sm text-gray-500 mt-0.5">{retailer?.city ?? ''} · {retailer?.plan ?? 'STARTER'}</Text>
        </View>

        {/* F-010: Usage section */}
        <UsageSection />

        {/* Sections */}
        <View className="gap-2.5">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-0.5">Account</Text>

          <SettingsRow
            icon={<User size={18} color="#3B82F6" />}
            label="Edit Profile"
            subtitle={retailer?.shop_name ?? ''}
            onPress={() => setShowProfileEdit(true)}
          />

          <SettingsRow
            icon={<CreditCard size={18} color="#10B981" />}
            label="Plans & Billing"
            subtitle={`${retailer?.plan ?? 'STARTER'} · ${retailer?.plan_status ?? 'TRIAL'}`}
            onPress={() => router.push('/billing')}
          />

          <SettingsRow
            icon={<Smartphone size={18} color="#8B5CF6" />}
            label="WhatsApp Number"
            subtitle={whatsapp}
            onPress={() => setShowWhatsApp(true)}
          />

          <View className="h-2" />

          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-0.5">Store</Text>

          <SettingsRow
            icon={<Users size={18} color="#F59E0B" />}
            label="Team Members"
            subtitle="Manage shop staff"
            onPress={() => router.push('/settings/staff' as any)}
          />

          <SettingsRow
            icon={<QrCode size={18} color="#0891B2" />}
            label="Store QR Code"
            subtitle="QR profile & storefront"
            onPress={() => router.push('/store-profile')}
          />

          <View className="h-2" />

          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1 mb-0.5">Actions</Text>

          <SettingsRow
            icon={<LogOut size={18} color="#6B7280" />}
            label="Logout"
            onPress={handleLogout}
          />

          <SettingsRow
            icon={<Trash2 size={18} color="#DC2626" />}
            label="Delete Account"
            destructive
            onPress={() => setShowDelete(true)}
          />
        </View>
      </ScrollView>

      <ProfileEditModal
        visible={showProfileEdit}
        retailer={retailer ?? null}
        onClose={() => setShowProfileEdit(false)}
        onSaved={handleProfileSaved}
      />

      <WhatsAppModal
        visible={showWhatsApp}
        current={whatsapp}
        onClose={() => setShowWhatsApp(false)}
        onSaved={handleProfileSaved}
      />

      <DeleteAccountModal
        visible={showDelete}
        onClose={() => setShowDelete(false)}
        onDeleted={async () => {
          await clearToken()
          router.replace('/auth/phone')
        }}
      />
    </View>
  )
}
