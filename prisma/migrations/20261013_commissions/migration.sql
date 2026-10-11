-- CreateTable
CREATE TABLE "reward_configs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "urlId" TEXT,
    "rules" TEXT NOT NULL DEFAULT '[]',
    "fallback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "urlId" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "saleValueCents" INTEGER NOT NULL,
    "originalCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "clawbackCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ruleId" TEXT,
    "scopeKey" TEXT,
    "holdUntil" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "payoutRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reward_configs_urlId_idx" ON "reward_configs"("urlId");

-- CreateIndex
CREATE UNIQUE INDEX "reward_configs_userId_scopeKey_key" ON "reward_configs"("userId", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_conversionId_key" ON "commissions"("conversionId");

-- CreateIndex
CREATE INDEX "commissions_userId_status_createdAt_idx" ON "commissions"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "commissions_urlId_createdAt_idx" ON "commissions"("urlId", "createdAt");

-- AddForeignKey
ALTER TABLE "reward_configs" ADD CONSTRAINT "reward_configs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_configs" ADD CONSTRAINT "reward_configs_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_urlId_fkey" FOREIGN KEY ("urlId") REFERENCES "urls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "conversion_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

