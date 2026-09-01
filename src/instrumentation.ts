import { requireEnv } from '@/lib/env'
import { reportError } from '@/lib/error-tracking'
export async function register() { requireEnv() }
export async function onRequestError(error: unknown, request: { path?: string; method?: string }, context: unknown) {
  await reportError(error, { path: request?.path, method: request?.method, context: JSON.stringify(context).slice(0,1000) })
}
export { register as default }