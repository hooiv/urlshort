ALTER TABLE "deep_link_apps" ADD COLUMN IF NOT EXISTS "environment" TEXT NOT NULL DEFAULT 'production';
ALTER TABLE "deep_link_apps" ADD COLUMN IF NOT EXISTS "appVersion" TEXT;
ALTER TABLE "deep_link_apps" ADD COLUMN IF NOT EXISTS "minimumAppVersion" TEXT;
ALTER TABLE "deep_link_apps" ADD COLUMN IF NOT EXISTS "resolverEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "deep_link_apps" ADD COLUMN IF NOT EXISTS "iosResolverScheme" TEXT;
ALTER TABLE "deep_link_apps" ADD COLUMN IF NOT EXISTS "androidResolverScheme" TEXT;
CREATE INDEX IF NOT EXISTS "deep_link_apps_workspaceId_environment_enabled_idx" ON "deep_link_apps"("workspaceId", "environment", "enabled");
