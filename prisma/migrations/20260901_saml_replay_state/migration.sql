CREATE TABLE "saml_relay_nonces" (
  "id" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "saml_relay_nonces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saml_relay_nonces_nonce_key" ON "saml_relay_nonces"("nonce");
CREATE INDEX "saml_relay_nonces_connectionId_expiresAt_idx" ON "saml_relay_nonces"("connectionId","expiresAt");
CREATE INDEX "saml_relay_nonces_consumedAt_expiresAt_idx" ON "saml_relay_nonces"("consumedAt","expiresAt");
