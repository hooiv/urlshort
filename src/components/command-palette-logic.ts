export type PaletteAction = { name: string }

export function isPaletteToggleShortcut(key: string, metaKey: boolean, ctrlKey: boolean): boolean {
  return key === 'k' && (metaKey || ctrlKey)
}

export function isDismissKey(key: string): boolean {
  return key === 'Escape'
}

export function shouldSearchLinks(query: string): boolean {
  return query.trim().length >= 2
}

export function filterActions<T extends PaletteAction>(actions: T[], query: string): T[] {
  const q = query.toLowerCase()
  return actions.filter((a) => a.name.toLowerCase().includes(q))
}

export function getNextActiveIndex(
  current: number,
  total: number,
  direction: 1 | -1,
): number {
  if (total <= 0) return -1
  if (current < 0 || current >= total) return direction === 1 ? 0 : total - 1
  return (current + direction + total) % total
}

export function clampActiveIndex(current: number, total: number): number {
  if (total <= 0) return -1
  if (current < 0) return -1
  return Math.min(current, total - 1)
}
