export const THEME_STORAGE_KEY = 'ql-theme'
export type StoredTheme = 'dark' | 'light'

export function parseStoredTheme(raw: string | null | undefined): StoredTheme | null {
  if (raw === 'dark' || raw === 'light') return raw
  return null
}

export function resolveInitialTheme(stored: StoredTheme | null, prefersDark: boolean): boolean {
  if (stored !== null) return stored === 'dark'
  return prefersDark
}

export function readStoredThemeSafe(read: () => string | null): StoredTheme | null {
  try {
    return parseStoredTheme(read())
  } catch {
    return null
  }
}

export function readPrefersDarkSafe(query: () => boolean): boolean {
  try {
    return query() === true
  } catch {
    return false
  }
}

export function themeToStorage(dark: boolean): StoredTheme {
  return dark ? 'dark' : 'light'
}
