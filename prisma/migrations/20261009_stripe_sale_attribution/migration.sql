-- Stripe sale attribution: connected accounts, idempotent event receipts, and
-- customer -> acquiring-click mapping for recurring revenue.
-- CreateTable
CREATE TABLE "stripe_integrations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Stripe',
    "signingSecret" TEXT NOT NULL,
    "goalEventKey" TEXT NOT NULL DEFAULT 'purchase',
    "trackRecurring" BOOLEAN NOT NULL DEFAULT true,
    "livemode" BOOLEAN,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stripe_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_event_receipts" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "conversionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_event_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_customer_attributions" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "urlId" TEXT NOT NULL,
    "clickEventId" TEXT,
    "visitorIdHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_customer_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stripe_integrations_userId_idx" ON "stripe_integrations"("userId");

-- CreateIndex
CREATE INDEX "stripe_event_receipts_integrationId_createdAt_idx" ON "stripe_event_receipts"("integrationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_event_receipts_integrationId_stripeEventId_key" ON "stripe_event_receipts"("integrationId", "stripeEventId");

-- CreateIndex
CREATE INDEX "stripe_customer_attributions_urlId_idx" ON "stripe_customer_attributions"("urlId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_customer_attributions_integrationId_stripeCustomerId_key" ON "stripe_customer_attributions"("integrationId", "stripeCustomerId");

-- AddForeignKey
ALTER TABLE "stripe_integrations" ADD CONSTRAINT "stripe_integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_event_receipts" ADD CONSTRAINT "stripe_event_receipts_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "stripe_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_customer_attributions" ADD CONSTRAINT "stripe_customer_attributions_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "stripe_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stripe_customer_attributions" ADD CONSTRAINT "stripe_customer_attributions_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

