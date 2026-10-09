-- Folder-scoped webhook endpoints (linkScope = 'folders').
ALTER TABLE "webhook_endpoints" ADD COLUMN "folderIdFilter" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "webhook_endpoints" DROP CONSTRAINT "webhook_endpoints_linkScope_check";
ALTER TABLE "webhook_endpoints"
  ADD CONSTRAINT "webhook_endpoints_linkScope_check" CHECK ("linkScope" IN ('all', 'tags', 'links', 'folders'));

-- Rows that somehow carry both owners become personal endpoints: narrowing
-- is safe, silently promoting one to fire for a whole workspace is not.
UPDATE "webhook_endpoints" SET "workspaceId" = NULL WHERE "workspaceId" IS NOT NULL AND "userId" IS NOT NULL;

-- An endpoint belongs to a workspace or to a user, never both: fan-out routes
-- workspace endpoints by workspace only, so a lingering userId would be dead data.
ALTER TABLE "webhook_endpoints"
  ADD CONSTRAINT "webhook_endpoints_single_owner_check" CHECK ("workspaceId" IS NULL OR "userId" IS NULL);
