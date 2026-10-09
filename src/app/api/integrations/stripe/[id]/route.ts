import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { isValidStripeSigningSecret } from '@/lib/stripe-attribution'
import { integrationSelect, presentIntegration, stripeIntegrationUpdateSchema } from '@/lib/stripe-integrations'

async function ownedIntegration(request: NextRequest, id: string) {
  const user = await getCurrentUser(request)
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const row = await prisma.stripeIntegration.findUnique({ where: { id }, select: { id: true, userId: true } })
  if (!row || row.userId !== user.id) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { row }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const owned = await ownedIntegration(request, id)
    if (owned.error) return owned.error
    const parsed = stripeIntegrationUpdateSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
    // Rolling the secret in Stripe: paste the new whsec_ here.
    if (parsed.data.signingSecret !== undefined && !isValidStripeSigningSecret(parsed.data.signingSecret)) {
      return NextResponse.json({ error: 'signingSecret must start with whsec_' }, { status: 400 })
    }
    const current = await prisma.stripeIntegration.findUnique({ where: { id }, select: { signingSecret: true } })
    if (parsed.data.isActive === true && !parsed.data.signingSecret && !current?.signingSecret) {
      return NextResponse.json({ error: 'Add the Stripe signing secret before activating' }, { status: 400 })
    }
    // Setting the secret for the first time activates the integration.
    const data = { ...parsed.data, ...(parsed.data.signingSecret && !current?.signingSecret && parsed.data.isActive === undefined ? { isActive: true } : {}) }
    const row = await prisma.stripeIntegration.update({ where: { id }, data, select: integrationSelect })
    return NextResponse.json(presentIntegration(row))
  } catch (error) {
    console.error('Update Stripe integration failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const owned = await ownedIntegration(request, id)
    if (owned.error) return owned.error
    // Recorded conversions stay; only receipts and customer mappings cascade.
    await prisma.stripeIntegration.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete Stripe integration failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
