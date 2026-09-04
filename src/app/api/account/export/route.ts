import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Redact a webhook URL to its origin; never throws on malformed input. */
export function redactWebhookUrl(raw: string): string {
  try {
    return new URL(raw).origin + '/…'
  } catch {
    return '[invalid url]'
  }
}

/**
 * Escape a single CSV cell. Quotes per RFC 4180 and prefixes formula
 * triggers (=, +, -, @) so spreadsheet apps don't execute exported data.
 */
export function toCsvCell(value: unknown): string {
  const text = String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

  const [links, memberships, keys, audit, webhooks, campaigns] = await Promise.all([
    prisma.url.findMany({ where: { userId: user.id } }),
    prisma.membership.findMany({
      where: { userId: user.id },
      select: { workspaceId: true, role: true, createdAt: true },
    }),
    prisma.apiKey.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, prefix: true, scopes: true, createdAt: true, revokedAt: true },
    }),
    prisma.auditEvent.findMany({
      where: { actorUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    prisma.webhookEndpoint.findMany({
      where: { workspace: { members: { some: { userId: user.id } } } },
      select: { id: true, workspaceId: true, url: true, events: true, isActive: true, createdAt: true },
    }),
    prisma.campaign.findMany({
      where: { workspace: { members: { some: { userId: user.id } } } },
      include: { variants: true },
      take: 1000,
    }),
  ])

  const format = request.nextUrl.searchParams.get('format') || 'json'
  const data = {
    exportedAt: new Date().toISOString(),
    version: 1,
    user: { id: user.id, email: user.email, name: user.name },
    links,
    memberships,
    apiKeys: keys,
    audit,
    webhooks: webhooks.map((w) => ({
      ...w,
      url: redactWebhookUrl(w.url),
    })),
    campaigns,
  }

  if (format === 'csv') {
    const rows = links.map((l) =>
      [l.id, l.shortCode, l.originalUrl, l.title || '', l.clicks, l.createdAt.toISOString()]
        .map(toCsvCell)
        .join(',')
    )
    return new NextResponse(['id,shortCode,originalUrl,title,clicks,createdAt', ...rows].join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="quicklink-export.csv"',
      },
    })
  }

  return NextResponse.json(data, {
    headers: {
      'Content-Disposition': 'attachment; filename="quicklink-data-export.json"',
    },
  })
}
