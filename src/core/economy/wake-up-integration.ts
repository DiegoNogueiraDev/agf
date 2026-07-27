/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 */

/**
 * §node_50a7647acb52 — Wake-up pack integration for session:start hooks.
 *
 * Wraps the existing wake-up L0-L3 orchestrator with a simple hook API
 * that produces a compact, injectable context pack.
 */

import {
  orchestrateWakeUp,
  type WakeUpResult,
  type Layer0Profile,
  type MemoryItem,
  DEFAULT_WAKEUP_CONFIG,
  type WakeUpConfig,
} from './wake-up.js'
import { searchL2, searchL3 } from './wake-up-l2-l3.js'

export type { WakeUpResult }

export interface WakeUpHookOptions {
  identity: string
  capabilities: string[]
  constraints: string[]
  memoryItems?: MemoryItem[]
  /**
   * Optional on-demand query. When set, L2/L3 are produced by `searchL2`/`searchL3`
   * (token-overlap ranking + BM25/RRF fusion, each capped by its own token budget)
   * instead of the unranked, unbounded `orchestrateWakeUp` default.
   */
  query?: string
  config?: Partial<WakeUpConfig>
}

/**
 * Formats a WakeUpResult as human-readable output for logs / TUI.
 */
export function formatWakeUp(result: WakeUpResult): string {
  const lines: string[] = []
  lines.push(result.layers.L0)
  if (result.layers.L1) lines.push(result.layers.L1)
  if (result.layers.L2) lines.push(result.layers.L2)
  if (result.layers.L3) lines.push(result.layers.L3)
  lines.push(`--- ${result.tokenCounts.total} tok (${result.tokenCounts.remaining} remaining)`)
  lines.push(`--- ${result.metrics.itemsIncluded}/${result.metrics.itemsConsidered} items`)
  return lines.join('\n')
}

/**
 * Formats a WakeUpResult as a markdown block for system prompt injection.
 * More compact than formatWakeUp — uses minimal formatting.
 */
export function injectWakeUp(result: WakeUpResult): string {
  const parts: string[] = ['## Wake-Up Pack']
  if (result.layers.L0) parts.push(result.layers.L0)
  if (result.layers.L1) parts.push(result.layers.L1)
  return parts.join('\n')
}

/**
 * Creates a session:start hook that produces a WakeUpResult.
 *
 * Usage:
 *   const hook = createWakeUpHook({ identity: 'my-agent', capabilities: [...], constraints: [...] })
 *   const result = await hook()
 *   const pack = injectWakeUp(result)
 */
export function createWakeUpHook(options: WakeUpHookOptions): () => WakeUpResult {
  const profile: Layer0Profile = {
    identity: options.identity,
    capabilities: options.capabilities,
    constraints: options.constraints,
  }

  const config: WakeUpConfig = {
    ...DEFAULT_WAKEUP_CONFIG,
    ...options.config,
  }

  return (): WakeUpResult => {
    const result = orchestrateWakeUp(profile, options.memoryItems ?? [], [], '', [], '', config)
    if (!options.query || !options.memoryItems?.length) {
      return result
    }
    const l2 = searchL2(options.memoryItems, options.query)
    const l3 = searchL3(options.memoryItems, options.query)
    return {
      ...result,
      layers: {
        ...result.layers,
        ...(l2.content ? { L2: l2.content } : {}),
        ...(l3.content ? { L3: l3.content } : {}),
      },
    }
  }
}
