ALTER TABLE "webhook_endpoints" ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMP(3);
ALTER TABLE "webhook_endpoints" ADD COLUMN IF NOT EXISTS "disabledReason" TEXT;
