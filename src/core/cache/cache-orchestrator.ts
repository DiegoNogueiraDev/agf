import type { QueryCategory, CacheRegistration, UnifiedStats } from './cache-types.js'
import { CacheKeyComposer } from './cache-key-composer.js'
import { CacheRouter } from './cache-router.js'
import { UnifiedStatsAggregator } from './unified-stats.js'

export class CacheOrchestrator {
  readonly keyComposer: CacheKeyComposer
  readonly router: CacheRouter
  readonly aggregator: UnifiedStatsAggregator

  constructor() {
    this.keyComposer = new CacheKeyComposer()
    this.router = new CacheRouter()
    this.aggregator = new UnifiedStatsAggregator()
  }

  composeKey(toolName: string, args: unknown, schemaVersion = 1): string {
    return this.keyComposer.compose(toolName, args, schemaVersion)
  }

  composeKey32(toolName: string, args: unknown, schemaVersion = 1): string {
    return this.keyComposer.compose32(toolName, args, schemaVersion)
  }

  classify(toolName: string): QueryCategory {
    return this.router.classify(toolName)
  }

  register(cache: CacheRegistration): void {
    this.aggregator.register(cache)
  }

  getStats(): UnifiedStats {
    return this.aggregator.snapshot()
  }

  invalidateAll(reason: string): void {
    this.aggregator.invalidateAll(reason)
  }
}

export const cacheOrchestrator = new CacheOrchestrator()
