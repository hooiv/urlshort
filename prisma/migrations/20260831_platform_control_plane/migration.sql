-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "OptimizationObjective" AS ENUM ('conversion_rate', 'revenue_per_click', 'revenue', 'conversion_value');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('draft', 'running', 'paused', 'completed', 'promoted');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'published', 'rolled_back');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "SsoProviderType" AS ENUM ('saml');

-- CreateEnum
CREATE TYPE "DomainProvisionStatus" AS ENUM ('requested', 'verifying', 'provisioning', 'active', 'failed', 'disabled');

-- CreateEnum
CREATE TYPE "UsageMetric" AS ENUM ('clicks', 'conversions', 'api_requests', 'webhook_deliveries', 'active_links', 'storage_bytes');

-- CreateEnum
CREATE TYPE "AnomalyType" AS ENUM ('traffic_spike', 'traffic_drop', 'destination_latency', 'destination_error_rate', 'conversion_drop', 'conversion_spike');

-- CreateEnum
CREATE TYPE "AnomalySeverity" AS ENUM ('info', 'warning', 'critical');

-- AlterTable
ALTER TABLE "click_events" ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmTerm" TEXT;

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "objective" "OptimizationObjective" NOT NULL DEFAULT 'conversion_rate',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "autoOptimize" BOOLEAN NOT NULL DEFAULT false,
    "confidenceThreshold" INTEGER NOT NULL DEFAULT 95,
    "minSampleSize" INTEGER NOT NULL DEFAULT 100,
    "minConversions" INTEGER NOT NULL DEFAULT 10,
    "maxTrafficShiftPercent" INTEGER NOT NULL DEFAULT 20,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "primaryUrlId" TEXT,
    "currentExperimentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_variants" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "isControl" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "valueCents" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_links" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "urlId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_experiments" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'draft',
    "objective" "OptimizationObjective" NOT NULL,
    "controlVariantId" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "promotedVariantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_snapshots" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "configJson" TEXT NOT NULL,
    "statsJson" TEXT NOT NULL,
    "decisionJson" TEXT,
    "contentHash" TEXT NOT NULL,
    "previousHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_decisions" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "experimentId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "confidenceBps" INTEGER,
    "oldWeightsJson" TEXT,
    "newWeightsJson" TEXT,
    "actorType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_releases" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'draft',
    "configJson" TEXT NOT NULL,
    "configHash" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_release_approvals" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "campaign_release_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_config_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "previousHash" TEXT,
    "signature" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_config_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_anomalies" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "type" "AnomalyType" NOT NULL,
    "severity" "AnomalySeverity" NOT NULL,
    "metric" TEXT NOT NULL,
    "baseline" DOUBLE PRECISION NOT NULL,
    "observed" DOUBLE PRECISION NOT NULL,
    "deviation" DOUBLE PRECISION NOT NULL,
    "detailsJson" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_policies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'global',
    "retentionDays" INTEGER NOT NULL DEFAULT 90,
    "hashIp" BOOLEAN NOT NULL DEFAULT true,
    "hashVisitor" BOOLEAN NOT NULL DEFAULT true,
    "storeUserAgent" BOOLEAN NOT NULL DEFAULT false,
    "storeReferrer" BOOLEAN NOT NULL DEFAULT true,
    "aggregateOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privacy_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_quotas" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clicksPerMonth" BIGINT NOT NULL DEFAULT 100000,
    "apiRequestsPerMonth" BIGINT NOT NULL DEFAULT 10000,
    "conversionsPerMonth" BIGINT NOT NULL DEFAULT 10000,
    "webhookDeliveriesPerMonth" BIGINT NOT NULL DEFAULT 10000,
    "activeLinks" INTEGER NOT NULL DEFAULT 1000,
    "storageBytes" BIGINT NOT NULL DEFAULT 1073741824,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_buckets" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "metric" "UsageMetric" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "quantity" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sso_connections" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "SsoProviderType" NOT NULL DEFAULT 'saml',
    "name" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "idpEntityId" TEXT NOT NULL,
    "ssoUrl" TEXT NOT NULL,
    "x509Certificate" TEXT NOT NULL,
    "emailAttribute" TEXT NOT NULL DEFAULT 'email',
    "nameAttribute" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sso_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scim_tokens" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scim_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scim_identities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scim_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_provisions" (
    "id" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "status" "DomainProvisionStatus" NOT NULL DEFAULT 'requested',
    "verificationMethod" TEXT NOT NULL DEFAULT 'dns_txt',
    "verificationValue" TEXT NOT NULL,
    "dnsTarget" TEXT,
    "certificateProvider" TEXT,
    "lastError" TEXT,
    "checkedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_provisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deep_link_apps" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "packageName" TEXT,
    "bundleId" TEXT,
    "appleTeamId" TEXT,
    "androidSha256" TEXT,
    "iosAssociatedDomainsJson" TEXT,
    "androidAssetLinksJson" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deep_link_apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseJson" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_workspaceId_status_idx" ON "campaigns"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "campaigns_status_startAt_idx" ON "campaigns"("status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_workspaceId_slug_key" ON "campaigns"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "campaign_variants_campaignId_enabled_idx" ON "campaign_variants"("campaignId", "enabled");

-- CreateIndex
CREATE INDEX "campaign_links_urlId_idx" ON "campaign_links"("urlId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_links_campaignId_urlId_key" ON "campaign_links"("campaignId", "urlId");

-- CreateIndex
CREATE INDEX "campaign_experiments_campaignId_status_idx" ON "campaign_experiments"("campaignId", "status");

-- CreateIndex
CREATE INDEX "experiment_snapshots_experimentId_createdAt_idx" ON "experiment_snapshots"("experimentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_snapshots_experimentId_sequence_key" ON "experiment_snapshots"("experimentId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_snapshots_experimentId_contentHash_key" ON "experiment_snapshots"("experimentId", "contentHash");

-- CreateIndex
CREATE INDEX "campaign_decisions_campaignId_createdAt_idx" ON "campaign_decisions"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "campaign_releases_status_scheduledAt_idx" ON "campaign_releases"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_releases_campaignId_version_key" ON "campaign_releases"("campaignId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_release_approvals_releaseId_reviewerUserId_key" ON "campaign_release_approvals"("releaseId", "reviewerUserId");

-- CreateIndex
CREATE INDEX "routing_config_snapshots_workspaceId_publishedAt_idx" ON "routing_config_snapshots"("workspaceId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "routing_config_snapshots_workspaceId_version_key" ON "routing_config_snapshots"("workspaceId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "routing_config_snapshots_workspaceId_contentHash_key" ON "routing_config_snapshots"("workspaceId", "contentHash");

-- CreateIndex
CREATE INDEX "campaign_anomalies_campaignId_resolvedAt_createdAt_idx" ON "campaign_anomalies"("campaignId", "resolvedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "privacy_policies_workspaceId_key" ON "privacy_policies"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_quotas_workspaceId_key" ON "tenant_quotas"("workspaceId");

-- CreateIndex
CREATE INDEX "usage_buckets_workspaceId_periodKey_idx" ON "usage_buckets"("workspaceId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "usage_buckets_workspaceId_metric_periodKey_key" ON "usage_buckets"("workspaceId", "metric", "periodKey");

-- CreateIndex
CREATE INDEX "sso_connections_workspaceId_enabled_idx" ON "sso_connections"("workspaceId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "sso_connections_workspaceId_name_key" ON "sso_connections"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "scim_tokens_tokenHash_key" ON "scim_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "scim_tokens_workspaceId_revokedAt_idx" ON "scim_tokens"("workspaceId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "scim_identities_workspaceId_externalId_key" ON "scim_identities"("workspaceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "scim_identities_workspaceId_userId_key" ON "scim_identities"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "domain_provisions_domainId_key" ON "domain_provisions"("domainId");

-- CreateIndex
CREATE INDEX "deep_link_apps_workspaceId_enabled_idx" ON "deep_link_apps"("workspaceId", "enabled");

-- CreateIndex
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_workspaceId_keyHash_key" ON "idempotency_keys"("workspaceId", "keyHash");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_primaryUrlId_fkey" FOREIGN KEY ("primaryUrlId") REFERENCES "urls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_variants" ADD CONSTRAINT "campaign_variants_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_links" ADD CONSTRAINT "campaign_links_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_links" ADD CONSTRAINT "campaign_links_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_experiments" ADD CONSTRAINT "campaign_experiments_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_snapshots" ADD CONSTRAINT "experiment_snapshots_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "campaign_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_decisions" ADD CONSTRAINT "campaign_decisions_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_releases" ADD CONSTRAINT "campaign_releases_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_release_approvals" ADD CONSTRAINT "campaign_release_approvals_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "campaign_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_config_snapshots" ADD CONSTRAINT "routing_config_snapshots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_anomalies" ADD CONSTRAINT "campaign_anomalies_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_policies" ADD CONSTRAINT "privacy_policies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_quotas" ADD CONSTRAINT "tenant_quotas_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_buckets" ADD CONSTRAINT "usage_buckets_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sso_connections" ADD CONSTRAINT "sso_connections_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scim_tokens" ADD CONSTRAINT "scim_tokens_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scim_identities" ADD CONSTRAINT "scim_identities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_provisions" ADD CONSTRAINT "domain_provisions_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "branded_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deep_link_apps" ADD CONSTRAINT "deep_link_apps_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

