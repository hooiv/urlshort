import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SOAK_DATABASE_URL

// This suite deliberately requires an explicitly supplied disposable/test DB.
// The repository's .env points at the production Neon project, so silently using
// DATABASE_URL here would make an adversarial soak mutate production data.
describe('real database production soak', () => {
  it.skipIf(!databaseUrl)('atomically enforces quota under cross-worker contention', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { reserveUsage } = await import('./tenant-usage')
    const slug = `soak-quota-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const workspace = await db.workspace.create({ data: { name: slug, slug } })
    try {
      await db.tenantQuota.create({ data: { workspaceId: workspace.id, clicksPerMonth: 37n } })
      const results = await Promise.all(Array.from({ length: 128 }, () => reserveUsage(workspace.id, 'clicks')))
      expect(results.filter(x => x.allowed)).toHaveLength(37)
      const bucket = await db.usageBucket.findUnique({ where: { workspaceId_metric_periodKey: { workspaceId: workspace.id, metric: 'clicks', periodKey: new Date().toISOString().slice(0, 7) } } })
      expect(bucket?.quantity).toBe(37n)
    } finally {
      await db.workspace.delete({ where: { id: workspace.id } })
      await db.$disconnect()
    }
  }, 60000)

  it.skipIf(!databaseUrl)('serializes real DB autopilot workers and commits one decision', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    process.env.QL_ATTRIBUTION_SECRET = process.env.QL_ATTRIBUTION_SECRET || 'soak-secret-at-least-32-characters-long'
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
    const { runCampaignAutopilot } = await import('./campaigns')
    const slug = `soak-auto-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const workspace = await db.workspace.create({ data: { name: slug, slug } })
    try {
      const campaign = await db.campaign.create({ data: {
        workspaceId: workspace.id, name: slug, slug, status: 'running', autoOptimize: true,
        confidenceThreshold: 95, minSampleSize: 100, minConversions: 10, maxTrafficShiftPercent: 20,
        objective: 'conversion_rate',
      } })
      const control = await db.campaignVariant.create({ data: { campaignId: campaign.id, name: 'control', destinationUrl: 'https://example.com/a', isControl: true, weight: 50, clicks: 1000, conversions: 100 } })
      const winner = await db.campaignVariant.create({ data: { campaignId: campaign.id, name: 'winner', destinationUrl: 'https://example.com/b', isControl: false, weight: 50, clicks: 1000, conversions: 300 } })
      const experiment = await db.campaignExperiment.create({ data: { campaignId: campaign.id, status: 'running', objective: 'conversion_rate', controlVariantId: control.id } })
      await db.campaign.update({ where: { id: campaign.id }, data: { currentExperimentId: experiment.id } })

      const results = await Promise.all(Array.from({ length: 32 }, () => runCampaignAutopilot(campaign.id)))
      expect(results.filter(x => x.action === 'shift_traffic')).toHaveLength(1)
      expect(results.filter(x => x.action === 'concurrent' || x.action === 'cooldown')).toHaveLength(31)

      const [freshCampaign, freshExperiment, variants, decisions, snapshots, routing] = await Promise.all([
        db.campaign.findUnique({ where: { id: campaign.id } }),
        db.campaignExperiment.findUnique({ where: { id: experiment.id } }),
        db.campaignVariant.findMany({ where: { campaignId: campaign.id }, orderBy: { name: 'asc' } }),
        db.campaignDecision.findMany({ where: { campaignId: campaign.id } }),
        db.experimentSnapshot.findMany({ where: { experimentId: experiment.id } }),
        db.routingConfigSnapshot.findMany({ where: { workspaceId: workspace.id } }),
      ])
      expect(freshCampaign?.version).toBe(2)
      expect(freshExperiment?.lookCount).toBe(1)
      expect(decisions).toHaveLength(1)
      expect(snapshots).toHaveLength(1)
      expect(variants.find(v => v.id === control.id)?.weight).toBe(30)
      expect(variants.find(v => v.id === winner.id)?.weight).toBe(70)
      expect(routing).toHaveLength(1)
    } finally {
      await db.workspace.delete({ where: { id: workspace.id } })
      await db.$disconnect()
    }
  }, 60000)

  it.skipIf(!databaseUrl)('reclaims a live webhook lease left by a dead worker and prevents stale finalization', async () => {
    process.env.DATABASE_URL = databaseUrl
    process.env.DIRECT_DATABASE_URL = databaseUrl
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } })
    const slug = `soak-webhook-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const workspace = await db.workspace.create({ data: { name: slug, slug } })
    try {
      const endpoint = await db.webhookEndpoint.create({ data: { workspaceId: workspace.id, url: 'https://example.com/', secret: 'live-soak-webhook-secret', events: ['click'] } })
      const delivery = await db.webhookDelivery.create({ data: { endpointId: endpoint.id, event: 'click', payload: JSON.stringify({ probe: slug }), status: 'pending', attempts: 1, leaseToken: 'dead-worker-token', leaseUntil: new Date(Date.now() - 1000), nextAttemptAt: new Date(Date.now() - 1000) } })
      const { processWebhookDelivery } = await import('./webhooks')
      const result = await processWebhookDelivery(delivery.id)
      expect(result.attempted).toBe(true)
      const fresh = await db.webhookDelivery.findUnique({ where: { id: delivery.id } })
      expect(fresh?.attempts).toBe(2)
      expect(fresh?.leaseToken).toBeNull()
      expect(fresh?.leaseUntil).toBeNull()
      expect(fresh?.status).toMatch(/pending|success|failed/)
    } finally {
      await db.workspace.delete({ where: { id: workspace.id } })
      await db.$disconnect()
    }
  }, 30000)

})
