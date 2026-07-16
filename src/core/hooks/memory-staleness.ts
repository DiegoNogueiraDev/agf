/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * §EPIC-21.T07 — Memory staleness hook.
 * Pure decision: dado lista de memories com updatedAt, filtra os > 30d
 * sem refresh, ordena ASC, limita a 10. Caller (hook session:start) emite
 * 'session:memory-staleness' com a lista.
 */

const DAY_MS = 24 * 60 * 60 * 1000

export const STALE_AGE_DAYS = 30
export const STALENESS_LIMIT = 10

export interface MemoryRef {
  id: string
  title: string
  updatedAt: number
}

export interface StaleMemoryReport {
  id: string
  title: string
  ageDays: number
}

/** isMemoryStalenessDisabled —  */
export function isMemoryStalenessDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MCP_GRAPH_MEMORY_STALENESS === 'off'
}

/** findStaleMemories —  */
export function findStaleMemories(
  memories: MemoryRef[],
  nowMs: number = Date.now(),
  ageDays: number = STALE_AGE_DAYS,
  limit: number = STALENESS_LIMIT,
): StaleMemoryReport[] {
  const threshold = nowMs - ageDays * DAY_MS
  return memories
    .filter((m) => m.updatedAt < threshold)
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, limit)
    .map((m) => ({
      id: m.id,
      title: m.title,
      ageDays: Math.floor((nowMs - m.updatedAt) / DAY_MS),
    }))
}
