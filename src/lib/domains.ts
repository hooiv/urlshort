import { createHash, randomBytes } from 'node:crypto'
import { promises as dns } from 'node:dns'

export function normalizeHost(input: string): string {
  const value = input.trim().toLowerCase().replace(/\.$/, '')
  if (!value || value.length > 253 || value.includes('/') || value.includes(':')) throw new Error('Enter a valid hostname')
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)) throw new Error('Enter a public hostname such as go.example.com')
  if (value === 'localhost' || value.endsWith('.local') || value.endsWith('.internal')) throw new Error('Private hostnames are not allowed')
  return value
}

export function createVerificationToken(): string { return randomBytes(24).toString('base64url') }
export function verificationRecord(host: string, token: string) { return { name: `_quicklink-verification.${host}`, type: 'TXT', value: `quicklink-site-verification=${token}` } }

export async function verifyDns(host: string, token: string): Promise<boolean> {
  const records = await dns.resolveTxt(`_quicklink-verification.${host}`)
  return records.flat().some((value) => value.trim() === `quicklink-site-verification=${token}`)
}

export function domainTokenHash(token: string): string { return createHash('sha256').update(token).digest('hex') }

export function edgeTarget(): string {
  return process.env.BRANDED_DOMAIN_CNAME_TARGET || process.env.NEXT_PUBLIC_APP_HOST || 'your-edge-host.example.com'
}

export function normalizePath(input: string): string {
  const raw = input.trim()
  const path = raw.startsWith('/') ? raw : `/${raw}`
  if (!/^\/[A-Za-z0-9][A-Za-z0-9._~-]{0,63}$/.test(path)) throw new Error('Path must look like /summer-sale')
  return path
}
