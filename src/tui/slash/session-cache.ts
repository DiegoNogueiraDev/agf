import type { CommandPort, CacheStatsResult } from '../dispatch.js'
import type { AlgorithmsPort } from '../algorithms-port.js'
import { composeCacheKey, CURRENT_CACHE_SCHEMA, type GraphFingerprint } from './cache-key-composer.js'
import { toolCache } from '../../core/economy/cache/tool-cache.js'
import { cacheOrchestrator } from '../../core/cache/cache-orchestrator.js'
import type { CacheRegistration } from '../../core/cache/cache-types.js'
import { createLogger } from '../../core/utils/logger.js'

const log = createLogger({ layer: 'cli', source: 'tui/slash/session-cache.ts' })

const DEFAULT_CAPACITY = 128
const EST_TOKENS_PER_CACHED_RESULT = 200
const EST_TOKENS_PER_TOOL_CACHE_HIT = 300
const EST_COST_PER_TOKEN_USD = 0.000001

function fingerprintSig(s: { totalNodes: number; byStatus: Record<string, number> }): string {
  const statusStr = Object.entries(s.byStatus)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
  return `${s.totalNodes}|${statusStr}`
}

interface CacheEntry {
  result: unknown
  key: string
}

export interface CacheStats {
  hits: number
  misses: number
  size: number
  capacity: number
  evictions: number
}

export class SessionCache implements CommandPort {
  private readonly port: CommandPort
  private readonly capacity: number
  private readonly map = new Map<string, CacheEntry>()
  private hits = 0
  private misses = 0
  private evictions = 0
  private cachedFingerprint: GraphFingerprint | null = null
  private cachedFingerprintSig: string | null = null
  private lastStats: { totalNodes: number; byStatus: Record<string, number> } | null = null
  private schemaVersion = CURRENT_CACHE_SCHEMA

  constructor(port: CommandPort, capacity = DEFAULT_CAPACITY) {
    log.debug(`SessionCache created, capacity=${capacity}`)
    this.port = port
    this.capacity = capacity
    this.registerWithOrchestrator()
  }

  private registerWithOrchestrator(): void {
    const registration: CacheRegistration = {
      name: 'session',
      hits: () => this.hits,
      misses: () => this.misses,
      size: () => this.map.size,
      tokensSaved: () => this.hits * EST_TOKENS_PER_CACHED_RESULT,
      invalidateAll: () => this.invalidate(),
    }
    cacheOrchestrator.register(registration)
  }

  private getFingerprint(): GraphFingerprint {
    if (this.cachedFingerprint) return this.cachedFingerprint
    const s = this.port.stats()
    this.cachedFingerprint = {
      totalNodes: s.totalNodes,
      byStatus: { ...s.byStatus },
      lastMutationTs: Date.now(),
    }
    return this.cachedFingerprint
  }

  invalidate(): void {
    this.map.clear()
    this.cachedFingerprint = null
    this.cachedFingerprintSig = null
    this.lastStats = null
  }

  private refreshFingerprintIfChanged(): void {
    const s = this.port.stats()
    this.lastStats = s
    const sig = fingerprintSig(s)
    if (this.cachedFingerprintSig !== null && this.cachedFingerprintSig !== sig) {
      this.invalidate()
    }
    if (this.cachedFingerprint === null) {
      this.cachedFingerprint = { totalNodes: s.totalNodes, byStatus: { ...s.byStatus }, lastMutationTs: Date.now() }
      this.cachedFingerprintSig = sig
      this.lastStats = s
    }
  }

  cacheStats(): CacheStatsResult {
    const toolStats = toolCache.getStats()
    const tokensSaved = this.hits * EST_TOKENS_PER_CACHED_RESULT + toolStats.hits * EST_TOKENS_PER_TOOL_CACHE_HIT
    return {
      sessionHits: this.hits,
      sessionMisses: this.misses,
      sessionSize: this.map.size,
      sessionCapacity: this.capacity,
      sessionEvictions: this.evictions,
      toolCacheHits: toolStats.hits,
      toolCacheMisses: toolStats.misses,
      toolCacheInvalidations: toolStats.invalidations,
      tokensSavedEstimate: tokensSaved,
      costAvoidedUsd: tokensSaved * EST_COST_PER_TOKEN_USD,
    }
  }

  getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.map.size,
      capacity: this.capacity,
      evictions: this.evictions,
    }
  }

  private cacheKey(method: string, args = ''): string {
    if (this.schemaVersion !== CURRENT_CACHE_SCHEMA) {
      this.invalidate()
      this.schemaVersion = CURRENT_CACHE_SCHEMA
    }
    const fp = this.getFingerprint()
    return composeCacheKey(method, args, fp, CURRENT_CACHE_SCHEMA)
  }

  private cached<T>(method: string, compute: () => T): T {
    // findNext e getGraphNodes não são cacheados (são sensíveis ao tempo)
    if (method === 'findNext' || method === 'getGraphNodes') {
      return compute()
    }
    this.refreshFingerprintIfChanged()
    const key = this.cacheKey(method)
    const existing = this.map.get(key)
    if (existing) {
      this.hits++
      return existing.result as T
    }
    this.misses++
    const result = compute()
    if (this.map.size >= this.capacity) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) {
        this.map.delete(oldest)
        this.evictions++
      }
    }
    this.map.set(key, { result, key })
    return result
  }

  findNext(): { id: string; title: string; reason: string } | { blocked: true } | null {
    return this.port.findNext()
  }

  stats(): { totalNodes: number; byStatus: Record<string, number> } {
    // refreshFingerprintIfChanged() (called from cached()) already fetched stats —
    // reuse lastStats to avoid a second port.stats() call on the same access.
    return this.cached('stats', () => this.lastStats ?? this.port.stats())
  }

  metrics(): { total: number; costUsd: number; calls: number } {
    return this.cached('metrics', () => this.port.metrics())
  }

  status(): string {
    // Não cacheia: status reflete o estado vivo (tokens/cache) a cada chamada.
    return this.port.status()
  }

  getPhase(): string {
    return this.cached('getPhase', () => this.port.getPhase())
  }

  getModel(): string {
    return this.cached('getModel', () => this.port.getModel())
  }

  listSkills(phase?: string): Array<{ name: string; desc: string; category: string }> {
    return this.cached('listSkills', () => this.port.listSkills(phase))
  }

  getSkill(name: string): { name: string; body: string } | undefined {
    return this.cached('getSkill', () => this.port.getSkill(name))
  }

  principles(): Array<{ title: string; category: string; statement: string }> {
    return this.cached('principles', () => this.port.principles())
  }

  providers(): string[] {
    return this.cached('providers', () => this.port.providers())
  }

  // Não-cacheados: refletem/mutam o estado vivo do provider (setting do projeto).
  providerCurrent(): string {
    return this.port.providerCurrent()
  }

  providerSet(id: string): string {
    const r = this.port.providerSet(id)
    this.invalidate() // troca de provider muda modelo/status → limpa o cache de leitura
    return r
  }

  providerSetUrl(url: string): string {
    const r = this.port.providerSetUrl(url)
    this.invalidate()
    return r
  }

  quality(): { testScore: number; logScore: number; passed: boolean; totalModules: number; darkModules: string[] } {
    return this.cached('quality', () => this.port.quality())
  }

  // Não-cacheados: dependem de args (insights/gate/learning) ou mutam (heal).
  insights(sub: string): string {
    return this.port.insights(sub)
  }

  gate(phase: string): string {
    return this.port.gate(phase)
  }

  learning(sub: string): string {
    return this.port.learning(sub)
  }

  heal(arg: string): string {
    return this.port.heal(arg)
  }

  getGraphNodes(): Array<{
    id: string
    type: string
    title: string
    status: string
    parentId: string | null | undefined
    sprint: string | null | undefined
  }> {
    return this.port.getGraphNodes()
  }

  get algorithms(): AlgorithmsPort {
    return this.port.algorithms
  }
}
