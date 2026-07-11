/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-hermes — E12-T2: Honcho user modeling provider.
 * Implements MemoryProvider, wrapping Honcho API with graceful fallback.
 *
 * Per ADR deterministic-first: no LLM calls in this module.
 * The dialectic engine (E12-T3) is pure computation, used post-fetch.
 */

import { createLogger } from '../utils/logger.js'
import { McpGraphError } from '../utils/errors.js'
import type { MemoryProvider, ConversationContext, MemoryResult } from './provider-interface.js'
import type { HonchoConfig } from '../../schemas/honcho.schema.js'

const log = createLogger({ layer: 'core', source: 'honcho-provider.ts' })

export type HonchoFetchFn = (ctx: ConversationContext) => Promise<MemoryResult[]>

export class HonchoProvider implements MemoryProvider {
  readonly name = 'honcho'

  constructor(
    private readonly config: HonchoConfig,
    private readonly fetchFn?: HonchoFetchFn,
  ) {}

  async prefetch(ctx: ConversationContext): Promise<MemoryResult[]> {
    try {
      const raw = this.fetchFn ? await this.fetchFn(ctx) : await this.fetchFromApi(ctx)

      return raw.map((r) => ({
        ...r,
        metadata: { ...r.metadata, fenced: true },
      }))
    } catch (err) {
      log.warn('honcho:prefetch:fallback', { reason: String(err) })
      return []
    }
  }

  async syncTurn(_turn: { role: string; content: string }): Promise<void> {
    // Honcho syncTurn would POST observations — no-op for now (deterministic-first).
  }

  getToolSchemas(): unknown[] {
    return []
  }

  private async fetchFromApi(_ctx: ConversationContext): Promise<MemoryResult[]> {
    const url = `${this.config.apiUrl}/v1/memories`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new McpGraphError(`Honcho API ${res.status}`)
      const data = (await res.json()) as { memories?: Array<{ id: string; content: string }> }
      return (data.memories ?? []).map((m) => ({
        id: `honcho:${m.id}`,
        content: m.content,
        source: 'honcho',
      }))
    } finally {
      clearTimeout(timeout)
    }
  }
}

/**
 * Builds a HonchoProvider from env vars, or undefined when HONCHO_API_URL is unset —
 * the wiring point for CLI surfaces that want an optional external memory provider.
 */
export function createHonchoProviderFromEnv(
  env: Partial<Record<string, string>>,
): HonchoProvider | undefined {
  const apiUrl = env.HONCHO_API_URL
  if (!apiUrl) return undefined

  const dialecticDepth = env.HONCHO_DIALECTIC_DEPTH === '2' ? 2 : env.HONCHO_DIALECTIC_DEPTH === '3' ? 3 : 1
  const sessionResolution =
    env.HONCHO_SESSION_RESOLUTION === 'per-directory' ||
    env.HONCHO_SESSION_RESOLUTION === 'per-repo' ||
    env.HONCHO_SESSION_RESOLUTION === 'global'
      ? env.HONCHO_SESSION_RESOLUTION
      : 'per-session'
  const observationMode = env.HONCHO_OBSERVATION_MODE === 'unified' ? 'unified' : 'directional'

  return new HonchoProvider({ apiUrl, dialecticDepth, sessionResolution, observationMode })
}
