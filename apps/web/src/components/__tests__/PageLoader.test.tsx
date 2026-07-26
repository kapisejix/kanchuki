import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageLoader } from '../PageLoader'

describe('PageLoader', () => {
  it('renders fullscreen variant by default with loading text', () => {
    render(<PageLoader />)
    // Should show loading text
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('renders card variant without the logo', () => {
    const { container } = render(<PageLoader variant="card" />)
    // Card variant should NOT have the letter logo
    expect(screen.queryByText('K')).not.toBeInTheDocument()
    // Card variant has the full-width space-y-4 layout
    const rootDiv = container.firstChild as HTMLElement
    expect(rootDiv.className).toContain('w-full')
  })

  it('renders minimal variant with spinner and custom text', () => {
    render(<PageLoader variant="minimal" text="Loading dashboard..." />)
    // Should show custom text
    expect(screen.getByText('Loading dashboard...')).toBeInTheDocument()
  })

  it('renders skeleton cards in card variant', () => {
    const { container } = render(<PageLoader variant="card" />)
    // Card variant renders skeleton card divs with h-24 (skeleton height)
    const animatedPulses = container.querySelectorAll('.animate-pulse')
    expect(animatedPulses.length).toBeGreaterThanOrEqual(1)
  })

  it('renders skeleton cards in fullscreen variant', () => {
    const { container } = render(<PageLoader variant="fullscreen" />)
    // Fullscreen renders animated pulse elements
    const animatedPulses = container.querySelectorAll('.animate-pulse')
    expect(animatedPulses.length).toBeGreaterThanOrEqual(1)
  })

  it('has accessible loading text', () => {
    render(<PageLoader text="Loading admin panel..." />)
    expect(screen.getByText('Loading admin panel...')).toBeInTheDocument()
  })
})
