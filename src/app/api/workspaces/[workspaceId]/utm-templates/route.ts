import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getWorkspaceMembership, EDIT_ROLES } from '@/lib/workspaces'
import { LINK_READ_SCOPES } from '@/lib/request-actor'
import { recordAudit } from '@/lib/audit'
import { normalizeUtmTemplateName, normalizeUtmValues } from '@/lib/utm-templates'

export const MAX_UTM_TEMPLATES = 100

export const UtmFields = {
  source: z.string().max(200).nullable().optional(),
  medium: z.string().max(200).nullable().optional(),
  campaign: z.string().max(200).nullable().optional(),
  term: z.string().max(200).nullable().optional(),
  content: z.string().max(200).nullable().optional(),
}
const CreateTemplate = z.object({ name: z.string().max(200), ...UtmFields })

export async function GET(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const membership = await getWorkspaceMembership(request, workspaceId, { apiKeyScopes: LINK_READ_SCOPES })
  if (!membership) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  const templates = await prisma.utmTemplate.findMany({ where: { workspaceId }, orderBy: { name: 'asc' }, take: MAX_UTM_TEMPLATES })
  return NextResponse.json({ templates })
}

export async function POST(request: NextRequest, context: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await context.params
  const membership = await getWorkspaceMembership(request, workspaceId)
  if (!membership) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  if (!EDIT_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Editor permission is required' }, { status: 403 })
  const parsed = CreateTemplate.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid template' }, { status: 400 })
  let name: string
  let values: ReturnType<typeof normalizeUtmValues>
  try {
    name = normalizeUtmTemplateName(parsed.data.name)
    values = normalizeUtmValues(parsed.data)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
  if ((await prisma.utmTemplate.count({ where: { workspaceId } })) >= MAX_UTM_TEMPLATES) return NextResponse.json({ error: `A workspace can have at most ${MAX_UTM_TEMPLATES} UTM templates` }, { status: 409 })
  try {
    const template = await prisma.utmTemplate.create({ data: { workspaceId, name, ...values, createdById: membership.userId } })
    await recordAudit(request, { action: 'utm_template.create', urlId: null, resourceType: 'utm_template', resourceId: template.id, after: { workspaceId, name } })
    return NextResponse.json(template, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'A template with that name already exists' }, { status: 409 })
    throw error
  }
}
