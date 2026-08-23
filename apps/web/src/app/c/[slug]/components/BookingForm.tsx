'use client'

import { useState, useCallback } from 'react'
import { X, Calendar, Clock, Loader2, Check, AlertTriangle } from 'lucide-react'

interface Props {
  storeSlug: string
  storeName: string
  onClose: () => void
}

type Step = 'form' | 'submitting' | 'success' | 'error'

// Generate available time slots for the next 7 days
function getAvailableSlots(): Array<{ date: string; label: string; slots: Array<{ time: string; label: string }> }> {
  const days: Array<{ date: string; label: string; slots: Array<{ time: string; label: string }> }> = []
  const now = new Date()

  for (let d = 0; d < 7; d++) {
    const day = new Date(now)
    day.setDate(now.getDate() + d)
    const dateStr = day.toISOString().split('T')[0]!
    const dayLabel = d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : day.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })

    const slots: Array<{ time: string; label: string }> = []
    // Slots from 10 AM to 7 PM (1-hour slots)
    for (let h = 10; h <= 19; h++) {
      const slotStart = new Date(day)
      slotStart.setHours(h, 0, 0, 0)
      // Skip past slots for today
      if (d === 0 && slotStart <= now) continue
      const hour = h > 12 ? h - 12 : h
      const ampm = h >= 12 ? 'PM' : 'AM'
      slots.push({
        time: `${dateStr}T${String(h).padStart(2, '0')}:00:00.000Z`,
        label: `${hour}:00 ${ampm}`,
      })
    }
    if (slots.length > 0) {
      days.push({ date: dateStr, label: dayLabel, slots })
    }
  }
  return days
}

export function BookingForm({ storeSlug, storeName, onClose }: Props) {
  const [step, setStep] = useState<Step>('form')
  // Prefill name/phone from ContactGate localStorage if available
  const [name, setName] = useState(() => {
    if (typeof window === 'undefined') return ''
    try { return localStorage.getItem(`kanchuki_lead_name_${storeSlug}`) ?? '' } catch { return '' }
  })
  const [phone, setPhone] = useState(() => {
    if (typeof window === 'undefined') return ''
    try { return localStorage.getItem(`kanchuki_lead_phone_${storeSlug}`) ?? '' } catch { return '' }
  })
  const [selectedSlot, setSelectedSlot] = useState<{ starts_at: string; ends_at: string } | null>(null)
  const [note, setNote] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const slots = getAvailableSlots()

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !phone.trim() || !selectedSlot) return
    setStep('submitting')
    setErrorMessage(null)

    try {
      // Calculate end time (1 hour after start)
      const startDate = new Date(selectedSlot.starts_at)
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000)

      const res = await fetch(`/api/${storeSlug}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          starts_at: selectedSlot.starts_at,
          ends_at: endDate.toISOString(),
          note: note.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: { message?: string } }
        throw new Error(data.error?.message ?? 'Booking failed')
      }

      setStep('success')
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong')
      setStep('error')
    }
  }, [name, phone, selectedSlot, note, storeSlug])

  const canSubmit = name.trim().length > 0 && phone.trim().length >= 10 && selectedSlot !== null

  return (
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative mt-auto bg-white rounded-t-3xl max-h-[90vh] overflow-y-auto w-full max-w-md mx-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white z-10">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center z-10"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        {/* ── Form Step ── */}
        {step === 'form' && (
          <div className="px-6 pb-8 pt-2">
            <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Calendar size={24} className="text-purple-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 text-center">Book a Visit</h2>
            <p className="text-sm text-gray-500 text-center mt-1 px-4">
              Schedule a try-on session at {storeName}
            </p>

            {/* Name */}
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mt-5 mb-1">
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:border-purple-400"
              placeholder="Enter your name"
            />

            {/* Phone */}
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              minLength={10}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:border-purple-400"
              placeholder="10-digit mobile number"
            />

            {/* Date + Time Slots */}
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Select Date & Time
            </label>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {slots.map((day) => (
                <div key={day.date}>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">{day.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {day.slots.map((slot) => {
                      const isActive = selectedSlot?.starts_at === slot.time
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => setSelectedSlot({ starts_at: slot.time, ends_at: '' })}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            isActive
                              ? 'bg-purple-600 text-white ring-2 ring-purple-300'
                              : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-purple-300'
                          }`}
                        >
                          <Clock size={10} className="inline mr-1" />
                          {slot.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Note */}
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-1">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:border-purple-400 resize-none"
              rows={2}
              placeholder="e.g. Looking for wedding sarees"
            />

            {/* Submit */}
            <button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="w-full bg-purple-600 disabled:bg-gray-300 text-white font-semibold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors"
            >
              <Calendar size={18} />
              Confirm Booking
            </button>
          </div>
        )}

        {/* ── Submitting Step ── */}
        {step === 'submitting' && (
          <div className="px-6 pb-8 pt-8 text-center">
            <Loader2 size={28} className="animate-spin text-purple-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-700">Confirming your booking...</p>
          </div>
        )}

        {/* ── Success Step ── */}
        {step === 'success' && (
          <div className="px-6 pb-8 pt-6 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Check size={28} className="text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Booking Confirmed!</h2>
            <p className="text-sm text-gray-500 mt-1 px-4">
              {storeName} will see your booking. You&apos;ll be contacted to confirm the exact time.
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3.5 rounded-2xl transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {/* ── Error Step ── */}
        {step === 'error' && (
          <div className="px-6 pb-8 pt-6 text-center">
            <div className="w-14 h-14 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <AlertTriangle size={24} className="text-red-500" />
            </div>
            <p className="text-base font-bold text-gray-900">Booking Failed</p>
            <p className="text-sm text-gray-500 mt-1">{errorMessage ?? 'Please try again'}</p>
            <div className="mt-6 space-y-3">
              <button
                onClick={() => setStep('form')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3.5 rounded-2xl transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="w-full border-2 border-gray-200 text-gray-700 font-medium py-3.5 rounded-2xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
