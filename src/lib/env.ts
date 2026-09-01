/**
 * Startup environment validation.
 *
 * Importing this module (via `src/lib/env.ts` re-exports or directly in
 * instrumentation) fails fast with a clear message instead of letting every
 * redirect 500 at request time when a secret is missing.
 */

type RequiredEnv = {
  QL_ATTRIBUTION_SECRET: string
  CRON_SECRET?: string
}

let cached: RequiredEnv | null = null

export function requireEnv(): RequiredEnv {
  if (cached) return cached
  const secret = process.env.QL_ATTRIBUTION_SECRET
  const cronSecret = process.env.CRON_SECRET
  const problems: string[] = []
  if (!secret) problems.push('QL_ATTRIBUTION_SECRET is required (used to sign attribution tokens)')
  else if (secret.length < 32) problems.push('QL_ATTRIBUTION_SECRET must be at least 32 characters')
  else if (/dev-only|change-this|changeme|example|placeholder/i.test(secret) && process.env.NODE_ENV === 'production') {
    problems.push('QL_ATTRIBUTION_SECRET looks like a placeholder — generate a real secret in production')
  }
  if (process.env.NODE_ENV === 'production' && !cronSecret) problems.push('CRON_SECRET is required in production')
  if (problems.length) {
    throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`)
  }
  cached = { QL_ATTRIBUTION_SECRET: secret as string, CRON_SECRET: cronSecret }
  return cached
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}
