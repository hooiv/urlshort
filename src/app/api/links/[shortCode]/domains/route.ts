import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createVerificationToken, edgeTarget, normalizeHost, normalizePath, verificationRecord, verifyDns } from '@/lib/domains'
import { invalidateDomain } from '@/lib/link-cache'
import { recordAudit } from '@/lib/audit'
import { getManageableUrl } from '@/lib/authorization'

async function getUrl(request: NextRequest, shortCode: string) {
  const result = await getManageableUrl(request, shortCode)
  if (!result.url) return NextResponse.json({ error: result.error }, { status: result.status })
  return result.url
}

export async function GET(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const result = await getUrl(request, shortCode)
  if (result instanceof NextResponse) return result
  const domains = await prisma.domainLink.findMany({ where: { urlId: result.id }, include: { domain: true }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json(domains)
}

export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const result = await getUrl(request, shortCode)
  if (result instanceof NextResponse) return result
  try {
    const body = (await request.json()) as Record<string, unknown>
    const host = normalizeHost(String(body.host ?? ''))
    const path = normalizePath(String(body.path ?? `/${shortCode}`))
    const existing = await prisma.brandedDomain.findUnique({ where: { host } })
    if (existing?.ownerUrlId && existing.ownerUrlId !== result.id) return NextResponse.json({ error: 'This domain is already owned by another link account' }, { status: 409 })
    const domain = existing || await prisma.brandedDomain.create({ data: { host, ownerUrlId: result.id, verificationToken: createVerificationToken() } })
    await prisma.domainProvision.upsert({ where: { domainId: domain.id }, create: { domainId: domain.id, verificationValue: domain.verificationToken, status: 'requested' }, update: { status: domain.status === 'verified' ? 'provisioning' : 'verifying' } })
    if (domain.status !== 'verified') {
      const record = verificationRecord(host, domain.verificationToken)
      return NextResponse.json({ verified: false, domain, dns: { ...record, cname: { name: host, type: 'CNAME', value: edgeTarget() } } })
    }
    const link = await prisma.domainLink.upsert({ where: { domainId_path: { domainId: domain.id, path } }, update: { urlId: result.id }, create: { domainId: domain.id, urlId: result.id, path } })
    invalidateDomain(host)
    await recordAudit(request, { action: 'branded_domain.bind', urlId: result.id, resourceType: 'domain_link', resourceId: link.id, after: { host, path, verified: true } })
    return NextResponse.json({ verified: true, domain, link }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not add branded domain' }, { status: 400 })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const result = await getUrl(request, shortCode)
  if (result instanceof NextResponse) return result
  const body = (await request.json()) as Record<string, unknown>
  const host = normalizeHost(String(body.host ?? ''))
  const path = normalizePath(String(body.path ?? `/${shortCode}`))
  const domain = await prisma.brandedDomain.findUnique({ where: { host } })
  if (!domain) return NextResponse.json({ error: 'Domain has not been registered for verification yet' }, { status: 404 })
  try {
    const verified = await verifyDns(host, domain.verificationToken)
    if (!verified) return NextResponse.json({ error: 'Verification TXT record was not found' }, { status: 409 })
    const updated = await prisma.brandedDomain.update({ where: { id: domain.id }, data: { status: 'verified', verifiedAt: new Date(), lastCheckedAt: new Date() } })
    const link = await prisma.domainLink.upsert({ where: { domainId_path: { domainId: domain.id, path } }, update: { urlId: result.id }, create: { domainId: domain.id, urlId: result.id, path } })
    invalidateDomain(host)
    await recordAudit(request, { action: 'branded_domain.verify', urlId: result.id, resourceType: 'branded_domain', resourceId: domain.id, after: { host, path, status: updated.status, verifiedAt: updated.verifiedAt } })
    return NextResponse.json({ verified: true, domain: updated, link })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'DNS verification failed' }, { status: 409 })
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const result = await getUrl(request, shortCode)
  if (result instanceof NextResponse) return result
  const body = (await request.json()) as Record<string, unknown>
  const host = normalizeHost(String(body.host ?? ''))
  const path = normalizePath(String(body.path ?? `/${shortCode}`))
  const domain = await prisma.brandedDomain.findUnique({ where: { host } })
  if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })
  await prisma.domainLink.deleteMany({ where: { domainId: domain.id, urlId: result.id, path } })
  invalidateDomain(host)
  await recordAudit(request, { action: 'branded_domain.unbind', urlId: result.id, resourceType: 'branded_domain', resourceId: domain.id, metadata: { host, path } })
  return new NextResponse(null, { status: 204 })
}
