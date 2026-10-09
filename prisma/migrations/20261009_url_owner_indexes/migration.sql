-- Owner-scoped listings/analytics had no index on urls.userId / urls.workspaceId,
-- and the btree on the tags array could not serve ANY()/has filters.
-- On very large tables, run these as CREATE INDEX CONCURRENTLY out of band first.
-- DropIndex
DROP INDEX "urls_tags_idx";

-- CreateIndex
CREATE INDEX "urls_tags_idx" ON "urls" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "urls_userId_createdAt_idx" ON "urls"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "urls_workspaceId_createdAt_idx" ON "urls"("workspaceId", "createdAt");

