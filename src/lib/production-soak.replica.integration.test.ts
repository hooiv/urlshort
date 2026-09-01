import { describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { execFileSync } from 'node:child_process'

const primaryUrl = process.env.SOAK_DATABASE_URL
const replicaUrl = process.env.SOAK_REPLICA_DATABASE_URL

describe('live PostgreSQL replica-loss and convergence soak', () => {
  it.skipIf(!primaryUrl || !replicaUrl)('replicates writes, survives replica loss, and converges after recovery', async () => {
    const primary = new PrismaClient({ datasources: { db: { url: primaryUrl! } } })
    let replica = new PrismaClient({ datasources: { db: { url: replicaUrl! } } })
    const marker = `replica-soak-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      const workspace = await primary.workspace.create({ data: { name: marker, slug: marker } })
      const first = await primary.routingConfigSnapshot.create({ data: {
        workspaceId: workspace.id,
        version: 1,
        payloadJson: JSON.stringify({ marker, version: 1 }),
        contentHash: marker,
        previousHash: null,
        signature: marker,
      } })
      for (let i = 0; i < 50; i++) {
        const seen = await replica.routingConfigSnapshot.findUnique({ where: { id: first.id } })
        if (seen) break
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      expect(await replica.routingConfigSnapshot.findUnique({ where: { id: first.id } })).not.toBeNull()

      const replicaPid = await primary.$queryRaw<Array<{ pid: number }>>`SELECT pid FROM pg_stat_replication WHERE client_addr = '127.0.0.1'::inet LIMIT 1`
      expect(replicaPid.length).toBeGreaterThanOrEqual(1)

      await primary.routingConfigSnapshot.create({ data: {
        workspaceId: workspace.id,
        version: 2,
        payloadJson: JSON.stringify({ marker, version: 2 }),
        contentHash: `${marker}-2`,
        previousHash: marker,
        signature: `${marker}-2`,
      } })
      const second = await primary.routingConfigSnapshot.findFirst({ where: { workspaceId: workspace.id, version: 2 } })
      expect(second).not.toBeNull()

      // Kill the physical standby for real. The primary must remain writable while
      // WAL accumulates, then the recovered standby must replay it to convergence.
      await replica.$disconnect()
      execFileSync('wsl.exe', ['-d', 'Ubuntu-26.04', '-u', 'root', '--', 'bash', '-lc', "su - postgres -c '/usr/lib/postgresql/18/bin/pg_ctl -D /tmp/pg-replica -m fast stop'"])
      await primary.routingConfigSnapshot.create({ data: {
        workspaceId: workspace.id,
        version: 3,
        payloadJson: JSON.stringify({ marker, version: 3 }),
        contentHash: `${marker}-3`,
        previousHash: `${marker}-2`,
        signature: `${marker}-3`,
      } })
      expect(await primary.routingConfigSnapshot.count({ where: { workspaceId: workspace.id } })).toBe(3)

      execFileSync('wsl.exe', ['-d', 'Ubuntu-26.04', '-u', 'root', '--', 'bash', '-lc', "su - postgres -c \"/usr/lib/postgresql/18/bin/postgres -D /tmp/pg-replica -c config_file=/tmp/pg-replica/postgresql.conf > /tmp/pg-replica/stdout.log 2>&1 &\""])
      replica = new PrismaClient({ datasources: { db: { url: replicaUrl! } } })
      let converged = false
      for (let i = 0; i < 100; i++) {
        const seen = await replica.routingConfigSnapshot.count({ where: { workspaceId: workspace.id } }).catch(() => 0)
        if (seen === 3) { converged = true; break }
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      expect(converged).toBe(true)
      await primary.workspace.delete({ where: { id: workspace.id } })
    } finally {
      await replica.$disconnect()
      await primary.$disconnect()
    }
  }, 60000)
})
