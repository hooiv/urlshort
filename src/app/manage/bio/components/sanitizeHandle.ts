/**
 * Pure handle sanitizing/validation for bio-profile creation.
 *
 * Kept separate from the React form so the rules are unit-testable without
 * a DOM. The form applies {@link sanitizeHandle} on every keystroke and
 * {@link validateHandle} on submit; the API call shape is unchanged.
 */

export const MAX_HANDLE_LENGTH = 64;

/** Lowercase, strip characters the route (`/b/[handle]`) cannot serve. */
export function sanitizeHandle(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, MAX_HANDLE_LENGTH);
}

/** Returns a user-facing error, or null when the handle may be submitted. */
export function validateHandle(raw: string): string | null {
  const handle = sanitizeHandle(raw.trim());
  if (!handle) return 'Handle is required';
  if (raw.trim().length > MAX_HANDLE_LENGTH) {
    return `Handle must be ${MAX_HANDLE_LENGTH} characters or fewer`;
  }
  return null;
}
