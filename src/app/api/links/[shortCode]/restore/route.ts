import { NextRequest, NextResponse } from 'next/server'
import { getManageableUrl } from '@/lib/authorization'
import { restoreLink, TRASH_RETENTION_DAYS } from '@/lib/link-trash'
import { recordAudit } from '@/lib/audit'

/** POST /api/links/:code/restore — undo a delete within the retention window. Needs links:write or an edit role. */
export async function POST(request: NextRequest, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params
  const access = await getManageableUrl(request, shortCode, undefined, { includeTrashed: true })
  if (!access.url) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!access.url.deletedAt) return NextResponse.json({ error: 'Link is not in the trash' }, { status: 409 })
  if (!(await restoreLink(access.url))) {
    return NextResponse.json({ error: `Retention window of ${TRASH_RETENTION_DAYS} days has passed` }, { status: 410 })
  }
  await recordAudit(request, { action: 'link.restore', urlId: access.url.id, resourceType: 'url', resourceId: access.url.id, after: { shortCode: access.url.shortCode } })
  return NextResponse.json({ restored: true, shortCode: access.url.shortCode })
}
