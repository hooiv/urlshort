-- Link SCIM identities to their managed user records.
ALTER TABLE "scim_identities"
  ADD CONSTRAINT "scim_identities_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "scim_identities_userId_idx" ON "scim_identities"("userId");
