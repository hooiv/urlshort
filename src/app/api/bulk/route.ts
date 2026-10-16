import { NextRequest, NextResponse } from 'next/server'
import { folderWriteError } from '@/lib/folders'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { LINK_WRITE_SCOPES, resolveActor } from '@/lib/request-actor'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { getBaseUrl } from '@/lib/utils'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'
import { assessDestination } from '@/lib/link-safety'
import { EDIT_ROLES } from '@/lib/workspaces'
import { withIdempotencyCleanup, getIdempotentResponse, storeIdempotentResponse } from '@/lib/idempotency'
import { recordAudit } from '@/lib/audit'
import { ProviderImportError, fetchProviderImport } from '@/lib/provider-import'
import { publishWorkspaceRoutingConfig } from '@/lib/routing-config'
import { dispatchWebhooksForUrls } from '@/lib/webhooks'
import { invalidateLinks } from '@/lib/link-cache'
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  freshShortCode,
  mapWithConcurrency,
  parseImport,
  parseImportTags,
  type ImportResult,
  type ImportRow,
} from '@/lib/bulk-import'

export const bulkCsvSchema = z.object({
  csv: z.string().min(1, { message: 'Invalid CSV' }).max(MAX_IMPORT_BYTES, { message: 'CSV payload is too large' }).optional(),
  /** Pull links from a competitor's API instead of a CSV. The token is used once and never stored. */
  provider: z.object({
    name: z.enum(['bitly', 'shortio', 'rebrandly']),
    token: z.string().trim().min(8, { message: 'API token is required' }).max(512),
    /** Bitly group GUID, Short.io domain hostname, or Rebrandly domain. Optional. */
    scope: z.string().trim().max(253).optional(),
  }).optional(),
  workspaceId: z.string().min(1).max(64).optional(),
  /** File every imported link into this folder (must belong to workspaceId). */
  folderId: z.string().min(1).max(64).optional(),
  /** What to do when an alias is already taken: report the row, or keep the link under a random code. */
  onConflict: z.enum(['skip', 'generate']).optional(),
}).refine((b) => Boolean(b.csv) !== Boolean(b.provider), { message: 'Send either a CSV or a provider to import from' })

/** Kept for API compatibility with existing callers/tests. */
export const normalizeBulkTags = (input: string) => parseImportTags(input)

const DNS_CONCURRENCY = 16
const INSERT_CHUNK = 500

/**
 * Bulk link import.
 *
 * Previous version: one regex-split line at a time (broke on quoted commas and
 * empty cells), a DNS lookup and an INSERT per row in sequence, no phishing
 * assessment, no destination revision, no workspace, no webhooks, and rows
 * dropped (or silently re-coded) without telling the user why.
 *
 * Now: RFC 4180 parsing with Bitly/Rebrandly/Short.io/Dub header detection;
 * SSRF checks once per distinct host with bounded parallelism; alias
 * conflicts resolved with one query; links + revisions inserted in a single
 * transaction with createManyAndReturn; and a per-row report.
 */
async function handlePost(request: NextRequest) {
  try {
    const resolved = await resolveActor(request, LINK_WRITE_SCOPES)
    if (!resolved.actor) return NextResponse.json({ error: resolved.error }, { status: resolved.status })
    const user = { id: resolved.actor.userId }

    const limit = await rateLimit(request, { name: 'bulk-create', limit: 5, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429, headers: rateLimitHeaders(limit) })

    const body = bulkCsvSchema.safeParse(await request.json().catch(() => ({})))
    if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message || 'Invalid CSV' }, { status: 400 })
    const onConflict = body.data.onConflict ?? 'skip'

    // Idempotency-Key: a retried import after a dropped connection replays the
    // stored report instead of re-running (and, with onConflict=overwrite,
    // re-editing) every row. Keys are scoped to the caller's primary workspace.
    let idem: Awaited<ReturnType<typeof getIdempotentResponse>> = null
    let idemWorkspaceId: string | null = null
    if (request.headers.get('idempotency-key')) {
      const membership = await prisma.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'asc' }, select: { workspaceId: true } })
      if (membership) {
        idemWorkspaceId = membership.workspaceId
        try {
          idem = await getIdempotentResponse(request, membership.workspaceId, body.data)
        } catch (error) {
          return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid Idempotency-Key' }, { status: 400 })
        }
        if (idem?.existing) return new NextResponse(idem.existing.responseJson, { status: idem.existing.responseStatus, headers: { 'Content-Type': 'application/json', 'Idempotent-Replay': 'true' } })
      }
    }

    let workspaceId: string | null = null
    if (body.data.workspaceId) {
      const membership = await prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: body.data.workspaceId, userId: user.id } },
        select: { role: true },
      })
      if (!membership) return NextResponse.json({ error: 'You are not a member of that workspace' }, { status: 403 })
      if (!EDIT_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Editor permission is required to import into this workspace' }, { status: 403 })
      workspaceId = body.data.workspaceId
      if (body.data.folderId) {
        const folderError = await folderWriteError(user.id, workspaceId, membership.role, body.data.folderId)
        if (folderError) return NextResponse.json({ error: folderError }, { status: folderError === 'Folder not found' ? 404 : 403 })
      }
    }
    if (body.data.folderId && !workspaceId) return NextResponse.json({ error: 'Choose a workspace to import into a folder' }, { status: 400 })
    const folderId = body.data.folderId ?? null

    let parsed: ReturnType<typeof parseImport> & { truncated?: boolean }
    if (body.data.provider) {
      // API pulls are slower and hit a third party: tighter per-user budget.
      const pullLimit = await rateLimit(request, { name: 'bulk-provider-pull', limit: 3, windowMs: 10 * 60_000, identifier: user.id })
      if (!pullLimit.allowed) return NextResponse.json({ error: 'Too many provider imports; try again in a few minutes' }, { status: 429, headers: rateLimitHeaders(pullLimit) })
      try {
        parsed = await fetchProviderImport(body.data.provider.name, body.data.provider.token, body.data.provider.scope || undefined)
      } catch (error) {
        if (error instanceof ProviderImportError) return NextResponse.json({ error: error.message }, { status: error.status })
        throw error
      }
    } else {
      parsed = parseImport(body.data.csv!)
    }
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const results = new Map<number, ImportResult>()
    const skip = (row: ImportRow, reason: string) => results.set(row.row, { row: row.row, status: 'skipped', originalUrl: row.url ?? undefined, reason })
    let candidates = parsed.rows.filter((row) => (row.error ? (skip(row, row.error), false) : true))

    // SSRF: resolve each distinct host once instead of once per row.
    const hosts = [...new Set(candidates.map((row) => new URL(row.url!).hostname.toLowerCase()))]
    const hostErrors = new Map<string, string>()
    await mapWithConcurrency(hosts, DNS_CONCURRENCY, async (host) => {
      try {
        await assertDestinationSafeForStorage(`https://${host}/`)
      } catch (error) {
        hostErrors.set(host, error instanceof Error ? error.message : 'Destination is not allowed')
      }
    })
    candidates = candidates.filter((row) => {
      const error = hostErrors.get(new URL(row.url!).hostname.toLowerCase())
      return error ? (skip(row, error), false) : true
    })

    // Alias conflicts against existing links, in one round trip.
    const requested = candidates.flatMap((row) => (row.alias ? [row.alias] : []))
    const taken = new Set(
      requested.length
        ? (await prisma.url.findMany({ where: { shortCode: { in: requested } }, select: { shortCode: true } })).map((link) => link.shortCode)
        : [],
    )
    const planned: Array<ImportRow & { shortCode: string; aliasReplaced: boolean }> = []
    for (const row of candidates) {
      if (row.alias && taken.has(row.alias)) {
        if (onConflict === 'skip') { skip(row, `Alias "${row.alias}" is already taken`); continue }
        const code = freshShortCode(taken)
        taken.add(code)
        planned.push({ ...row, shortCode: code, aliasReplaced: true })
        continue
      }
      const code = row.alias ?? freshShortCode(taken)
      taken.add(code)
      planned.push({ ...row, shortCode: code, aliasReplaced: false })
    }

    const now = new Date()
    const created: Array<{ id: string; shortCode: string; originalUrl: string; title: string | null; tags: string[] }> = []
    for (let offset = 0; offset < planned.length; offset += INSERT_CHUNK) {
      const chunk = planned.slice(offset, offset + INSERT_CHUNK)
      const inserted = await prisma.$transaction(async (tx) => {
        // skipDuplicates: a code taken concurrently since our check is reported
        // per row below rather than failing the whole import.
        const links = await tx.url.createManyAndReturn({
          data: chunk.map((row) => {
            const risk = assessDestination(row.url!)
            return {
              originalUrl: row.url!,
              shortCode: row.shortCode,
              title: row.title,
              tags: row.tags,
              userId: user.id,
              workspaceId,
              folderId,
              riskStatus: risk.status,
              riskReason: risk.reason,
              riskCheckedAt: now,
            }
          }),
          skipDuplicates: true,
          select: { id: true, shortCode: true, originalUrl: true, title: true, tags: true },
        })
        if (links.length) {
          await tx.destinationRevision.createMany({
            data: links.map((link) => ({ urlId: link.id, destinationUrl: link.originalUrl, reason: 'Imported', effectiveAt: now })),
          })
        }
        return links
      })
      created.push(...inserted)
      // Clear negative entries for codes probed before they were imported.
      await invalidateLinks(inserted)
    }

    const createdByCode = new Map(created.map((link) => [link.shortCode, link]))
    for (const row of planned) {
      const link = createdByCode.get(row.shortCode)
      if (!link) skip(row, row.alias ? `Alias "${row.alias}" was taken during import` : 'Could not allocate a short code')
      else results.set(row.row, {
        row: row.row,
        status: 'created',
        shortCode: link.shortCode,
        originalUrl: link.originalUrl,
        ...(row.aliasReplaced ? { reason: `Alias "${row.alias}" was taken; used a generated code` } : {}),
      })
    }

    if (created.length) {
      await recordAudit(request, {
        action: 'link.bulk_import',
        resourceType: 'url',
        resourceId: created[0].id,
        after: { count: created.length, source: parsed.source, workspaceId, folderId },
      })
      // Side effects must not turn a committed import into a reported failure.
      try {
        if (workspaceId) await publishWorkspaceRoutingConfig(workspaceId)
        await dispatchWebhooksForUrls('link.created', created.map((link) => ({
          urlId: link.id,
          payload: { id: link.id, shortCode: link.shortCode, destinationUrl: link.originalUrl, occurredAt: now.toISOString() },
        })))
      } catch (error) {
        console.error('Bulk import side effects failed:', error)
      }
    }

    const ordered = [...results.values()].sort((a, b) => a.row - b.row)
    const baseUrl = getBaseUrl()
    const payload = {
      source: parsed.source,
      summary: { total: parsed.totalRows, created: created.length, skipped: parsed.totalRows - created.length, ...(parsed.truncated ? { truncated: true, limit: MAX_IMPORT_ROWS } : {}) },
      links: created.map((link) => ({ ...link, shortUrl: `${baseUrl}/${link.shortCode}` })),
      results: ordered,
    }
    const status = created.length ? 201 : 200
    if (idem && idemWorkspaceId) {
      await storeIdempotentResponse({ workspaceId: idemWorkspaceId, keyHash: idem.keyHash, requestHash: idem.requestHash, method: request.method, path: request.nextUrl.pathname, status, body: payload }).catch((e) => console.error('Idempotency store failed:', e))
    }
    return NextResponse.json(payload, { status })
  } catch (err) {
    console.error('Bulk import failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withIdempotencyCleanup(handlePost)
