import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Singleton Prisma client tuned for serverless Postgres (Neon):
 * - `connection_limit` keeps the pool small so many serverless instances
 *   don't exhaust Postgres connections (Neon's pooled endpoint is also used
 *   via DATABASE_URL).
 * - `pool_timeout` fails fast instead of queueing requests indefinitely.
 */
function createClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
