import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/auth'

export type AuditInput = {
  action: string
  urlId?: string | null
  resourceType?: string | null
  resourceId?: string | null
  before?: unknown
  after?: unknown
  metadata?: unknown
  actorUserId?: string | null
  sessionId?: string | null
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null
  return createHash('sha256').update(ip).digest('hex')
}

function clientIp(request: NextRequest): string | null {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')
}

export async function recordAudit(request: NextRequest, input: AuditInput): Promise<void> {
  try {
    const session = await getCurrentSession(request)
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    const delegated = request.headers.has('x-management-token') || Boolean(bearer)
    await prisma.auditEvent.create({
      data: {
        action: input.action,
        actorType: session || input.actorUserId ? 'user' : delegated ? 'management_token' : 'system',
        actorUserId: input.actorUserId ?? session?.user.id ?? null,
        sessionId: input.sessionId ?? session?.id ?? null,
        urlId: input.urlId ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        ipHash: hashIp(clientIp(request)),
        userAgent: request.headers.get('user-agent'),
        beforeJson: input.before === undefined ? null : JSON.stringify(input.before),
        afterJson: input.after === undefined ? null : JSON.stringify(input.after),
        metadataJson: input.metadata === undefined ? null : JSON.stringify(input.metadata),
      },
    })
  } catch (error) {
    console.error('Audit event write failed:', error)
  }
}
