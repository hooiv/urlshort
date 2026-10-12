CREATE TABLE "click_dimension_daily" (
    "urlId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "click_dimension_daily_pkey" PRIMARY KEY ("urlId","dateKey","dimension","key")
);
CREATE INDEX "click_dimension_daily_dimension_dateKey_idx" ON "click_dimension_daily"("dimension", "dateKey");
ALTER TABLE "click_dimension_daily" ADD CONSTRAINT "click_dimension_daily_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from retained raw human clicks (UTC day keys, matching click_daily).
INSERT INTO "click_dimension_daily" ("urlId","dateKey","dimension","key","clicks")
SELECT c."urlId", to_char(c."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD'), d.dimension, d.key, COUNT(*)::int
FROM "click_events" c
CROSS JOIN LATERAL (VALUES
  ('country', COALESCE(c."country",'unknown')),
  ('device', COALESCE(c."deviceType"::text,'unknown')),
  ('referrer', COALESCE(c."referrerHost",'unknown'))
) AS d(dimension, key)
WHERE c."trafficType" = 'human'
GROUP BY 1,2,3,4;
