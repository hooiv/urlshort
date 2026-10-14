CREATE TABLE "workspace_auto_tag_rules" (
    "workspaceId" TEXT NOT NULL,
    "rules" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "workspace_auto_tag_rules_pkey" PRIMARY KEY ("workspaceId")
);
ALTER TABLE "workspace_auto_tag_rules" ADD CONSTRAINT "workspace_auto_tag_rules_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
