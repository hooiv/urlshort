-- Delivery log: per-attempt latency and manual redelivery lineage.
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "latencyMs" INTEGER;
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "replayOfId" TEXT;
CREATE INDEX IF NOT EXISTS "webhook_deliveries_endpointId_status_createdAt_idx" ON "webhook_deliveries"("endpointId", "status", "createdAt");
