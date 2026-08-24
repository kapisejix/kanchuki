'use client'

import Link from 'next/link'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}

export function ConsentCheckbox({ checked, onChange, className = '' }: Props) {
  return (
    <label className={`flex items-start gap-2 cursor-pointer ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
        className="mt-0.5 h-4 w-4 flex-shrink-0"
      />
      <span className="text-[11px] text-gray-500 leading-4">
        I agree to Kanchuki&apos;s{' '}
        <Link href="/privacy" target="_blank" className="underline hover:text-gray-700">
          Privacy Policy
        </Link>{' '}
        and{' '}
        <Link href="/terms" target="_blank" className="underline hover:text-gray-700">
          Terms
        </Link>
        , and consent to being contacted about this.
      </span>
    </label>
  )
}
