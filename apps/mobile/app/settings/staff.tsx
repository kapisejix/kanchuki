import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, FlatList, TextInput,
  Alert, Modal, Pressable, Share, Platform,
} from 'react-native'
import { router } from 'expo-router'
import * as Clipboard from 'expo-clipboard'
import { useScreenInsets } from '../../src/lib/safe-area'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Trash2, X, User, ChevronLeft, Pencil, RotateCcw, Check, MessageCircle, Copy,
} from 'lucide-react-native'
import { CustomerListSkeleton } from '../../src/components/Skeleton'
import { ApiError, retailerApi, staffApi, type StaffMember } from '../../src/lib/api'
import { showError } from '../../src/lib/errors'
import { useTheme } from '../../src/lib/theme'
import { AnimatedPressable } from '../../src/components/AnimatedPressable'
import { GradientButton } from '../../src/components/GradientButton'
import { ROLE_SUMMARY } from '../../src/lib/staff-can'
import { buildStaffInviteMessage } from '../../src/lib/staff-invite'

const ROLE_OPTIONS: { value: 'manager' | 'salesperson'; label: string; description: string }[] = [
  {
    value: 'manager',
    label: 'Manager',
    description: 'Can add & edit products, categories, collections, size charts, and add customers.',
  },
  {
    value: 'salesperson',
    label: 'Salesperson',
    description: 'Can view the catalog and add customers. Cannot edit products or create collections.',
  },
]

// ─── Add / Edit Staff Modal (FR-1) ────────────────────────────────

function AddStaffModal({
  visible,
  onClose,
  editing,
  onCreated,
}: {
  visible: boolean
  onClose: () => void
  editing?: StaffMember | null
  /** FR-6.1 — fired with the created member so the screen can show the invite prompt. */
  onCreated?: (member: StaffMember) => void
}) {
  const { colors } = useTheme()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<'manager' | 'salesperson'>('salesperson')
  const queryClient = useQueryClient()

  // When switching into edit mode, prefill from the member being edited.
  const [lastEditingId, setLastEditingId] = useState<string | null>(null)
  if (editing && editing.id !== lastEditingId) {
    setLastEditingId(editing.id)
    setName(editing.name)
    setPhone(editing.phone)
    setRole(editing.role === 'manager' ? 'manager' : 'salesperson')
  } else if (!editing && lastEditingId !== null) {
    // Modal closed/reopened for a fresh add — reset.
    setLastEditingId(null)
    setName('')
    setPhone('')
    setRole('salesperson')
  }

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        phone: phone.replace(/\D/g, ''),
        role,
      }
      return editing ? staffApi.update(editing.id, payload) : staffApi.create(payload)
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['staff'] })
      onClose()
      setName('')
      setPhone('')
      setRole('salesperson')
      setLastEditingId(null)
      // FR-6.1: invite signal — only on the CREATE path (edits of an existing
      // member don't need a "please log in" prompt).
      if (!editing && onCreated && result?.data) onCreated(result.data)
    },
    onError: (err: Error) => {
      // Surface the real server reason (duplicate phone, seat limit reached,
      // phone already a retailer account) — the generic fallback only when
      // the error isn't an API response. Without this every failure reads as
      // the same dead "Failed to add team member".
      const msg = err instanceof ApiError ? err.message : 'Failed to save team member'
      showError(err, msg)
    },
  })

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center px-6">
        <View className="bg-white rounded-3xl w-full p-6 gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-sand-900">
              {editing ? 'Edit Team Member' : 'Add Team Member'}
            </Text>
            <AnimatedPressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
              <X size={20} color={colors.sand[400]} />
            </AnimatedPressable>
          </View>

          <View>
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ramesh"
              className="bg-sand-50 px-4 py-3 rounded-xl text-sm text-sand-900"
              placeholderTextColor={colors.sand[400]}
              autoFocus={!editing}
            />
          </View>

          <View>
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
              Phone
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="9876543210"
              keyboardType="numeric"
              maxLength={10}
              editable={!editing}
              className="bg-sand-50 px-4 py-3 rounded-xl text-sm text-sand-900"
              placeholderTextColor={colors.sand[400]}
            />
            {editing && (
              <Text className="text-[10px] text-sand-400 mt-1">
                Phone can&apos;t be changed — remove and re-add to use a new number.
              </Text>
            )}
          </View>

          {/* FR-1.1 — role picker (previously hardcoded salesperson) */}
          <View>
            <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide mb-1.5">
              Access level
            </Text>
            <View className="gap-2">
              {ROLE_OPTIONS.map((option) => {
                const selected = role === option.value
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setRole(option.value)}
                    className="rounded-2xl border p-3.5"
                    style={{
                      borderColor: selected ? colors.ink[600] : colors.sand[200],
                      backgroundColor: selected ? colors.ink[50] : colors.sand[50],
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${option.label} role`}
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-bold text-sand-900">{option.label}</Text>
                      {selected && <Check size={16} color={colors.ink[600]} />}
                    </View>
                    <Text className="text-xs text-sand-500 mt-1 leading-4">{option.description}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          <View className="flex-row gap-3 mt-2">
            <AnimatedPressable
              onPress={onClose}
              disabled={save.isPending}
              className="flex-1 bg-sand-100 py-3.5 rounded-2xl items-center"
            >
              <Text className="text-sand-700 font-semibold">Cancel</Text>
            </AnimatedPressable>
            <View className="flex-1">
              <GradientButton
                label={editing ? 'Save' : 'Add'}
                onPress={() => save.mutate()}
                disabled={!name.trim() || phone.replace(/\D/g, '').length !== 10}
                loading={save.isPending}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── Permanent-delete (DPDP) confirm modal (FR-4.4) ───────────────

function PurgeModal({
  member,
  onClose,
  onPurged,
}: {
  member: StaffMember | null
  onClose: () => void
  onPurged: () => void
}) {
  const { colors } = useTheme()
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const isConfirmed = confirm.trim().toUpperCase() === 'DELETE'

  // The modal stays mounted (visible toggles) — clear the typed confirmation
  // every time it closes so the "type DELETE" gate can't be pre-satisfied on
  // the next member's permanent-delete.
  useEffect(() => {
    if (!member) {
      setConfirm('')
      setDeleting(false)
    }
  }, [member])

  const handlePurge = async () => {
    if (!member || !isConfirmed) return
    setDeleting(true)
    try {
      await staffApi.purge(member.id)
      onPurged()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to delete permanently'
      showError(err, msg)
      setDeleting(false)
    }
  }

  return (
    <Modal visible={Boolean(member)} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center px-6">
        <View className="bg-white rounded-3xl w-full p-6 gap-4">
          <Text className="text-lg font-bold text-rust-600">Delete permanently</Text>
          <Text className="text-sm text-sand-600 leading-relaxed">
            This erases {member?.name ?? 'this member'}&apos;s record — name, phone and role — from
            your team permanently (DPDP erasure). This cannot be undone.
            {'\n\n'}
            Type DELETE to confirm.
          </Text>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder='Type "DELETE" to confirm'
            className="bg-rust-50 border border-rust-200 px-4 py-3 rounded-xl text-sm text-sand-900"
            placeholderTextColor={colors.sand[400]}
            autoCapitalize="characters"
          />
          <View className="flex-row gap-3">
            <AnimatedPressable
              onPress={onClose}
              disabled={deleting}
              className="flex-1 bg-sand-100 py-3.5 rounded-2xl items-center"
            >
              <Text className="text-sand-700 font-semibold">Cancel</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => void handlePurge()}
              disabled={!isConfirmed || deleting}
              className={`flex-1 py-3.5 rounded-2xl items-center ${isConfirmed ? 'bg-rust-600' : 'bg-rust-200'}`}
              accessibilityLabel="Confirm permanent delete"
            >
              {deleting ? (
                <Text className="text-white font-semibold">Deleting…</Text>
              ) : (
                <Text className="text-white font-semibold">Delete Forever</Text>
              )}
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── Invite prompt (FR-6.1) ───────────────────────────────────────
// After a successful ADD, show the retailer a share sheet / copy-text so
// they can tell the new member to log in. Client-side only — deliberately NO
// SMS (cost + DLT registration; per docs/tasks/team-member-access-control.md
// FR-6.1).

function InvitePromptModal({
  member,
  shopName,
  onClose,
}: {
  member: StaffMember | null
  shopName: string | null
  onClose: () => void
}) {
  const { colors } = useTheme()
  const message = member
    ? buildStaffInviteMessage(member.name, member.phone, shopName)
    : ''

  const handleCopy = async () => {
    if (!message) return
    await Clipboard.setStringAsync(message)
    Alert.alert('Copied', 'Invite message copied. Share it with your team member.')
  }

  const handleShare = async () => {
    if (!message) return
    try {
      if (Platform.OS === 'web') {
        if (typeof navigator !== 'undefined' && navigator.share) {
          await navigator.share({ text: message })
          return
        }
        await Clipboard.setStringAsync(message)
        Alert.alert('Copied', 'Invite message copied. Share it with your team member.')
        return
      }
      await Share.share({ message })
    } catch {
      // Share sheet dismissed by the user is not an error.
    }
  }

  return (
    <Modal visible={Boolean(member)} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black/50 justify-center px-6">
        <View className="bg-white rounded-3xl w-full p-6 gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-sand-900">Team member added</Text>
            <AnimatedPressable onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
              <X size={20} color={colors.sand[400]} />
            </AnimatedPressable>
          </View>
          <Text className="text-sm text-sand-600 leading-relaxed">
            {message}
          </Text>
          <Text className="text-xs text-sand-400 leading-relaxed">
            Share this with them — they can log in with their phone number and start using
            the app right away.
          </Text>
          <View className="flex-row gap-3 mt-2">
            <AnimatedPressable
              onPress={() => void handleCopy()}
              className="flex-1 bg-sand-100 py-3.5 rounded-2xl flex-row items-center justify-center gap-2"
              accessibilityLabel="Copy invite message"
              accessibilityRole="button"
            >
              <Copy size={16} color={colors.sand[700]} />
              <Text className="text-sand-700 font-semibold">Copy</Text>
            </AnimatedPressable>
            <AnimatedPressable
              onPress={() => void handleShare()}
              className="flex-1 bg-ink-600 py-3.5 rounded-2xl flex-row items-center justify-center gap-2"
              accessibilityLabel="Share invite message"
              accessibilityRole="button"
            >
              <MessageCircle size={16} color="white" />
              <Text className="text-white font-semibold">Share</Text>
            </AnimatedPressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

// ─── Main Staff Screen ─────────────────────────────────────────────

export default function StaffScreen() {
  const { colors } = useTheme()
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<StaffMember | null>(null)
  const [showRemoved, setShowRemoved] = useState(false)
  const [purgeTarget, setPurgeTarget] = useState<StaffMember | null>(null)
  const [inviteTarget, setInviteTarget] = useState<StaffMember | null>(null)
  const queryClient = useQueryClient()
  const { headerPaddingTop, screenPaddingBottom } = useScreenInsets()

  const { data, isLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: () => staffApi.list(),
    staleTime: 30_000,
  })

  // FR-6.1: shop name for the invite message. GET /v1/retailers/me is on the
  // staff allowlist (staffCanAccess), so this works for manager sessions too.
  const { data: meData } = useQuery({
    queryKey: ['retailer', 'me'],
    queryFn: () => retailerApi.getMe(),
    staleTime: 60_000,
  })
  const shopName =
    ((meData as { data?: { shop_name?: string } } | undefined)?.data?.shop_name ?? null)

  const all = ((data as { data: StaffMember[] } | undefined)?.data ?? [])
  const staff = all.filter((s) => s.is_active)
  const removed = all.filter((s) => !s.is_active)

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['staff'] })
  }, [queryClient])

  // FR-4.1 — deactivate copy states exactly what happens: access cut + seat
  // freed, record kept and restorable.
  const handleRemove = useCallback(
    (member: StaffMember) => {
      Alert.alert(
        'Remove Team Member',
        `Remove "${member.name}" from your team? They lose app access immediately and the seat is freed. Their record is kept (deactivated) and can be restored.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                await staffApi.delete(member.id)
                invalidate()
              } catch (err) {
                showError(err, 'Failed to remove')
              }
            },
          },
        ],
      )
    },
    [invalidate],
  )

  // FR-4.2 — restore an inactive member (seat-checked server-side).
  const handleRestore = useCallback(
    (member: StaffMember) => {
      Alert.alert('Restore team member', `Restore "${member.name}"? They get app access back and the seat is used again.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            try {
              await staffApi.update(member.id, { is_active: true })
              invalidate()
            } catch (err) {
              showError(err, 'Failed to restore')
            }
          },
        },
      ])
    },
    [invalidate],
  )

  const roleLabel = (role: string) =>
    role === 'manager' ? 'Manager' : role === 'salesperson' ? 'Salesperson' : role

  const renderActive = useCallback(
    ({ item }: { item: StaffMember }) => (
      <View className="bg-white rounded-2xl p-4 border border-sand-100">
        <View className="flex-row items-center">
          <View className="w-10 h-10 rounded-full bg-ink-100 items-center justify-center mr-3">
            <Text className="text-ink-700 text-sm font-bold">
              {item.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-sand-900">{item.name}</Text>
            <Text className="text-xs text-sand-400">{item.phone}</Text>
          </View>
          <AnimatedPressable
            onPress={() => {
              setEditing(item)
              setShowAdd(true)
            }}
            className="w-9 h-9 rounded-full bg-sand-100 items-center justify-center mr-2"
            accessibilityLabel={`Edit ${item.name}`}
            accessibilityRole="button"
          >
            <Pencil size={15} color={colors.sand[600]} />
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => handleRemove(item)}
            className="w-9 h-9 rounded-full bg-rust-50 items-center justify-center"
            accessibilityLabel={`Remove ${item.name}`}
            accessibilityRole="button"
          >
            <Trash2 size={16} color={colors.rust[600]} />
          </AnimatedPressable>
        </View>
        {/* FR-1.5 — role label + one-line capability summary */}
        <View
          className="mt-3 rounded-xl px-3 py-2"
          style={{ backgroundColor: colors.ink[50] }}
        >
          <Text className="text-[11px] font-bold text-sand-900">{roleLabel(item.role)}</Text>
          <Text className="text-[11px] text-sand-500 mt-0.5 leading-4">
            {ROLE_SUMMARY[item.role] ?? ''}
          </Text>
        </View>
      </View>
    ),
    [handleRemove, colors.rust, colors.sand, colors.ink],
  )

  const renderRemoved = useCallback(
    ({ item }: { item: StaffMember }) => (
      <View className="bg-sand-50 rounded-2xl p-3.5 border border-sand-100">
        <View className="flex-row items-center">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-sand-600">{item.name}</Text>
            <Text className="text-xs text-sand-400">
              {item.phone} · {roleLabel(item.role)} · Removed
            </Text>
          </View>
          <AnimatedPressable
            onPress={() => handleRestore(item)}
            className="bg-white border border-sand-200 px-3 py-2 rounded-xl flex-row items-center gap-1.5 mr-2"
            accessibilityLabel={`Restore ${item.name}`}
            accessibilityRole="button"
          >
            <RotateCcw size={13} color={colors.sand[700]} />
            <Text className="text-xs font-semibold text-sand-700">Restore</Text>
          </AnimatedPressable>
          <AnimatedPressable
            onPress={() => setPurgeTarget(item)}
            className="bg-rust-50 px-3 py-2 rounded-xl"
            accessibilityLabel={`Delete ${item.name} permanently`}
            accessibilityRole="button"
          >
            <Trash2 size={14} color={colors.rust[600]} />
          </AnimatedPressable>
        </View>
      </View>
    ),
    [handleRestore, colors.rust, colors.sand],
  )

  return (
    <View className="flex-1 bg-ink-50">
      {/* Header */}
      <View
        className="bg-white border-b border-sand-100 px-4 pb-4"
        style={{ paddingTop: headerPaddingTop }}
      >
        <View className="flex-row items-center gap-3">
          <AnimatedPressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Go back" accessibilityRole="button">
            <ChevronLeft size={24} color={colors.sand[700]} />
          </AnimatedPressable>
          <Text className="text-base font-bold text-sand-900">Team Members</Text>
        </View>
      </View>

      <View className="flex-1 px-4 pt-4">
        {isLoading ? (
          <CustomerListSkeleton />
        ) : staff.length === 0 && removed.length === 0 ? (
          <View className="items-center py-16">
            <User size={40} color={colors.sand[300]} />
            <Text className="text-sand-400 text-sm mt-4 text-center">
              No team members yet.{'\n'}Add shop staff to help manage the catalog.
            </Text>
            <AnimatedPressable
              onPress={() => setShowAdd(true)}
              className="mt-4 bg-ink-600 px-5 py-2.5 rounded-xl"
            >
              <Text className="text-white text-sm font-semibold">Add Team Member</Text>
            </AnimatedPressable>
          </View>
        ) : (
          <FlatList
            data={staff}
            keyExtractor={(item) => item.id}
            renderItem={renderActive}
            contentContainerStyle={{ gap: 8, flexGrow: 1, paddingBottom: screenPaddingBottom }}
            ListHeaderComponent={
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
                  {staff.length} active member{staff.length !== 1 ? 's' : ''}
                </Text>
              </View>
            }
            ListFooterComponent={
              removed.length > 0 ? (
                <View className="mt-4">
                  <AnimatedPressable
                    onPress={() => setShowRemoved((v) => !v)}
                    className="flex-row items-center justify-between py-2"
                    accessibilityLabel="Toggle removed members"
                    accessibilityRole="button"
                  >
                    <Text className="text-xs font-semibold text-sand-500 uppercase tracking-wide">
                      Removed ({removed.length}) — records kept, restorable
                    </Text>
                    <Text className="text-sand-400 text-xs">{showRemoved ? '▲' : '▼'}</Text>
                  </AnimatedPressable>
                  {showRemoved &&
                    removed.map((m) => (
                      <View key={m.id} className="mb-2">
                        {renderRemoved({ item: m })}
                      </View>
                    ))}
                </View>
              ) : null
            }
          />
        )}

        {/* FAB */}
        <AnimatedPressable
          onPress={() => {
            setEditing(null)
            setShowAdd(true)
          }}
          className="absolute bottom-6 right-4 w-14 h-14 bg-ink-600 rounded-full items-center justify-center shadow-lg"
          style={{ elevation: 6 }}
          accessibilityLabel="Add staff member"
          accessibilityRole="button"
        >
          <Plus size={24} color="white" />
        </AnimatedPressable>

        <AddStaffModal
          visible={showAdd}
          onClose={() => setShowAdd(false)}
          editing={editing}
          onCreated={setInviteTarget}
        />
        <InvitePromptModal
          member={inviteTarget}
          shopName={shopName}
          onClose={() => setInviteTarget(null)}
        />
        <PurgeModal
          member={purgeTarget}
          onClose={() => setPurgeTarget(null)}
          onPurged={() => {
            setPurgeTarget(null)
            invalidate()
          }}
        />
      </View>
    </View>
  )
}