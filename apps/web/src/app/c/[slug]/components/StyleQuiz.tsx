'use client'

import { useState, useCallback } from 'react'
import { Sparkles, ChevronRight, ChevronLeft, Check } from 'lucide-react'

const QUESTIONS = [
  {
    key: 'occasion',
    question: 'What occasions do you shop for most?',
    icon: '🎉',
    options: ['Daily Wear', 'Party / Festive', 'Wedding / Bridal', 'Office / Formal', 'Casual Outings'],
    multi: true,
  },
  {
    key: 'region',
    question: 'Which region best describes your style?',
    icon: '🗺️',
    options: ['North Indian', 'South Indian', 'East Indian', 'West Indian', 'Indo-Western / Fusion', 'No Preference'],
    multi: false,
  },
  {
    key: 'budget',
    question: 'What\'s your typical budget per outfit?',
    icon: '💰',
    options: ['Under ₹500', '₹500 – ₹1,500', '₹1,500 – ₹3,000', '₹3,000 – ₹5,000', '₹5,000 – ₹10,000', '₹10,000+'],
    multi: false,
  },
  {
    key: 'fabric',
    question: 'Which fabrics do you prefer? (pick all that apply)',
    icon: '🧵',
    options: ['Cotton', 'Silk', 'Georgette', 'Chiffon', 'Rayon', 'Linen', 'Velvet', 'No Preference'],
    multi: true,
  },
  {
    key: 'color',
    question: 'What colors do you love? (pick all that apply)',
    icon: '🎨',
    options: ['Red / Maroon', 'Blue / Navy', 'Green / Emerald', 'Pink / Rose', 'Yellow / Mustard', 'White / Cream', 'Black', 'Pastels', 'Bright / Multicolor'],
    multi: true,
  },
]

interface Props {
  storeSlug: string
  onComplete?: () => void
}

export function StyleQuiz({ storeSlug, onComplete }: Props) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [done, setDone] = useState(false)

  const q = QUESTIONS[step]!
  const currentAnswers = answers[q.key] ?? []

  const toggleOption = useCallback((option: string) => {
    setAnswers((prev) => {
      const current = prev[q.key] ?? []
      if (q.multi) {
        const next = current.includes(option)
          ? current.filter((o) => o !== option)
          : [...current, option]
        return { ...prev, [q.key]: next }
      }
      return { ...prev, [q.key]: [option] }
    })
  }, [q])

  const handleNext = useCallback(() => {
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1)
    } else {
      // Save to localStorage
      try {
        localStorage.setItem(`kanchuki_quiz_${storeSlug}`, JSON.stringify(answers))
      } catch {}
      setDone(true)
      onComplete?.()
    }
  }, [step, answers, storeSlug, onComplete])

  // Already completed
  if (done) {
    return (
      <div className="bg-gradient-to-br from-cyan-50 to-indigo-50 border border-cyan-100 rounded-2xl p-5 text-center">
        <div className="w-12 h-12 bg-cyan-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
          <Check size={24} className="text-cyan-600" />
        </div>
        <h3 className="text-sm font-bold text-gray-900 mb-1">Style Profile Saved!</h3>
        <p className="text-xs text-gray-500">
          We&apos;ll use this to suggest outfits that match your taste.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      {/* Progress */}
      <div className="flex items-center gap-1.5 mb-4">
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-cyan-500' : 'bg-gray-100'
            }`}
          />
        ))}
      </div>

      {/* Question */}
      <div className="mb-4">
        <span className="text-lg mr-1.5">{q.icon}</span>
        <span className="text-sm font-bold text-gray-900">{q.question}</span>
        {!q.multi && (
          <span className="text-[10px] text-gray-400 ml-1">(pick one)</span>
        )}
      </div>

      {/* Options */}
      <div className="flex flex-wrap gap-2 mb-4">
        {q.options.map((option) => {
          const isActive = currentAnswers.includes(option)
          return (
            <button
              key={option}
              onClick={() => toggleOption(option)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? 'bg-cyan-600 text-white ring-2 ring-cyan-300'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-cyan-300'
              }`}
            >
              {option}
            </button>
          )
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-3 py-2 transition-colors"
          >
            <ChevronLeft size={14} />
            Back
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={currentAnswers.length === 0}
          className="flex-1 bg-cyan-600 disabled:bg-gray-200 text-white text-xs font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1 transition-colors"
        >
          {step === QUESTIONS.length - 1 ? (
            <>
              <Sparkles size={14} />
              Save My Style
            </>
          ) : (
            <>
              Next
              <ChevronRight size={14} />
            </>
          )}
        </button>
      </div>

      {/* Skip */}
      <button
        onClick={() => { try { localStorage.setItem(`kanchuki_quiz_${storeSlug}`, '{}') } catch {}; setDone(true); onComplete?.() }}
        className="w-full text-center text-[10px] text-gray-400 hover:text-gray-600 mt-2 transition-colors"
      >
        Skip for now
      </button>
    </div>
  )
}
