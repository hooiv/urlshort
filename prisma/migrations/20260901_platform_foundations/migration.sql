ALTER TABLE "privacy_policies" ADD COLUMN IF NOT EXISTS "analyticsConsentRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "privacy_policies" ADD COLUMN IF NOT EXISTS "dataResidency" TEXT NOT NULL DEFAULT 'global';
ALTER TABLE "privacy_policies" ADD COLUMN IF NOT EXISTS "auditRetentionDays" INTEGER NOT NULL DEFAULT 365;
ALTER TABLE "privacy_policies" ADD COLUMN IF NOT EXISTS "deletionGraceDays" INTEGER NOT NULL DEFAULT 7;

CREATE TABLE IF NOT EXISTS "feature_flags" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "rolloutPercent" INTEGER NOT NULL DEFAULT 100,
  "configJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "feature_flags_workspaceId_key_key" ON "feature_flags"("workspaceId","key");
CREATE INDEX IF NOT EXISTS "feature_flags_workspaceId_enabled_idx" ON "feature_flags"("workspaceId","enabled");
DO $$ BEGIN
  ALTER TABLE "feature_flags" ADD CONSTRAINT "feature_flags_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "data_deletion_requests" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "reason" TEXT,
  CONSTRAINT "data_deletion_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "data_deletion_requests_status_scheduledFor_idx" ON "data_deletion_requests"("status","scheduledFor");
CREATE INDEX IF NOT EXISTS "data_deletion_requests_userId_requestedAt_idx" ON "data_deletion_requests"("userId","requestedAt");
DO $$ BEGIN
  ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;