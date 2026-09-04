export type ConflictNodeInput = { id: string; label: string; priority: number; weight: number }
export type PositionedNode = ConflictNodeInput & { x: number; y: number }

export const CONFLICT_COLS = 4
export const CONFLICT_COL_WIDTH = 220
export const CONFLICT_ROW_HEIGHT = 85
export const CONFLICT_ORIGIN_X = 30
export const CONFLICT_ORIGIN_Y = 30

export function layoutConflictNodes(nodes: ConflictNodeInput[]): PositionedNode[] {
  return nodes.map((n, i) => ({
    ...n,
    x: CONFLICT_ORIGIN_X + (i % CONFLICT_COLS) * CONFLICT_COL_WIDTH,
    y: CONFLICT_ORIGIN_Y + Math.floor(i / CONFLICT_COLS) * CONFLICT_ROW_HEIGHT,
  }))
}

export function conflictGraphViewBox(nodeCount: number): { width: number; height: number } {
  return {
    width: Math.max(920, Math.ceil(nodeCount / CONFLICT_COLS) * CONFLICT_COL_WIDTH),
    height: Math.max(150, Math.ceil(nodeCount / CONFLICT_COLS) * CONFLICT_ROW_HEIGHT),
  }
}

export function truncateNodeLabel(label: string, max = 20): string {
  return label.slice(0, max)
}

export function isConflictGraphPayload(value: unknown): value is {
  nodes: ConflictNodeInput[]
  edges: { a: { id: string }; b: { id: string } }[]
} {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.nodes) && Array.isArray(v.edges)
}
