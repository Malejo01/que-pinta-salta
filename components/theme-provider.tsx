'use client'

import * as React from 'react'
 
type Theme = 'light' | 'dark' | 'system'

type ThemeProviderProps = React.PropsWithChildren<{
  defaultTheme?: Theme
  storageKey?: string
  attribute?: 'class' | string
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
}>

type ThemeProviderContext = {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'light' | 'dark'
}

const ThemeContext = React.createContext<ThemeProviderContext | undefined>(
  undefined,
)

function resolveTheme(theme: Theme, enableSystem: boolean): 'light' | 'dark' {
  if (
    theme === 'system' &&
    enableSystem &&
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark'
  }
  return theme === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const {
    defaultTheme = 'system',
    storageKey = 'theme',
    attribute = 'class',
    enableSystem = true,
  } = props

  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === 'undefined') {
      return defaultTheme
    }

    const storedTheme = window.localStorage.getItem(storageKey) as Theme | null
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
      return storedTheme
    }

    return defaultTheme
  })

  const resolvedTheme = React.useMemo(
    () => resolveTheme(theme, enableSystem),
    [theme, enableSystem],
  )

  React.useEffect(() => {
    const root = document.documentElement
    if (attribute === 'class') {
      root.classList.remove('light', 'dark')
      root.classList.add(resolvedTheme)
    } else {
      root.setAttribute(attribute, resolvedTheme)
    }
    root.style.colorScheme = resolvedTheme
  }, [attribute, resolvedTheme])

  React.useEffect(() => {
    if (!enableSystem || theme !== 'system') {
      return
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      const root = document.documentElement
      const nextTheme = media.matches ? 'dark' : 'light'
      if (attribute === 'class') {
        root.classList.remove('light', 'dark')
        root.classList.add(nextTheme)
      } else {
        root.setAttribute(attribute, nextTheme)
      }
      root.style.colorScheme = nextTheme
    }

    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [theme, enableSystem, attribute])

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      window.localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [storageKey],
  )

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
