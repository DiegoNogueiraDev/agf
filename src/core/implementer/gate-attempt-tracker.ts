/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Gate attempt counter per task (metadata.gateAttempts) with forced escalation
 * on the 3rd consecutive gate failure (Goldratt: stop pumping the bottleneck;
 * Peopleware: infinite loop burns resource without signal).
 *
 * Every gate/test-cmd failure on a task in_progress increments the counter.
 * On the 3rd consecutive red, the envelope returns ESCALATION_REQUIRED and
 * further attempts are refused until the task leaves in_progress or --force.
 * Success (all gates green) zeros the counter.
 *
 * Relies on node.metadata (existing TEXT column, no schema change).
 */

import type { SqliteStore } from '../store/sqlite-store.js'

export const MAX_GATE_ATTEMPTS = 3

export const ESCALATION_CODE = 'ESCALATION_REQUIRED' as const

export function getGateAttempts(metadata: Record<string, unknown> | undefined): number {
  if (!metadata) return 0
  const raw = metadata.gateAttempts
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw)
  return 0
}

export function incrementGateAttempt(store: SqliteStore, nodeId: string): { attempts: number; escalated: boolean } {
  const node = store.getNodeById(nodeId)
  if (!node) return { attempts: 0, escalated: false }
  const current = getGateAttempts(node.metadata)
  const next = current + 1
  store.updateNode(nodeId, {
    metadata: { ...node.metadata, gateAttempts: next },
  })
  return { attempts: next, escalated: next >= MAX_GATE_ATTEMPTS }
}

export function resetGateAttempts(store: SqliteStore, nodeId: string): void {
  const node = store.getNodeById(nodeId)
  if (!node || node.metadata?.gateAttempts === undefined) return
  const { gateAttempts: _, ...rest } = node.metadata
  store.updateNode(nodeId, { metadata: Object.keys(rest).length > 0 ? rest : {} })
}

export function buildEscalationApplyVia(taskId: string, title: string): string {
  return `agf node add --type bug --title "Gate escalation: ${title}" --description "Auto-escalated after ${MAX_GATE_ATTEMPTS} consecutive gate failures on ${taskId}" --parent ${taskId}`
}
