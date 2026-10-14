ALTER TABLE "urls" ADD COLUMN "queryForwardMode" TEXT NOT NULL DEFAULT 'all';
ALTER TABLE "urls" ADD COLUMN "queryForwardAllow" TEXT[] DEFAULT ARRAY[]::TEXT[];
