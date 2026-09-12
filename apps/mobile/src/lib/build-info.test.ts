import { describe, expect, it } from 'vitest'
import { formatBuildInfo, formatBuildTime, type BuildInfo } from './build-info'

describe('formatBuildTime', () => {
  it('renders an ISO timestamp as UTC so it lines up with CI logs', () => {
    // CI logs and GitHub run pages are UTC — a device-local rendering would be
    // unreadable against them, which is the whole point of this footer.
    expect(formatBuildTime('2026-09-11T15:36:00Z')).toBe('2026-09-11 15:36 UTC')
  })

  it('renders the same instant identically regardless of the +offset written', () => {
    // 20:06+04:30 === 15:36Z. Both must print as the UTC instant.
    expect(formatBuildTime('2026-09-11T20:06:00+04:30')).toBe('2026-09-11 15:36 UTC')
  })

  it('returns null for a missing timestamp', () => {
    expect(formatBuildTime(null)).toBeNull()
  })

  it('passes an unparseable value through instead of printing Invalid Date', () => {
    // A future build tool could stamp a non-ISO string. Showing it raw is
    // diagnosable; "Invalid Date" is not.
    expect(formatBuildTime('not-a-date')).toBe('not-a-date')
  })
})

describe('formatBuildInfo', () => {
  const base: BuildInfo = { shortSha: '0305d58', builtAt: null, channel: 'ci' }

  it('joins sha, channel and time', () => {
    expect(formatBuildInfo({ ...base, builtAt: '2026-09-11T15:36:00Z' })).toBe(
      'build 0305d58 · ci · 2026-09-11 15:36 UTC',
    )
  })

  it('omits the time segment when there is none', () => {
    expect(formatBuildInfo(base)).toBe('build 0305d58 · ci')
  })

  it('keeps "unknown" honest rather than dropping the field', () => {
    // A build with no provenance is itself the answer to "which build ran".
    expect(formatBuildInfo({ shortSha: 'unknown', builtAt: null, channel: 'local' })).toBe(
      'build unknown · local',
    )
  })
})
