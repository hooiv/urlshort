import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateScim, parseScimFilter, scimFilterMatches } from '@/lib/scim'
import { hashPassword } from '@/lib/auth'
import { randomBytes } from 'node:crypto'

const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
const LIST_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'
const ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error'
function headers() { return { 'Content-Type': 'application/scim+json', 'Cache-Control': 'no-store' } }
function acceptsScimContentType(request: NextRequest) { const value=(request.headers.get('content-type')||'').split(';',1)[0].trim().toLowerCase(); return value==='application/scim+json' }
function error(detail: string, status: number) { return NextResponse.json({ schemas: [ERROR_SCHEMA], detail, status: String(status) }, { status, headers: headers() }) }
function resource(identity: { id: string; externalId: string; active: boolean }, user: { email: string; name: string | null }) {
  return { schemas: [USER_SCHEMA], id: identity.id, externalId: identity.externalId, userName: user.email, active: identity.active, name: user.name ? { formatted: user.name } : undefined, meta: { resourceType: 'User' } }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  if (!await authenticateScim(request, workspaceId)) return error('Unauthorized', 401)
  const url = new URL(request.url)
  let filter
  try { filter = parseScimFilter(url.searchParams.get('filter')) } catch { return error('Invalid or unsupported filter', 400) }
  const startIndex = Math.max(1, Number.parseInt(url.searchParams.get('startIndex') || '1', 10) || 1)
  const count = Math.min(100, Math.max(0, Number.parseInt(url.searchParams.get('count') || '100', 10) || 100))
  const sortBy = (url.searchParams.get('sortBy') || '').toLowerCase()
  if (sortBy && !['username', 'externalid', 'active', 'name.formatted'].includes(sortBy)) return error('Unsupported sortBy', 400)
  const identities = await prisma.scimIdentity.findMany({ where: { workspaceId } })
  const users = await prisma.user.findMany({ where: { id: { in: identities.map(x => x.userId) } }, select: { id: true, email: true, name: true } })
  const userMap = new Map(users.map(user => [user.id, user]))
  let matched = identities
  if (filter) {
    matched = identities.filter(x => { const user = userMap.get(x.userId); return !!user && scimFilterMatches({id:x.id,externalId:x.externalId,userName:user.email,active:x.active,displayName:user.name,name:{formatted:user.name},emails:[{value:user.email}]}, filter) })
  }
  if (sortBy) matched.sort((a, b) => {
    const avUser = userMap.get(a.userId); const bvUser = userMap.get(b.userId)
    const av = sortBy === 'username' ? (avUser?.email || '') : sortBy === 'externalid' ? a.externalId : sortBy === 'active' ? String(a.active) : (avUser?.name || '')
    const bv = sortBy === 'username' ? (bvUser?.email || '') : sortBy === 'externalid' ? b.externalId : sortBy === 'active' ? String(b.active) : (bvUser?.name || '')
    return av.localeCompare(bv)
  })
  if ((url.searchParams.get('sortOrder') || 'ascending').toLowerCase() === 'descending') matched.reverse()
  const Resources = matched.slice(startIndex - 1, startIndex - 1 + count).flatMap(identity => { const user = userMap.get(identity.userId); return user ? [resource(identity, user)] : [] })
  return NextResponse.json({ schemas: [LIST_SCHEMA], totalResults: matched.length, startIndex, itemsPerPage: Resources.length, Resources }, { headers: headers() })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  if (!await authenticateScim(request, workspaceId)) return error('Unauthorized', 401)
  if (!acceptsScimContentType(request)) return error('Content-Type must be application/scim+json', 415)
  let b: unknown
  try { b = await request.json() } catch { return error('Invalid JSON', 400) }
  if (!b || typeof b !== 'object') return error('Invalid SCIM user payload', 400)
  const body = b as { userName?: unknown; emails?: Array<{ value?: unknown }>; externalId?: unknown; id?: unknown; active?: unknown; name?: { formatted?: unknown }; displayName?: unknown }
  const email = String(body.userName || body.emails?.[0]?.value || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('userName must be a valid email address', 400)
  const externalId = String(body.externalId || body.id || '').trim()
  if (!externalId) return error('externalId is required', 400)
  let user = await prisma.user.findUnique({ where: { email } })
  if (!user) user = await prisma.user.create({ data: { email, password: await hashPassword(randomBytes(32).toString('base64url')), name: typeof body.name?.formatted === 'string' ? body.name.formatted : typeof body.displayName === 'string' ? body.displayName : null, emailVerifiedAt: new Date() } })
  await prisma.membership.upsert({ where: { workspaceId_userId: { workspaceId, userId: user.id } }, create: { workspaceId, userId: user.id, role: 'viewer' }, update: {} })
  try {
    const identity = await prisma.scimIdentity.create({ data: { workspaceId, userId: user.id, externalId, active: body.active !== false } })
    return NextResponse.json(resource(identity, user), { status: 201, headers: { ...headers(), Location: `${urlBase(request)}/${identity.id}` } })
  } catch (e: unknown) {
    if (e instanceof Error && 'code' in e && e.code === 'P2002') return error('A SCIM user with this externalId or userName already exists', 409)
    throw e
  }
}

function urlBase(request: NextRequest) { return new URL(request.url).toString().replace(/\/$/, '') }

