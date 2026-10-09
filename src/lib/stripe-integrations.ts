import { z } from 'zod'
import { getBaseUrl } from './utils'

export const MAX_INTEGRATIONS_PER_USER = 10

export const stripeIntegrationCreateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  /** Optional: Stripe only reveals it after the endpoint URL (which needs our id) is added. */
  signingSecret: z.string().trim().optional(),
  goalEventKey: z.string().trim().regex(/^[a-z0-9_]{1,64}$/, 'Goal key may contain lowercase letters, numbers, and underscores only').optional(),
  trackRecurring: z.boolean().optional(),
})

export function stripeWebhookUrl(id: string): string {
  return `${getBaseUrl()}/api/integrations/stripe/${id}/webhook`
}

type IntegrationRow = { id: string; signingSecret: string; name: string; goalEventKey: string; trackRecurring: boolean; livemode: boolean | null; isActive: boolean; lastEventAt: Date | null; createdAt: Date; updatedAt: Date }

/** Never echoes the signing secret back, not even at creation: the user already holds it. */
export function presentIntegration(row: IntegrationRow) {
  return {
    id: row.id,
    name: row.name,
    goalEventKey: row.goalEventKey,
    trackRecurring: row.trackRecurring,
    livemode: row.livemode,
    isActive: row.isActive,
    hasSigningSecret: row.signingSecret.length > 0,
    lastEventAt: row.lastEventAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    webhookUrl: stripeWebhookUrl(row.id),
    events: ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'invoice.paid', 'charge.refunded'],
  }
}

export const integrationSelect = { id: true, signingSecret: true, name: true, goalEventKey: true, trackRecurring: true, livemode: true, isActive: true, lastEventAt: true, createdAt: true, updatedAt: true } as const

export const stripeIntegrationUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  signingSecret: z.string().trim().optional(),
  goalEventKey: z.string().trim().regex(/^[a-z0-9_]{1,64}$/, 'Goal key may contain lowercase letters, numbers, and underscores only').optional(),
  trackRecurring: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict()
