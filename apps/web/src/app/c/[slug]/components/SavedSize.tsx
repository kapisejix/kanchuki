'use client'

import { useState, useEffect, useCallback } from 'react'
import { Ruler, Check, X } from 'lucide-react'

const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL', '6XL', '7XL', '8XL'] as const

interface Props {
  storeSlug: string
}

function sizeKey(storeSlug: string): string {
  return `kanchuki_size_${storeSlug}`
}

export function SavedSize({ storeSlug }: Props) {
  const [savedSize, setSavedSize] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    try {
      setSavedSize(localStorage.getItem(sizeKey(storeSlug)))
    } catch {}
  }, [storeSlug])

  const handleSave = useCallback(() => {
    if (!selected) return
    try {
      localStorage.setItem(sizeKey(storeSlug), selected)
      setSavedSize(selected)
      setEditing(false)
    } catch {}
  }, [selected, storeSlug])

  const handleClear = useCallback(() => {
    try {
      localStorage.removeItem(sizeKey(storeSlug))
      setSavedSize(null)
      setEditing(false)
    } catch {}
  }, [storeSlug])

  if (editing) {
    return (
      <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-cyan-800">What&apos;s your usual size?</p>
          <button onClick={() => setEditing(false)} className="text-cyan-400 hover:text-cyan-600">
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {SIZE_OPTIONS.map((size) => (
            <button
              key={size}
              onClick={() => setSelected(size)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                selected === size
                  ? 'bg-cyan-600 text-white ring-2 ring-cyan-300'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-cyan-300'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void handleSave()}
            disabled={!selected}
            className="flex-1 bg-cyan-600 disabled:bg-cyan-300 text-white text-xs font-semibold py-2 rounded-xl transition-colors"
          >
            Save Size
          </button>
          {savedSize && (
            <button
              onClick={handleClear}
              className="text-xs text-gray-500 hover:text-red-500 px-3 py-2 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    )
  }

  if (savedSize) {
    return (
      <button
        onClick={() => { setSelected(savedSize); setEditing(true) }}
        className="flex items-center gap-2 bg-cyan-50 border border-cyan-100 rounded-xl px-3 py-2 w-full hover:bg-cyan-100 transition-colors"
      >
        <Ruler size={14} className="text-cyan-600" />
        <span className="text-xs font-medium text-cyan-800">Your size: {savedSize}</span>
        <Check size={12} className="text-cyan-500 ml-auto" />
      </button>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 w-full hover:bg-cyan-50 hover:border-cyan-100 transition-colors"
    >
      <Ruler size={14} className="text-gray-400" />
      <span className="text-xs font-medium text-gray-600">Save your usual size</span>
    </button>
  )
}
