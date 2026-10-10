-- Per-workspace reusable UTM parameter sets.
CREATE TABLE "utm_templates" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "term" TEXT,
    "content" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "utm_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "utm_templates_workspaceId_name_key" ON "utm_templates"("workspaceId", "name");
ALTER TABLE "utm_templates" ADD CONSTRAINT "utm_templates_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
