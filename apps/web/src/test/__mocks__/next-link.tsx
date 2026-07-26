import React from 'react'

/**
 * Mock for next/link.
 * Renders as a plain <a> tag in test environment.
 */
export default function MockLink({
  href,
  children,
  className,
  onClick,
}: {
  href: string
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  )
}
