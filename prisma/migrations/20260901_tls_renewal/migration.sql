ALTER TYPE "DomainProvisionStatus" ADD VALUE IF NOT EXISTS 'renewal_due';
ALTER TYPE "DomainProvisionStatus" ADD VALUE IF NOT EXISTS 'renewal_in_progress';
ALTER TABLE "domain_provisions" ADD COLUMN IF NOT EXISTS "certificateId" TEXT;
ALTER TABLE "domain_provisions" ADD COLUMN IF NOT EXISTS "renewalAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "domain_provisions" ADD COLUMN IF NOT EXISTS "nextRenewalAt" TIMESTAMP(3);
