CREATE TABLE IF NOT EXISTS "usage_alerts" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "metric" "UsageMetric" NOT NULL,
  "periodKey" TEXT NOT NULL,
  "threshold" INTEGER NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_alerts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "usage_alerts_workspaceId_metric_periodKey_threshold_key" ON "usage_alerts"("workspaceId", "metric", "periodKey", "threshold");
DO $$ BEGIN
  ALTER TABLE "usage_alerts" ADD CONSTRAINT "usage_alerts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
