import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { themeApi } from './api'
import { getItem, setItem } from './storage'

// bg-ink-600/text-ink-600/border-ink-600 classNames pick up primaryColor for
// free via nativewind's vars() (see AppShell in app/_layout.tsx) — no edits
// needed there. useTheme()/getPrimaryColor() below are for the remaining
// spots that bypass className entirely: raw `color="#hex"` props (icon
// libraries, ActivityIndicator) and inline style objects.
const DEFAULT_PRIMARY = '#14213D'
const STORAGE_KEY = 'theme_primary_color'

const ThemeContext = createContext<{ primaryColor: string }>({ primaryColor: DEFAULT_PRIMARY })

// ponytail: plain module-level mirror of the context value, for the rare
// module-scope color constant that can't call a hook. Not reactive — read
// once at module load — so prefer useTheme() inside components; this is
// the fallback only for cases that used a hardcoded literal at module scope.
let currentPrimary = DEFAULT_PRIMARY
export function getPrimaryColor(): string {
  return currentPrimary
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY)

  useEffect(() => {
    // Serve last-known color immediately (offline-friendly), then refresh.
    getItem(STORAGE_KEY).then((cached) => {
      if (cached) {
        currentPrimary = cached
        setPrimaryColor(cached)
      }
    })

    themeApi
      .get()
      .then(({ data }) => {
        if (data?.primary_color) {
          currentPrimary = data.primary_color
          setPrimaryColor(data.primary_color)
          void setItem(STORAGE_KEY, data.primary_color)
        }
      })
      .catch(() => {
        // Network unavailable — keep cached/default color
      })
  }, [])

  return <ThemeContext.Provider value={{ primaryColor }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
