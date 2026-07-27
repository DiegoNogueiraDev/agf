import type { CacheRegistration, CacheStatsSnapshot, UnifiedStats } from './cache-types.js'

const EST_COST_PER_TOKEN_USD = 0.000001

export class UnifiedStatsAggregator {
  private registrations: Map<string, CacheRegistration> = new Map()

  register(cache: CacheRegistration): void {
    this.registrations.set(cache.name, cache)
  }

  unregister(name: string): void {
    this.registrations.delete(name)
  }

  snapshot(): UnifiedStats {
    const snapshots: CacheStatsSnapshot[] = []
    let totalHits = 0
    let totalMisses = 0
    let totalTokens = 0

    for (const cache of this.registrations.values()) {
      const hits = cache.hits()
      const misses = cache.misses()
      const tokens = cache.tokensSaved()
      const total = hits + misses

      snapshots.push({
        name: cache.name,
        hits,
        misses,
        size: cache.size(),
        tokensSaved: tokens,
        hitRate: total > 0 ? (hits / total) * 100 : 0,
      })

      totalHits += hits
      totalMisses += misses
      totalTokens += tokens
    }

    const grandTotal = totalHits + totalMisses

    return {
      aggregator: snapshots,
      totalHits,
      totalMisses,
      totalTokensSaved: totalTokens,
      totalCostSavedUsd: totalTokens * EST_COST_PER_TOKEN_USD,
      globalHitRate: grandTotal > 0 ? (totalHits / grandTotal) * 100 : 0,
      timestamp: Date.now(),
    }
  }

  invalidateAll(_reason: string): void {
    for (const cache of this.registrations.values()) {
      cache.invalidateAll()
    }
  }

  registeredCount(): number {
    return this.registrations.size
  }
}
