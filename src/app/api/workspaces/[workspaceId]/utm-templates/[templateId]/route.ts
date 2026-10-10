import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getWorkspaceMembership, EDIT_ROLES } from '@/lib/workspaces'
import { recordAudit } from '@/lib/audit'
import { normalizeUtmTemplateName, normalizeUtmValues, UTM_KEYS } from '@/lib/utm-templates'

type Ctx = { params: Promise<{ workspaceId: string; templateId: string }> }

const UpdateTemplate = z.object({
  name: z.string().max(200).optional(),
  source: z.string().max(200).nullable().optional(),
  medium: z.string().max(200).nullable().optional(),
  campaign: z.string().max(200).nullable().optional(),
  term: z.string().max(200).nullable().optional(),
  content: z.string().max(200).nullable().optional(),
})

async function load(request: NextRequest, ctx: Ctx) {
  const { workspaceId, templateId } = await ctx.params
  const membership = await getWorkspaceMembership(request, workspaceId)
  if (!membership) return { error: NextResponse.json({ error: 'Workspace not found' }, { status: 404 }) }
  if (!EDIT_ROLES.includes(membership.role)) return { error: NextResponse.json({ error: 'Editor permission is required' }, { status: 403 }) }
  const template = await prisma.utmTemplate.findFirst({ where: { id: templateId, workspaceId } })
  if (!template) return { error: NextResponse.json({ error: 'Template not found' }, { status: 404 }) }
  return { template, workspaceId }
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const loaded = await load(request, ctx)
  if ('error' in loaded) return loaded.error
  const parsed = UpdateTemplate.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Invalid update' }, { status: 400 })
  try {
    const merged = { ...Object.fromEntries(UTM_KEYS.map((k) => [k, loaded.template[k]])), ...Object.fromEntries(UTM_KEYS.filter((k) => parsed.data[k] !== undefined).map((k) => [k, parsed.data[k]])) }
    const values = normalizeUtmValues(merged)
    const name = parsed.data.name !== undefined ? normalizeUtmTemplateName(parsed.data.name) : loaded.template.name
    const updated = await prisma.utmTemplate.update({ where: { id: loaded.template.id }, data: { name, ...values } })
    await recordAudit(request, { action: 'utm_template.update', urlId: null, resourceType: 'utm_template', resourceId: updated.id, after: { workspaceId: loaded.workspaceId, name } })
    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return NextResponse.json({ error: 'A template with that name already exists' }, { status: 409 })
    if (error instanceof Error && !(error instanceof Prisma.PrismaClientKnownRequestError)) return NextResponse.json({ error: error.message }, { status: 400 })
    throw error
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const loaded = await load(request, ctx)
  if ('error' in loaded) return loaded.error
  await prisma.utmTemplate.delete({ where: { id: loaded.template.id } })
  await recordAudit(request, { action: 'utm_template.delete', urlId: null, resourceType: 'utm_template', resourceId: loaded.template.id, before: { workspaceId: loaded.workspaceId, name: loaded.template.name } })
  return NextResponse.json({ deleted: true })
}
