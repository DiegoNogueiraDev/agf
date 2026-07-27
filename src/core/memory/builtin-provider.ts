/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-hermes — E11-T2: Built-in memory provider.
 * Wraps the existing file-based memory system (memory-reader.ts) as a MemoryProvider.
 * Zero breaking change for existing callers.
 */

import { createLogger } from '../utils/logger.js'
import type { MemoryProvider, ConversationContext, MemoryResult } from './provider-interface.js'

const log = createLogger({ layer: 'core', source: 'builtin-provider.ts' })

export class BuiltinMemoryProvider implements MemoryProvider {
  readonly name = 'builtin'

  constructor(private readonly basePath: string) {}

  async prefetch(_ctx: ConversationContext): Promise<MemoryResult[]> {
    try {
      const { readAllMemories } = await import('./memory-reader.js')
      const memories = await readAllMemories(this.basePath)
      return memories.map((m) => ({
        id: `builtin:${m.name}`,
        content: m.content,
        source: 'builtin',
        metadata: { name: m.name, sizeBytes: m.sizeBytes },
      }))
    } catch (err) {
      log.debug('builtin-provider:prefetch:empty', { reason: String(err) })
      return []
    }
  }

  async syncTurn(_turn: { role: string; content: string }): Promise<void> {
    // Built-in provider does not auto-sync turns — memories are written explicitly via write_memory tool.
  }

  getToolSchemas(): unknown[] {
    return []
  }
}
