/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * MemoryManager — orchestrates builtin + optional external memory providers.
 * Ported from hermes-agent-main memory orchestration pattern.
 * Deterministic — zero LLM. Deduplicates by content hash.
 */

import { createHash } from 'node:crypto'
import type { MemoryProvider, MemoryResult, ConversationContext } from './provider-interface.js'
import { createLogger } from '../utils/logger.js'
import { OperationError } from '../utils/errors.js'

const log = createLogger({ layer: 'core', source: 'memory-manager.ts' })

const MAX_EXTERNAL_PROVIDERS = 1

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

export class MemoryManager {
  private readonly builtin: MemoryProvider
  private readonly external: MemoryProvider | undefined

  constructor(builtin: MemoryProvider, ...externalProviders: Array<MemoryProvider | undefined>) {
    const defined = externalProviders.filter((p): p is MemoryProvider => p !== undefined)
    if (defined.length > MAX_EXTERNAL_PROVIDERS) {
      throw new OperationError(`MemoryManager: maxExternalProviders=${MAX_EXTERNAL_PROVIDERS}, got ${defined.length}`)
    }
    this.builtin = builtin
    this.external = defined[0]
  }

  async prefetchAll(ctx: ConversationContext): Promise<MemoryResult[]> {
    const [builtinResults, externalResults] = await Promise.all([
      this.builtin.prefetch(ctx),
      this.external
        ? this.external.prefetch(ctx).catch((err: unknown) => {
            log.warn('External memory provider prefetch failed — using builtin only', {
              provider: this.external!.name,
              error: err instanceof Error ? err.message : String(err),
            })
            return [] as MemoryResult[]
          })
        : Promise.resolve([] as MemoryResult[]),
    ])

    const seen = new Set<string>()
    const merged: MemoryResult[] = []

    for (const result of [...builtinResults, ...externalResults]) {
      const hash = contentHash(result.content)
      if (!seen.has(hash)) {
        seen.add(hash)
        merged.push(result)
      }
    }

    return merged
  }

  buildFencedBlock(results: MemoryResult[]): string {
    const body = results.map((r) => r.content).join('\n\n')
    return `<memory-context>\n${body}\n</memory-context>\n`
  }

  async syncTurnAll(turn: { role: string; content: string }): Promise<void> {
    const tasks: Promise<void>[] = [this.builtin.syncTurn(turn)]

    if (this.external) {
      tasks.push(
        this.external.syncTurn(turn).catch((err: unknown) => {
          log.warn('External memory provider syncTurn failed', {
            provider: this.external!.name,
            error: err instanceof Error ? err.message : String(err),
          })
        }),
      )
    }

    await Promise.all(tasks)
  }
}
