export type QueryCategory = 'graph_read' | 'graph_mutate' | 'knowledge' | 'code_intel' | 'session'

export interface CacheRegistration {
  name: string
  hits(): number
  misses(): number
  size(): number
  tokensSaved(): number
  invalidateAll(): void
}

export interface CacheStatsSnapshot {
  name: string
  hits: number
  misses: number
  size: number
  tokensSaved: number
  hitRate: number
}

export interface UnifiedStats {
  aggregator: CacheStatsSnapshot[]
  totalHits: number
  totalMisses: number
  totalTokensSaved: number
  totalCostSavedUsd: number
  globalHitRate: number
  timestamp: number
}

export interface CacheRouterConfig {
  graph_read: number
  graph_mutate: number
  knowledge: number
  code_intel: number
  session: number
}

export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n
  const prime = 0x00000100000001b3n
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i))
    hash = (hash * prime) & 0xffffffffffffffffn
  }
  return hash.toString(16).padStart(16, '0')
}
