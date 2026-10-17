import crypto from 'crypto'

export const MIN_GRACE_HOURS = 0
export const MAX_GRACE_HOURS = 168
export const DEFAULT_GRACE_HOURS = 24

export interface SecretFields {
  secret: string
  previousSecret?: string | null
  previousSecretExpiresAt?: Date | null
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(24).toString('hex')
}

/** Secrets that should sign a delivery now: current first, then an unexpired previous one. */
export function activeWebhookSecrets(endpoint: SecretFields, now: Date = new Date()): string[] {
  const secrets = [endpoint.secret]
  if (endpoint.previousSecret && endpoint.previousSecretExpiresAt && endpoint.previousSecretExpiresAt > now) {
    secrets.push(endpoint.previousSecret)
  }
  return secrets
}

export type GraceResult = { ok: true; hours: number } | { ok: false; error: string }

/** graceHours: 0 revokes the old secret immediately; max 7 days. */
export function parseGraceHours(input: unknown): GraceResult {
  if (input === undefined || input === null) return { ok: true, hours: DEFAULT_GRACE_HOURS }
  if (typeof input !== 'number' || !Number.isFinite(input) || !Number.isInteger(input)) {
    return { ok: false, error: 'graceHours must be an integer' }
  }
  if (input < MIN_GRACE_HOURS || input > MAX_GRACE_HOURS) {
    return { ok: false, error: `graceHours must be between ${MIN_GRACE_HOURS} and ${MAX_GRACE_HOURS}` }
  }
  return { ok: true, hours: input }
}

export function buildRotation(current: string, graceHours: number, now: Date = new Date()) {
  const next = generateWebhookSecret()
  return {
    secret: next,
    data: {
      secret: next,
      previousSecret: graceHours > 0 ? current : null,
      previousSecretExpiresAt: graceHours > 0 ? new Date(now.getTime() + graceHours * 3_600_000) : null,
      secretRotatedAt: now,
    },
  }
}
