import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateScim, parseScimPatchOperations } from '@/lib/scim'

const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error'
const H = { 'Content-Type': 'application/scim+json', 'Cache-Control': 'no-store' }
function acceptsScimContentType(request: NextRequest) { const value=(request.headers.get('content-type')||'').split(';',1)[0].trim().toLowerCase(); return value==='application/scim+json' }
function err(detail: string, status: number) { return NextResponse.json({ schemas: [ERROR_SCHEMA], detail, status: String(status) }, { status, headers: H }) }
function out(i: { id: string; externalId: string; active: boolean }, user: { email: string; name: string | null }) {
  return { schemas: [USER_SCHEMA], id: i.id, externalId: i.externalId, userName: user.email, active: i.active, name: user.name ? { formatted: user.name } : undefined, meta: { resourceType: 'User' } }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string; userId: string }> }) {
  const { workspaceId, userId } = await params
  if (!await authenticateScim(request, workspaceId)) return err('Unauthorized', 401)
  if (!acceptsScimContentType(request)) return err('Content-Type must be application/scim+json', 415)
  const identity = await prisma.scimIdentity.findFirst({ where: { workspaceId, id: userId }, include: { user: { select: { email: true, name: true } } } })
  if (!identity) return err('Resource not found', 404)
  const user = await prisma.user.findUnique({ where: { id: identity.userId }, select: { email: true, name: true } })
  if (!user) return err('Resource not found', 404)
  return NextResponse.json(out(identity, user), { headers: H })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ workspaceId: string; userId: string }> }) {
  const { workspaceId, userId } = await params
  if (!await authenticateScim(request, workspaceId)) return err('Unauthorized', 401)
  const identity = await prisma.scimIdentity.findFirst({ where: { workspaceId, id: userId } })
  if (!identity) return err('Resource not found', 404)
  let operations
  try { operations = parseScimPatchOperations(await request.json()) } catch (e) { return err(e instanceof Error ? e.message : 'Invalid PATCH', 400) }
  let active = identity.active
  let externalId = identity.externalId
  let email: string | undefined
  let name: string | null | undefined
  try {
    for (const operation of operations) {
      const path = (operation.path || '').toLowerCase()
      const value: unknown = operation.value
      if (!path && value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) {
          if (k.toLowerCase() === 'name' && v && typeof v === 'object' && !Array.isArray(v) && 'formatted' in v) apply('name.formatted', operation.op, (v as { formatted: unknown }).formatted)
          else apply(k.toLowerCase(), operation.op, v)
        }
      } else apply(path, operation.op, value)
    }
    if (email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('userName must be a valid email address')
    if (email !== undefined) {
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing && existing.id !== identity.userId) return err('userName is already in use', 409)
    }
    const updated = await prisma.$transaction(async tx => {
      const i = await tx.scimIdentity.update({ where: { id: identity.id }, data: { active, externalId } })
      if (email !== undefined || name !== undefined) await tx.user.update({ where: { id: identity.userId }, data: { ...(email !== undefined ? { email } : {}), ...(name !== undefined ? { name } : {}) } })
      return i
    })
    const full = await prisma.scimIdentity.findUniqueOrThrow({ where: { id: updated.id } })
    const updatedUser = await prisma.user.findUniqueOrThrow({ where: { id: full.userId }, select: { email: true, name: true } })
    return NextResponse.json(out(full, updatedUser), { headers: H })
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Invalid PATCH operation', 400)
  }

  function apply(rawPath: string, op: 'add' | 'replace' | 'remove', rawValue: unknown) {
    const path = rawPath.replace(/^\s+|\s+$/g, '')
    if (!['active', 'externalid', 'username', 'name.formatted'].includes(path)) throw new Error(`Unsupported PATCH path: ${path || '(root)'}`)
    if (path === 'active') { active = op === 'remove' ? true : Boolean(rawValue); return }
    if (path === 'externalid') { if (op === 'remove') throw new Error('externalId cannot be removed'); externalId = String(rawValue ?? ''); if (!externalId) throw new Error('externalId cannot be empty'); return }
    if (path === 'username') { if (op === 'remove') throw new Error('userName cannot be removed'); email = String(rawValue ?? '').trim().toLowerCase(); return }
    if (path === 'name.formatted') { name = op === 'remove' ? null : String(rawValue ?? ''); return }
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ workspaceId: string; userId: string }> }) {
  const { workspaceId, userId } = await params
  if (!await authenticateScim(request, workspaceId)) return err('Unauthorized', 401)
  const identity = await prisma.scimIdentity.findFirst({ where: { workspaceId, id: userId } })
  if (!identity) return err('Resource not found', 404)
  await prisma.scimIdentity.update({ where: { id: identity.id }, data: { active: false } })
  return new Response(null, { status: 204 })
}



