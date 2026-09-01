import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'

export function hashScimToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function authenticateScim(request: NextRequest, workspaceId: string) {
  const raw = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || request.headers.get('x-scim-token') || ''
  if (!raw) return null
  const token = await prisma.scimToken.findFirst({ where: { workspaceId, tokenHash: hashScimToken(raw), revokedAt: null } })
  if (token) await prisma.scimToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
  return token
}

export function createScimToken() {
  const token = `qlscim_${randomBytes(32).toString('base64url')}`
  return { token, prefix: token.slice(0, 12), hash: hashScimToken(token) }
}

export { parseScimFilter, scimFilterMatches } from '@/lib/scim-filter'

export function parseScimPatchOperations(body: unknown): Array<{ op: 'add' | 'replace' | 'remove'; path?: string; value?: unknown }> {
  if (!body || typeof body !== 'object') throw new Error('Invalid PATCH body')
  const b = body as { schemas?: unknown; Operations?: unknown }
  if (!Array.isArray(b.Operations) || !b.Operations.length) throw new Error('SCIM PATCH Operations is required')
  if (Array.isArray(b.schemas) && !b.schemas.includes('urn:ietf:params:scim:api:messages:2.0:PatchOp')) throw new Error('Unsupported PATCH schema')
  return b.Operations.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid PATCH operation')
    const x = raw as { op?: unknown; path?: unknown; value?: unknown }
    const op = String(x.op ?? '').toLowerCase()
    if (op !== 'add' && op !== 'replace' && op !== 'remove') throw new Error('Unsupported PATCH operation')
    return { op, path: typeof x.path === 'string' ? x.path : undefined, value: x.value }
  })
}

