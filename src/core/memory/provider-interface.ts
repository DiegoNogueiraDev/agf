/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-hermes — E11-T1: Memory provider interface + registry.
 * Pluggable memory backends for prefetch/syncTurn lifecycle.
 */

import { createLogger } from '../utils/logger.js'

const log = createLogger({ layer: 'core', source: 'provider-interface.ts' })

export interface ConversationContext {
  sessionId: string
  recentMessages: Array<{ role: string; content: string }>
}

export interface MemoryResult {
  id: string
  content: string
  source: string
  score?: number
  metadata?: Record<string, unknown>
}

export interface MemoryProvider {
  readonly name: string
  prefetch(ctx: ConversationContext): Promise<MemoryResult[]>
  syncTurn(turn: { role: string; content: string }): Promise<void>
  getToolSchemas(): unknown[]
}

/**
 * Registry of pluggable memory providers.
 * Multiple providers can be registered; `prefetchAll` merges and deduplicates results.
 */
export class MemoryProviderRegistry {
  private readonly providers = new Map<string, MemoryProvider>()

  registerProvider(provider: MemoryProvider): void {
    this.providers.set(provider.name, provider)
    log.debug('memory:provider:registered', { name: provider.name })
  }

  getProviders(): MemoryProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Call prefetch() on all registered providers in parallel.
   * Results are merged and deduplicated by `id` — later provider wins on conflict.
   * Providers that throw are skipped with a warning.
   */
  async prefetchAll(ctx: ConversationContext): Promise<MemoryResult[]> {
    const providerList = this.getProviders()
    if (providerList.length === 0) return []

    const settled = await Promise.allSettled(
      providerList.map((p) => p.prefetch(ctx).then((results) => ({ name: p.name, results }))),
    )

    const merged = new Map<string, MemoryResult>()
    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        log.warn('memory:provider:prefetch:fail', { error: String(outcome.reason) })
        continue
      }
      for (const result of outcome.value.results) {
        merged.set(result.id, result)
      }
    }

    return Array.from(merged.values())
  }
}
