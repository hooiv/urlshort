import { prisma } from '@/lib/prisma'
import { createHash } from 'node:crypto'

export type FeatureFlagValue = { enabled: boolean; config: Record<string, unknown> }
export function rolloutBucket(key:string, workspaceId?:string|null):number{return parseInt(createHash('sha256').update(`${workspaceId ?? 'global'}:${key}`).digest('hex').slice(0,8),16)%100}
export function evaluateRollout(enabled:boolean, rolloutPercent:number, key:string, workspaceId?:string|null):boolean{return enabled && rolloutPercent>=100 || (enabled && rolloutPercent>0 && rolloutBucket(key,workspaceId)<rolloutPercent)}
export async function getFeatureFlag(key: string, workspaceId?: string | null): Promise<FeatureFlagValue> {
  const row = await prisma.featureFlag.findFirst({ where: { key, OR: [{ workspaceId }, { workspaceId: null }] }, orderBy: { workspaceId: 'desc' } })
  if (!row || !row.enabled) return { enabled: false, config: {} }
  if (row.rolloutPercent < 100) {
    const bucket = parseInt(createHash('sha256').update(`${workspaceId ?? 'global'}:${key}`).digest('hex').slice(0, 8), 16) % 100
    if (bucket >= row.rolloutPercent) return { enabled: false, config: {} }
  }
  let config: Record<string, unknown> = {}
  try { config = row.configJson ? JSON.parse(row.configJson) : {} } catch { config = {} }
  return { enabled: true, config }
}
