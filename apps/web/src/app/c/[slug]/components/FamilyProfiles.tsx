'use client'

import { useState, useEffect, useCallback } from 'react'
import { Users, Plus, X, Check, User } from 'lucide-react'

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL', '6XL', '7XL', '8XL'] as const
const RELATION_OPTIONS = ['Mom', 'Sister', 'Daughter', 'Wife', 'Friend', 'Other'] as const

interface FamilyProfile {
  id: string
  name: string
  relation: string
  size: string
}

interface Props {
  storeSlug: string
  onSelectProfile: (profile: FamilyProfile | null) => void
  activeProfile: FamilyProfile | null
}

function profilesKey(storeSlug: string): string {
  return `kanchuki_family_${storeSlug}`
}

function loadProfiles(storeSlug: string): FamilyProfile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(profilesKey(storeSlug))
    return raw ? JSON.parse(raw) as FamilyProfile[] : []
  } catch { return [] }
}

function saveProfiles(storeSlug: string, profiles: FamilyProfile[]): void {
  try {
    localStorage.setItem(profilesKey(storeSlug), JSON.stringify(profiles))
  } catch {}
}

export function FamilyProfiles({ storeSlug, onSelectProfile, activeProfile }: Props) {
  const [profiles, setProfiles] = useState<FamilyProfile[]>([])
  const [showForm, setShowForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRelation, setNewRelation] = useState<string | null>(null)
  const [newSize, setNewSize] = useState<string | null>(null)

  useEffect(() => {
    setProfiles(loadProfiles(storeSlug))
  }, [storeSlug])

  const handleAdd = useCallback(() => {
    if (!newName.trim() || !newRelation || !newSize) return
    const profile: FamilyProfile = {
      id: Date.now().toString(),
      name: newName.trim(),
      relation: newRelation,
      size: newSize,
    }
    const updated = [...profiles, profile]
    setProfiles(updated)
    saveProfiles(storeSlug, updated)
    setNewName('')
    setNewRelation(null)
    setNewSize(null)
    setShowForm(false)
  }, [newName, newRelation, newSize, profiles, storeSlug])

  const handleRemove = useCallback((id: string) => {
    const updated = profiles.filter((p) => p.id !== id)
    setProfiles(updated)
    saveProfiles(storeSlug, updated)
    if (activeProfile?.id === id) onSelectProfile(null)
  }, [profiles, storeSlug, activeProfile, onSelectProfile])

  const handleSelect = useCallback((profile: FamilyProfile | null) => {
    onSelectProfile(profile)
  }, [onSelectProfile])

  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-900">Shopping for Family?</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? 'Cancel' : 'Add'}
        </button>
      </div>
      <p className="text-[10px] text-gray-500 mb-3">
        Save family sizes to find the right fit when gifting
      </p>

      {/* My size toggle */}
      <button
        onClick={() => handleSelect(null)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl mb-2 transition-all ${
          !activeProfile
            ? 'bg-indigo-100 border border-indigo-300'
            : 'bg-gray-50 border border-gray-100 hover:bg-indigo-50'
        }`}
      >
        <User size={14} className={!activeProfile ? 'text-indigo-600' : 'text-gray-400'} />
        <span className={`text-xs font-medium ${!activeProfile ? 'text-indigo-800' : 'text-gray-600'}`}>
          My Size
        </span>
        {!activeProfile && <Check size={12} className="text-indigo-500 ml-auto" />}
      </button>

      {/* Family profiles */}
      {profiles.map((profile) => (
        <div key={profile.id} className="flex items-center gap-2 mb-1.5">
          <button
            onClick={() => handleSelect(profile)}
            className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-xl transition-all ${
              activeProfile?.id === profile.id
                ? 'bg-indigo-100 border border-indigo-300'
                : 'bg-gray-50 border border-gray-100 hover:bg-indigo-50'
            }`}
          >
            <span className="text-sm">🎀</span>
            <div className="text-left">
              <span className={`text-xs font-medium ${activeProfile?.id === profile.id ? 'text-indigo-800' : 'text-gray-700'}`}>
                {profile.name}
              </span>
              <span className="text-[10px] text-gray-400 ml-1.5">{profile.relation} · {profile.size}</span>
            </div>
            {activeProfile?.id === profile.id && <Check size={12} className="text-indigo-500 ml-auto" />}
          </button>
          <button
            onClick={() => handleRemove(profile.id)}
            className="text-gray-300 hover:text-red-400 transition-colors p-1"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {/* Add form */}
      {showForm && (
        <div className="mt-3 bg-indigo-50 border border-indigo-100 rounded-xl p-3 space-y-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (e.g. Mom)"
            className="w-full text-sm border border-indigo-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-indigo-400"
          />

          <div className="flex flex-wrap gap-1.5">
            {RELATION_OPTIONS.map((rel) => (
              <button
                key={rel}
                onClick={() => { setNewRelation(rel); if (!newName) setNewName(rel) }}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                  newRelation === rel
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
                }`}
              >
                {rel}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                onClick={() => setNewSize(size)}
                className={`px-2 py-1 rounded-full text-[10px] font-medium transition-all ${
                  newSize === size
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
                }`}
              >
                {size}
              </button>
            ))}
          </div>

          <button
            onClick={handleAdd}
            disabled={!newName.trim() || !newRelation || !newSize}
            className="w-full bg-indigo-600 disabled:bg-indigo-300 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
          >
            Save Profile
          </button>
        </div>
      )}
    </section>
  )
}
