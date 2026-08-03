import { describe, expect, it } from 'vitest'
import { COLORS } from './colors.js'
import {
  applyThemeOverrides,
  DEFAULT_PLATFORM_THEME,
  type PlatformTheme,
} from './theme.js'

const customTheme: PlatformTheme = {
  primary_color: '#0B1F3A',
  accent_color: '#E8A33D',
  tertiary_color: '#6F4B14',
  background_color: '#FAF7F2',
  text_color: '#1A1A1A',
  surface_color: '#F0EBE3',
}

describe('DEFAULT_PLATFORM_THEME', () => {
  it('defines all six tokens', () => {
    const theme = DEFAULT_PLATFORM_THEME
    expect(Object.keys(theme).sort()).toEqual(
      [
        'primary_color',
        'accent_color',
        'tertiary_color',
        'background_color',
        'text_color',
        'surface_color',
      ].sort(),
    )
  })

  it('uses 6-digit hex values for every token', () => {
    for (const value of Object.values(DEFAULT_PLATFORM_THEME)) {
      expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})

describe('applyThemeOverrides', () => {
  it('maps each token onto its COLORS anchor step', () => {
    const out = applyThemeOverrides(COLORS, customTheme)
    expect(out.ink[600]).toBe(customTheme.primary_color)
    expect(out.rust[600]).toBe(customTheme.accent_color)
    expect(out.turmeric[600]).toBe(customTheme.tertiary_color)
    expect(out.sand[100]).toBe(customTheme.surface_color)
    expect(out.cotton).toBe(customTheme.background_color)
    expect(out.charcoal).toBe(customTheme.text_color)
  })

  it('preserves every non-anchored step of each ramp', () => {
    const out = applyThemeOverrides(COLORS, customTheme)
    const steps = [50, 100, 200, 300, 400, 500, 700, 800, 900] as const
    for (const step of steps) {
      expect(out.ink[step]).toBe(COLORS.ink[step])
      expect(out.rust[step]).toBe(COLORS.rust[step])
      expect(out.turmeric[step]).toBe(COLORS.turmeric[step])
      // sand 100 IS anchored — check the rest
      if (step !== 100) expect(out.sand[step]).toBe(COLORS.sand[step])
    }
    expect(out.sand[100]).toBe(customTheme.surface_color)
  })

  it('leaves non-brand semantic colors untouched', () => {
    const out = applyThemeOverrides(COLORS, customTheme)
    expect(out.danger).toBe(COLORS.danger)
    expect(out.dangerSurface).toBe(COLORS.dangerSurface)
    expect(out.dangerTint).toBe(COLORS.dangerTint)
    expect(out.chartAccent).toBe(COLORS.chartAccent)
    expect(out.glow).toBe(COLORS.glow)
    expect(out.veil).toBe(COLORS.veil)
  })

  it('does not mutate the base COLORS object (pure overlay)', () => {
    const before = JSON.stringify(COLORS)
    applyThemeOverrides(COLORS, customTheme)
    expect(JSON.stringify(COLORS)).toBe(before)
    // anchor steps on the base object are untouched by the call
    expect(COLORS.ink[600]).toBe('#14213D')
    expect(COLORS.cotton).toBe('#FFFFFF')
  })

  it('merges a partial theme over the defaults, leaving other tokens as-is', () => {
    const partial: PlatformTheme = { ...DEFAULT_PLATFORM_THEME, primary_color: '#FF0000' }
    const out = applyThemeOverrides(COLORS, partial)
    expect(out.ink[600]).toBe('#FF0000')
    expect(out.rust[600]).toBe(COLORS.rust[600])
    expect(out.turmeric[600]).toBe(COLORS.turmeric[600])
    expect(out.cotton).toBe(COLORS.cotton)
    expect(out.charcoal).toBe(COLORS.charcoal)
    expect(out.sand[100]).toBe(COLORS.sand[100])
  })

  it('applying the default theme yields the shipped brand anchors', () => {
    const out = applyThemeOverrides(COLORS, DEFAULT_PLATFORM_THEME)
    expect(out.ink[600]).toBe(DEFAULT_PLATFORM_THEME.primary_color)
    expect(out.rust[600]).toBe(DEFAULT_PLATFORM_THEME.accent_color)
    expect(out.turmeric[600]).toBe(DEFAULT_PLATFORM_THEME.tertiary_color)
    expect(out.cotton).toBe(DEFAULT_PLATFORM_THEME.background_color)
    expect(out.charcoal).toBe(DEFAULT_PLATFORM_THEME.text_color)
    expect(out.sand[100]).toBe(DEFAULT_PLATFORM_THEME.surface_color)
  })

  it('round-trips: values read back identically through the overlay', () => {
    const out = applyThemeOverrides(COLORS, customTheme)
    expect(out.ink[600]).toBe(customTheme.primary_color)
    expect(out.rust[600]).toBe(customTheme.accent_color)
    expect(out.turmeric[600]).toBe(customTheme.tertiary_color)
    expect(out.cotton).toBe(customTheme.background_color)
    expect(out.charcoal).toBe(customTheme.text_color)
    expect(out.sand[100]).toBe(customTheme.surface_color)
  })

  it('returns an object shaped like COLORS (readable via dot access)', () => {
    const out = applyThemeOverrides(COLORS, customTheme)
    expect(typeof out.ink[600]).toBe('string')
    expect(typeof out.rust[600]).toBe('string')
    expect(typeof out.cotton).toBe('string')
    expect(typeof out.charcoal).toBe('string')
    // full ramp surface still present
    expect(out.ink[900]).toBe(COLORS.ink[900])
  })
})
