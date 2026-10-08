-- Workspace/user-level webhook endpoints can now target a subset of links:
--   all   -> every link owned by the endpoint's workspace/user (previous behaviour)
--   tags  -> links carrying at least one of tagFilter
--   links -> links whose id is in urlIdFilter
ALTER TABLE "webhook_endpoints"
  ADD COLUMN "linkScope" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN "tagFilter" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "urlIdFilter" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "webhook_endpoints"
  ADD CONSTRAINT "webhook_endpoints_linkScope_check" CHECK ("linkScope" IN ('all', 'tags', 'links'));

-- Fan-out looks endpoints up by owner + event on every click batch.
CREATE INDEX "webhook_endpoints_workspaceId_isActive_idx" ON "webhook_endpoints"("workspaceId", "isActive");
CREATE INDEX "webhook_endpoints_userId_isActive_idx" ON "webhook_endpoints"("userId", "isActive");
