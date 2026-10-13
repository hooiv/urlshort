ALTER TABLE "urls" ADD COLUMN "pinnedAt" TIMESTAMP(3);
CREATE INDEX "urls_userId_pinnedAt_idx" ON "urls"("userId", "pinnedAt");
