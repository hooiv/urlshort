CREATE TABLE "workspace_link_policies" (
    "workspaceId" TEXT NOT NULL,
    "policy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "workspace_link_policies_pkey" PRIMARY KEY ("workspaceId")
);
ALTER TABLE "workspace_link_policies" ADD CONSTRAINT "workspace_link_policies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
