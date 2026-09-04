// Hand-written ergonomic helpers for @quicklink/sdk. NOT generated — safe to edit.
//
// The generated runtime (types, QuickLinkClient, createClient, typed errors)
// lives in ./generated.ts. This module only adds small, dependency-free
// utilities on top of it and is re-exported by ../index.ts.
import { AuthenticationError, NotFoundError, QuickLinkError, RateLimitError, ValidationError, } from './generated.js';
/** Default per-request timeout (ms) used when neither client nor call sets one. */
export const DEFAULT_TIMEOUT_MS = 15000;
/** True for any error produced from a non-2xx QuickLink API response. */
export function isQuickLinkError(error) {
    return error instanceof QuickLinkError;
}
/** True for HTTP 429 responses. Read `error.retryAfter` (seconds) before retrying. */
export function isRateLimitError(error) {
    return error instanceof RateLimitError;
}
/** True for HTTP 401/403 responses (missing, revoked, or under-permissioned key). */
export function isAuthenticationError(error) {
    return error instanceof AuthenticationError;
}
/** True for HTTP 400/409/422 responses (caller-supplied data was rejected). */
export function isValidationError(error) {
    return error instanceof ValidationError;
}
/** True for HTTP 404 responses (unknown or invisible resource). */
export function isNotFoundError(error) {
    return error instanceof NotFoundError;
}
/**
 * Retry delay in milliseconds derived from a rate-limit error's `retryAfter`
 * (seconds). Returns undefined when the server sent no hint.
 */
export function retryAfterMs(error) {
    if (error instanceof RateLimitError || error instanceof QuickLinkError) {
        return error.retryAfter === undefined ? undefined : error.retryAfter * 1000;
    }
    return undefined;
}
/**
 * Structural check for `qlk_<prefix>_<secret>` API keys. Inspects shape only;
 * never logs or transmits the value.
 */
export function isApiKeyFormat(value) {
    return typeof value === 'string' && /^qlk_[A-Za-z0-9_-]{4,64}_[A-Za-z0-9_-]{16,}$/.test(value);
}
