import { prisma } from './prisma'
import { createVerificationToken } from './domains'

export class DomainOwnershipError extends Error {}

/**
 * Registers `host` for verification under the link `urlId` (or returns the
 * existing registration it already owns) and makes sure a provisioning row
 * exists so the domains cron keeps checking it.
 */
export async function registerDomain(urlId: string, host: string) {
  const existing = await prisma.brandedDomain.findUnique({ where: { host } })
  if (existing?.ownerUrlId && existing.ownerUrlId !== urlId) throw new DomainOwnershipError('This domain is already owned by another link account')
  const domain = existing || await prisma.brandedDomain.create({ data: { host, ownerUrlId: urlId, verificationToken: createVerificationToken() } })
  await prisma.domainProvision.upsert({
    where: { domainId: domain.id },
    create: { domainId: domain.id, verificationValue: domain.verificationToken, status: 'requested' },
    update: { status: domain.status === 'verified' ? 'provisioning' : 'verifying' },
  })
  return domain
}
