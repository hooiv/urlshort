ALTER TABLE "privacy_policies" ADD COLUMN "analyticsExclusions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
