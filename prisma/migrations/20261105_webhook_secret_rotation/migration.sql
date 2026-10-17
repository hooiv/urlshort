ALTER TABLE "webhook_endpoints" ADD COLUMN "previousSecret" TEXT, ADD COLUMN "previousSecretExpiresAt" TIMESTAMP(3), ADD COLUMN "secretRotatedAt" TIMESTAMP(3);
