import { requireEnv } from '@/lib/env'

/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Fails fast if required environment variables are missing or invalid.
 */
export async function register() {
  requireEnv()
}

export { register as default }
