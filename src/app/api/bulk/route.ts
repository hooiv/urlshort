import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { generateShortCode, normalizeUrl, isValidUrl, isReservedCode } from '@/lib/utils'
import { assertDestinationSafeForStorage } from '@/lib/destination-health'

export const bulkCsvSchema = z.object({
  csv: z.string().min(1, { message: 'Invalid CSV' }).max(500_000, { message: 'CSV payload is too large' }),
})

const BULK_ALIAS = /^[A-Za-z0-9_-]{3,64}$/

export function normalizeBulkTags(input: string): string[] {
  return [
    ...new Set(
      input
        .split(';')
        .map((t) => t.trim().toLowerCase().slice(0, 32))
        .filter((t) => /^[a-z0-9][a-z0-9-_ ]{0,31}$/.test(t)),
    ),
  ].slice(0, 10)
}

export function resolveBulkShortCode(raw: string | undefined): string {
  const candidate = (raw || '').trim()
  if (candidate && BULK_ALIAS.test(candidate) && !isReservedCode(candidate)) return candidate
  return generateShortCode()
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const limit = await rateLimit(request, { name: 'bulk-create', limit: 5, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

    const parsedBody = bulkCsvSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsedBody.success) return NextResponse.json({ error: parsedBody.error.issues[0]?.message || 'Invalid CSV' }, { status: 400 })
    const { csv } = parsedBody.data

    const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length < 2) return NextResponse.json({ error: 'CSV must contain a header and at least one row' }, { status: 400 })
    if (lines.length > 501) return NextResponse.json({ error: 'Max 500 links per bulk import' }, { status: 400 })

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
    const urlIdx = headers.indexOf('originalurl')
    if (urlIdx === -1) return NextResponse.json({ error: 'Missing originalUrl column' }, { status: 400 })
    const titleIdx = headers.indexOf('title')
    const customAliasIdx = headers.indexOf('customalias')
    const tagsIdx = headers.indexOf('tags')

    const createdLinks = []
    
    // Process rows sequentially to avoid database lock contention on bulk inserts
    for (let i = 1; i < lines.length; i++) {
      // Very basic CSV split that ignores commas inside quotes (this is a simplified parser)
      const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)?.map(s => s.replace(/(^"|"$)/g, '').trim()) || []
      const originalUrl = row[urlIdx]
      if (!originalUrl) continue
      
      let parsedUrl: string
      try {
        if (!isValidUrl(originalUrl)) continue
        parsedUrl = normalizeUrl(originalUrl)
        // SSRF guard: parity with single-create — reject private/link-local targets.
        await assertDestinationSafeForStorage(parsedUrl)
      } catch { continue }

      const title = titleIdx !== -1 && row[titleIdx] ? row[titleIdx].trim().slice(0, 200) : null
      const requestedAlias = customAliasIdx !== -1 ? row[customAliasIdx] : undefined
      let shortCode = resolveBulkShortCode(requestedAlias)
      const tagsStr = tagsIdx !== -1 && row[tagsIdx] ? row[tagsIdx] : ''
      const tags = tagsStr ? normalizeBulkTags(tagsStr) : []

      // In a real app we'd handle custom alias collisions, but for this bulk importer we'll retry with random code if collision
      try {
        const link = await prisma.url.create({
          data: {
            originalUrl: parsedUrl,
            shortCode,
            title,
            tags,
            userId: user.id
          }
        })
        createdLinks.push(link)
      } catch {
        // Fallback to random if custom code taken; never throw per-row errors.
        if (customAliasIdx !== -1 && row[customAliasIdx]) {
           shortCode = generateShortCode()
           try {
             const link = await prisma.url.create({
               data: {
                 originalUrl: parsedUrl,
                 shortCode,
                 title,
                 tags,
                 userId: user.id
               }
             })
             createdLinks.push(link)
           } catch { continue }
        }
      }
    }

    return NextResponse.json({ links: createdLinks })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
