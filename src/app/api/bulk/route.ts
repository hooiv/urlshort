import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { generateShortCode, normalizeUrl, isValidUrl } from '@/lib/utils'

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })

    const limit = await rateLimit(request, { name: 'bulk-create', limit: 5, windowMs: 60_000 })
    if (!limit.allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

    const { csv } = await request.json()
    if (!csv || typeof csv !== 'string') return NextResponse.json({ error: 'Invalid CSV' }, { status: 400 })

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
      } catch { continue }

      const title = titleIdx !== -1 && row[titleIdx] ? row[titleIdx].slice(0, 200) : null
      let shortCode = customAliasIdx !== -1 && row[customAliasIdx] ? row[customAliasIdx].slice(0, 64) : generateShortCode()
      const tagsStr = tagsIdx !== -1 && row[tagsIdx] ? row[tagsIdx] : ''
      const tags = tagsStr ? tagsStr.split(';').map(t => t.trim()).filter(Boolean) : []

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
        // Fallback to random if custom code taken
        if (customAliasIdx !== -1 && row[customAliasIdx]) {
           shortCode = generateShortCode()
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
        }
      }
    }

    return NextResponse.json({ links: createdLinks })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
