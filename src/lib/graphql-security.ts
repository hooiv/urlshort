import { createHash } from 'node:crypto'
import { Kind, parse, type DocumentNode, type SelectionNode } from 'graphql'

export type QuerySecurity = { hash: string; depth: number; complexity: number; operation: string }
const MAX_DEPTH = 8
const MAX_COMPLEXITY = 80
const persisted = new Map<string, string>()

export function normalizeQuery(query: string): string { return query.replace(/\s+/g, ' ').trim() }
export function queryHash(query: string): string { return createHash('sha256').update(normalizeQuery(query)).digest('hex') }
export function registerPersistedQuery(query: string): string { const hash=queryHash(query); persisted.set(hash, query); return hash }
export function resolvePersistedQuery(hash: string): string | null { return persisted.get(hash) ?? null }

function fragmentMap(doc: DocumentNode) {
  return new Map(doc.definitions.filter((d): d is Extract<typeof d, { kind: 'FragmentDefinition' }> => d.kind===Kind.FRAGMENT_DEFINITION).map(d=>[d.name.value,d]))
}
export function analyzeGraphQLQuery(query: string): QuerySecurity {
  const doc=parse(query); const fragments=fragmentMap(doc); let maxDepth=0; let complexity=0
  const walk=(node: { selectionSet?: { selections: readonly SelectionNode[] } }, depth:number, seen=new Set<string>())=>{
    maxDepth=Math.max(maxDepth,depth)
    for(const sel of node.selectionSet?.selections ?? []) {
      if(sel.kind===Kind.FIELD){ complexity += depth + 1; if(sel.selectionSet) walk(sel,depth+1,seen) }
      else if(sel.kind===Kind.INLINE_FRAGMENT) walk(sel,depth,seen)
      else if(sel.kind===Kind.FRAGMENT_SPREAD && !seen.has(sel.name.value)){ const f=fragments.get(sel.name.value); if(f){ const next=new Set(seen); next.add(sel.name.value); walk(f,depth,next) } }
    }
  }
  for(const d of doc.definitions){ if(d.kind===Kind.OPERATION_DEFINITION){ walk(d,0); return {hash:queryHash(query),depth:maxDepth,complexity,operation:d.operation} } }
  throw new Error('No executable operation')
}
export function assertGraphQLSafe(query: string): QuerySecurity { const a=analyzeGraphQLQuery(query); if(a.depth>=MAX_DEPTH) throw new Error(`GraphQL query depth exceeds ${MAX_DEPTH}`); if(a.complexity>MAX_COMPLEXITY) throw new Error(`GraphQL query cost exceeds ${MAX_COMPLEXITY}`); return a }
export function __resetPersistedQueriesForTests(){persisted.clear()}
export const GRAPHQL_LIMITS={maxDepth:MAX_DEPTH,maxComplexity:MAX_COMPLEXITY}
