import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

export function createManagementToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashManagementToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function hasValidManagementToken(request: NextRequest, storedHash: string | null): boolean {
  if (!storedHash) return false
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const token = request.headers.get('x-management-token') || bearer
  if (!token) return false

  const actual = Buffer.from(hashManagementToken(token), 'utf8')
  const expected = Buffer.from(storedHash, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function buildManagementUrl(baseUrl: string, shortCode: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/manage/${encodeURIComponent(shortCode)}#token=${encodeURIComponent(token)}`
}
