import { nanoid } from 'nanoid'

export function generateShortCode(length: number = 7): string {
  return nanoid(length)
}

export function isValidUrl(url: string): boolean {
  try {
    const urlObj = new URL(url)
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch {
    return false
  }
}

export function normalizeUrl(url: string): string {
  // Add https:// if no protocol is specified
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return `https://${url}`
  }
  return url
}

export function getBaseUrl(): string {
  if (process.env.NODE_ENV === 'production') {
    return process.env.NEXT_PUBLIC_BASE_URL || 'https://yourapp.com'
  }
  return 'http://localhost:3000'
}

export function getShortUrl(shortCode: string): string {
  return `${getBaseUrl()}/${shortCode}`
}
