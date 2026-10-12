ALTER TABLE "urls" ADD COLUMN "publicStatsHash" TEXT;
ALTER TABLE "urls" ADD COLUMN "publicStatsEnabledAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "urls_publicStatsHash_key" ON "urls"("publicStatsHash");
