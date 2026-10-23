ALTER TABLE "folders" ADD COLUMN "defaultTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "defaultUtmTemplateId" TEXT;
