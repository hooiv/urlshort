ALTER TABLE "users" ADD COLUMN "milestoneAlerts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "urls" ADD COLUMN "milestoneReached" INTEGER NOT NULL DEFAULT 0;
-- Backfill so enabling alerts never floods owners about milestones passed long ago.
UPDATE "urls" SET "milestoneReached" = CASE
  WHEN "clicks" >= 1000000 THEN 1000000
  WHEN "clicks" >= 100000 THEN 100000
  WHEN "clicks" >= 10000 THEN 10000
  WHEN "clicks" >= 1000 THEN 1000
  WHEN "clicks" >= 100 THEN 100
  ELSE 0 END;
