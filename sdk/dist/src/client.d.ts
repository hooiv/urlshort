import { AuthenticationError, NotFoundError, QuickLinkError, RateLimitError, ValidationError } from './generated.js';
/** Default per-request timeout (ms) used when neither client nor call sets one. */
export declare const DEFAULT_TIMEOUT_MS = 15000;
/** True for any error produced from a non-2xx QuickLink API response. */
export declare function isQuickLinkError(error: unknown): error is QuickLinkError;
/** True for HTTP 429 responses. Read `error.retryAfter` (seconds) before retrying. */
export declare function isRateLimitError(error: unknown): error is RateLimitError;
/** True for HTTP 401/403 responses (missing, revoked, or under-permissioned key). */
export declare function isAuthenticationError(error: unknown): error is AuthenticationError;
/** True for HTTP 400/409/422 responses (caller-supplied data was rejected). */
export declare function isValidationError(error: unknown): error is ValidationError;
/** True for HTTP 404 responses (unknown or invisible resource). */
export declare function isNotFoundError(error: unknown): error is NotFoundError;
/**
 * Retry delay in milliseconds derived from a rate-limit error's `retryAfter`
 * (seconds). Returns undefined when the server sent no hint.
 */
export declare function retryAfterMs(error: unknown): number | undefined;
/**
 * Structural check for `qlk_<prefix>_<secret>` API keys. Inspects shape only;
 * never logs or transmits the value.
 */
export declare function isApiKeyFormat(value: unknown): value is string;
