ALTER TABLE "urls" ADD COLUMN IF NOT EXISTS "clicksReserved" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  CREATE TYPE "TrafficType" AS ENUM ('human', 'ai_agent', 'bot');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "link_rules" ADD COLUMN IF NOT EXISTS "trafficType" "TrafficType";
ALTER TABLE "link_rules" ADD COLUMN IF NOT EXISTS "aiAgent" TEXT;
ALTER TABLE "link_rules" ADD COLUMN IF NOT EXISTS "os" TEXT;
ALTER TABLE "link_rules" ADD COLUMN IF NOT EXISTS "languageCodes" TEXT;

ALTER TABLE "click_events" ADD COLUMN IF NOT EXISTS "trafficType" "TrafficType" NOT NULL DEFAULT 'human';
ALTER TABLE "click_events" ADD COLUMN IF NOT EXISTS "aiAgent" TEXT;
ALTER TABLE "click_events" ADD COLUMN IF NOT EXISTS "os" TEXT;
ALTER TABLE "click_events" ADD COLUMN IF NOT EXISTS "browser" TEXT;
ALTER TABLE "click_events" ADD COLUMN IF NOT EXISTS "language" TEXT;

CREATE INDEX IF NOT EXISTS "link_rules_urlId_trafficType_idx" ON "link_rules"("urlId", "trafficType");
CREATE INDEX IF NOT EXISTS "click_events_urlId_trafficType_createdAt_idx" ON "click_events"("urlId", "trafficType", "createdAt");
