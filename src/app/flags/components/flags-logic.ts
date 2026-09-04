import { formatNumber } from '@/lib/format'

export interface WorkspaceOption {
  id: string
  name: string
  role: string
}

export interface WorkspaceFlag {
  key: string
  enabled: boolean
  rolloutPercent: number
  config: Record<string, unknown>
}

const FLAG_KEY_PATTERN = /^[-a-z0-9_.]{1,100}$/

export function isValidFlagKey(key: string): boolean {
  return FLAG_KEY_PATTERN.test(key.trim())
}

/** Trim and normalize user input to the server-accepted flag key shape. */
export function normalizeFlagKey(key: string): string {
  return key.trim()
}

/** Clamp arbitrary input to the server-accepted 0–100 integer range. */
export function clampRolloutPercent(value: number): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(100, Math.max(0, Math.trunc(value)))
}

export function buildWorkspacesUrl(): string {
  return '/api/workspaces'
}

/** Workspace ids are path segments; encode them so slashes cannot break the route. */
export function buildWorkspaceFlagsUrl(workspaceId: string): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/flags`
}

export function getFlagSaveError(workspaceId: string, key: string): string | null {
  if (!workspaceId) return 'Select a workspace first'
  if (!key.trim()) return 'Enter a flag key'
  if (!isValidFlagKey(key)) return 'Flag key may only contain a–z, 0–9, dash, underscore, or dot'
  return null
}

/** Display helper kept beside the flag editor; reuses the shared number formatter. */
export function formatRolloutPercent(rolloutPercent: number): string {
  return `${formatNumber(clampRolloutPercent(rolloutPercent))}% rollout`
}

export function formatFlagStatus(flag: WorkspaceFlag): string {
  return `${flag.enabled ? 'enabled' : 'disabled'} · ${formatRolloutPercent(flag.rolloutPercent)}`
}
