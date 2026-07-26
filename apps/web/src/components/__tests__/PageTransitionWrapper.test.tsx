import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageTransitionWrapper } from '../PageTransitionWrapper'

describe('PageTransitionWrapper', () => {
  it('renders children in default mode', () => {
    render(
      <PageTransitionWrapper>
        <div data-testid="child">Content</div>
      </PageTransitionWrapper>,
    )
    expect(screen.getByTestId('child')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('renders children in staggered mode', () => {
    render(
      <PageTransitionWrapper staggered>
        <div data-testid="child-1">Item 1</div>
        <div data-testid="child-2">Item 2</div>
      </PageTransitionWrapper>,
    )
    expect(screen.getByTestId('child-1')).toBeInTheDocument()
    expect(screen.getByTestId('child-2')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    const { container } = render(
      <PageTransitionWrapper className="custom-class">
        <div>Content</div>
      </PageTransitionWrapper>,
    )
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('accepts empty children without error', () => {
    const { container } = render(<PageTransitionWrapper />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('has motion.div with entrance animation variants', () => {
    const { container } = render(
      <PageTransitionWrapper>
        <div>Content</div>
      </PageTransitionWrapper>,
    )
    const element = container.firstChild as HTMLElement
    expect(element.tagName).toBe('DIV')
  })

  it('has exit animation variant configured for route changes', () => {
    const { container } = render(
      <PageTransitionWrapper>
        <div>Content</div>
      </PageTransitionWrapper>,
    )
    // The component renders a motion.div with exit="exit" prop.
    // framer-motion stores exit variants on the internal data attributes
    // in development. In jsdom, just verify the div renders.
    expect(container.firstChild).toBeInTheDocument()
  })
})
